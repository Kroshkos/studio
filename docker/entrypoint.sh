#!/bin/bash
# Инициализация БД при первом запуске контейнера.
# Дальше все процессы (postgres, nest, nginx) поднимает supervisord.
set -e

# Переопределение конфигурации через переменные окружения (K8s/docker run -e).
# Файл содержит строки вида NAME="${NAME:-default}" — source раскроет их,
# сохранив уже заданные снаружи значения.
if [ -f /etc/env-overrides.conf ]; then
    set -a
    # shellcheck disable=SC1091
    . /etc/env-overrides.conf
    set +a
fi

export DB_USER="${DB_USER:-studio}"
export DB_PASSWORD="${DB_PASSWORD:-studio}"
export DB_NAME="${DB_NAME:-studio}"

PG_VER=$(pg_lsclusters -h | awk '{print $1}' | head -n1)
PG_CLUSTER=$(pg_lsclusters -h | awk '{print $2}' | head -n1)
export PG_VER PG_CLUSTER

echo "[entrypoint] PostgreSQL ${PG_VER}, кластер: ${PG_CLUSTER}"

PG_DATA="/var/lib/postgresql/${PG_VER}/${PG_CLUSTER}"

# /run/postgresql может не существовать в контейнере (нет tmpfs от systemd);
# если поверх /var/lib/postgresql смонтирован volume, постинст-кластер виден
# как пустая директория без PG_VERSION — считаем такой кластер неинициализированным.
mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql
if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    echo "[entrypoint] каталог данных не инициализирован, пересоздаю кластер..."
    pg_dropcluster --stop "${PG_VER}" "${PG_CLUSTER}" 2>/dev/null || true
    rm -rf "${PG_DATA}"
    pg_createcluster --start "${PG_VER}" "${PG_CLUSTER}"
fi

# стартуем временный postgres для инициализации
pg_ctlcluster "${PG_VER}" "${PG_CLUSTER}" start

su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 || {
    echo "[entrypoint] создаю пользователя ${DB_USER}"
    su - postgres -c "psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}' CREATEDB;\""
}

su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || {
    echo "[entrypoint] создаю базу ${DB_NAME}"
    su - postgres -c "createdb -O ${DB_USER} ${DB_NAME}"
}

cd /app/backend

# ЭКОНОМИЯ RAM: на малых планах хостинга (512Mi и меньше) тяжёлые JVM-подобные
# утилиты Prisma (Query Engine, ~100-150MB RSS) могут ловить OOM / kill от
# cgroup-лимитера ("Insufficient RAM"). Node сам по себе тоже жрёт память,
# поэтому ограничиваем кучу явным лимитом — при нехватке Node упадёт Gracefully
# с понятной ошибкой вместо того чтобы быть убитым ОС без лога.
export NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=128"

# Применяем схему БД:
#   1) Если есть raw SQL миграции в prisma/migrations — просто выполняем их psql'ом
#      (это НЕ грузит Prisma Client/Engine в память, ~5 МБ vs 150+ МБ).
#   2) Иначе — если нет таблиц StudioConfig/Booking (значит база пустая или старая)
#      запускаем `prisma db push`, который создаст ВСЮ схему разом.
# Это позволяет выдерживать рамку на K8s/VPS уровня hobby/starter (<=512 MiB).
MIGRATIONS_DIR="prisma/migrations"
SCHEMA_FILE="prisma/schema.prisma"

apply_migrations_via_psql() {
    local url="${DATABASE_URL}"
    # превращаем postgresql://user:pass@host:port/db?schema=x в параметры для psql
    local hostport=$(echo "$url" | sed -E 's|.*@([^/?]+).*|\1|')
    local host=${hostport%:*} port=${hostport##*:}; [ "$port" = "$hostport" ] && port=5432
    local dbname=$(echo "$url" | sed -E 's|.*/([^/?]+)\?.*|\1|; s|.*/([^/?]+)$|\1|')
    local user=$(echo "$url" | sed -E 's|.*://([^:@]+).*|\1|')
    local pass=$(echo "$url" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    
    if [ ! -d "$MIGRATIONS_DIR" ]; then return 1; fi
    
    echo "[entrypoint] применяю миграции через psql (низкое потребление RAM)"
    for dir in $(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d | sort); do
        local sql="$dir/migration.sql"
        if [ -f "$sql" ]; then
            echo "  -> $sql"
            PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$dbname" -v ON_ERROR_STOP=1 -q < "$sql" || {
                echo "[entrypoint] WARNING: ошибка применения $sql"; return 1;
            }
        fi
    done
    return 0
}

needs_db_push() {
    # проверяем наличие ключевых таблиц через simple запрос к information_schema
    local url="${DATABASE_URL}"
    local hostport=$(echo "$url" | sed -E 's|.*@([^/?]+).*|\1|')
    local host=${hostport%:*} port=${hostport##*:}; [ "$port" = "$hostport" ] && port=5432
    local dbname=$(echo "$url" | sed -E 's|.*/([^/?]+)\?.*|\1|; s|.*/([^/?]+)$|\1|')
    local user=$(echo "$url" | sed -E 's|.*://([^:@]+).*|\1|')
    local pass=$(echo "$url" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    
    # если ни StudioConfig, ни DayBlock нет — схема не инициализирована
    local count=$(PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$dbname" -tAc \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('StudioConfig','DayBlock','TimeOverride');" 2>/dev/null || echo 0)
    [ "$count" -lt 3 ]
}

# ПРЯМОЕ ПРИМЕНЕНИЕ СХЕМЫ ЧЕРЕЗ POSTGRES C SQL (без Prisma CLI)
# Этот подход экономит RAM: не грузим Query Engine (~150MB), а делаем простой CREATE TABLE
direct_apply_schema_sql() {
    local url="${DATABASE_URL}"
    local hostport=$(echo "$url" | sed -E 's|.*@([^/?]+).*|\1|')
    local host=${hostport%:*} port=${hostport##*:}; [ "$port" = "$hostport" ] && port=5432
    local dbname=$(echo "$url" | sed -E 's|.*/([^/?]+)\?.*|\1|; s|.*/([^/?]+)$|\1|')
    local user=$(echo "$url" | sed -E 's|.*://([^:@]+).*|\1|')
    local pass=$(echo "$url" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    
    echo "[entrypoint] создаю таблицы напрямую через PostgreSQL SQL (минимум RAM)"
    
    # ШАГ 1: таблица конфигурации студии (основная запись с id=1)
    # Все поля — строки или массивы строк как в Prisma schema (без enum типов!)
    cat <<EOSQL | PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$dbname" -v ON_ERROR_STOP=1 -q
CREATE TABLE IF NOT EXISTS \"StudioConfig\" (
    id INTEGER PRIMARY KEY DEFAULT 1,
    \"blockedDays\" INTEGER[] DEFAULT '{}',
    \"msgTeacher\" TEXT NOT NULL DEFAULT '',
    \"msgStudent\" TEXT NOT NULL DEFAULT '',
    \"openTime\" VARCHAR(5) NOT NULL DEFAULT '09:00',
    \"closeTime\" VARCHAR(5) NOT NULL DEFAULT '17:00',
    \"slotDuration\" INTEGER NOT NULL DEFAULT 60,
    \"updatedAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Гарантируем существование записи с id=1
INSERT INTO \"StudioConfig\" (id, \"msgTeacher\", \"msgStudent\") 
VALUES (1, 'Студия недоступна для преподавателей', 'Студия недоступна для студентов') 
ON CONFLICT (id) DO NOTHING;
EOSQL

    # ШАГ 2: блокировки по дням и времени (audience = строка "teacher"/"student"/"all")
    cat <<EOSQL | PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$dbname" -v ON_ERROR_STOP=1 -q
CREATE TABLE IF NOT EXISTS \"DayBlock\" (
    id SERIAL PRIMARY KEY,
    \"configId\" INTEGER NOT NULL REFERENCES \"StudioConfig\"(id) ON DELETE CASCADE,
    audience VARCHAR(20) NOT NULL,
    \"dateFrom\" DATE NOT NULL,
    \"dateTo\" DATE NOT NULL,
    \"timeFrom\" VARCHAR(5),
    \"timeTo\" VARCHAR(5),
    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_day_block_config ON \"DayBlock\"(\"configId\");
CREATE INDEX IF NOT EXISTS idx_day_block_dates ON \"DayBlock\"(\"dateFrom\", \"dateTo\");
EOSQL

    # ШАГ 3: индивидуальные изменения слотов (original/newTime как TIME, duration в минутах)
    cat <<EOSQL | PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$dbname" -v ON_ERROR_STOP=1 -q
CREATE TABLE IF NOT EXISTS \"TimeOverride\" (
    id SERIAL PRIMARY KEY,
    \"configId\" INTEGER NOT NULL REFERENCES \"StudioConfig\"(id) ON DELETE CASCADE,
    original TIME NOT NULL,
    \"newTime\" TIME,
    duration INTEGER,
    deleted BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(\"configId\", original)
);
CREATE INDEX IF NOT EXISTS idx_time_override_config ON \"TimeOverride\"(\"configId\");
EOSQL

    # ШАГ 4: записи о бронированиях
    cat <<EOSQL | PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$dbname" -v ON_ERROR_STOP=1 -q
CREATE TABLE IF NOT EXISTS \"Booking\" (
    id SERIAL PRIMARY KEY,
    studio VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    \"teacherName\" VARCHAR(255),
    \"studentName\" VARCHAR(255),
    purpose TEXT,
    \"contactPhone\" VARCHAR(20),
    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \"updatedAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(studio, date, time)
);
CREATE INDEX IF NOT EXISTS idx_booking_date_studio ON \"Booking\"(date, studio);
CREATE INDEX IF NOT EXISTS idx_booking_teacher ON \"Booking\"(\"teacherName\");
CREATE INDEX IF NOT EXISTS idx_booking_student ON \"Booking\"(\"studentName\");
EOSQL

    echo "[entrypoint] таблицы успешно созданы через прямой SQL"
    return 0
}

if apply_migrations_via_psql; then
    echo "[entrypoint] миграции применены"
elif needs_db_push; then
    # Сначала пробуем прямое применение схемы через psql (экономия RAM!)
    if direct_apply_schema_sql; then
        echo "[entrypoint] схема готова"
    else
        echo "[entrypoint] ERROR: прямое применение схемы не удалось."
        echo "[entrypoint] Возможно проблема с правами или синтаксисом SQL."
        exit 1
    fi
else
    echo "[entrypoint] основные таблицы уже есть — пропускаем создание схемы"
fi

# сид-данные (скрипт идемпотентен)
# ВАЖНО: seed.cjs лежит в dist/ (см. Dockerfile: cp dist-seed/seed.js dist/seed.cjs),
# раньше здесь было `node seed.cjs` из /app/backend — MODULE_NOT_FOUND и пустая база.
if [ "${RUN_SEED:-true}" = "true" ]; then
    echo "[entrypoint] посев начальных данных"
    node dist/seed.cjs || echo "[entrypoint] WARNING: seed завершился с ошибкой"
fi

# останавливаем временный postgres — его запустит supervisord
pg_ctlcluster "${PG_VER}" "${PG_CLUSTER}" stop

# 3) штатно завершает работу при SIGTERM/SIGINT (docker stop): шлём TERM всей
#    группе процессов supervisord — тот остановит программы и выйдет, а мы
#    подхватим код завершения. Без trap'а bash умирал бы от сигнала сразу,
#    postgres убивался SIGKILL посреди работы, и на следующем старте backend
#    ловил ECONNREFUSED: NestJS печатал ошибку в bootstrap().catch(...) и
#    завершался с кодом 0 -> "exited: backend (exit status 0)" -> FATAL.
echo "[entrypoint] инициализация завершена, запускаю ${*}"
sup_pid=""
term_all() { [ -n "${sup_pid}" ] && kill -TERM -"${sup_pid}" 2>/dev/null; }
trap term_all TERM INT
setsid "$@" &
sup_pid=$!
wait "${sup_pid}"
rc=$?
trap - TERM INT
exit "${rc}"
