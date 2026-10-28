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

# DB-параметры из DATABASE_URL (глобальные переменные для хелперов ниже)
DBH=""; DBP=""; DBN=""; DBU=""; DBPASS=""
parse_db_url() {
    local url="${DATABASE_URL}"
    local hostport=$(echo "$url" | sed -E 's|.*@([^/?]+).*|\1|')
    DBH=${hostport%:*}; DBP=${hostport##*:}; [ "$DBP" = "$hostport" ] && DBP=5432
    DBN=$(echo "$url" | sed -E 's|.*/([^/?]+)\?.*|\1|; s|.*/([^/?]+)$|\1|')
    DBU=$(echo "$url" | sed -E 's|.*://([^:@]+).*|\1|')
    DBPASS=$(echo "$url" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
}
parse_db_url

psql_db() {
    PGPASSWORD="$DBPASS" psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DBN" -v ON_ERROR_STOP=1 -q "$@"
}

missing_count() {
    # сколько таблиц из списка $1 (через пробел) ОТСУТСТВУЮТ в public.
    # SQL проверяет принадлежность каждой таблицы списку ИМЕННО ЦЕЛИКОМ: если
    # найдена любая таблица вне целевого набора — считаем, что это чужая схема
    # (например, старая Booking(studio,date,time)) и возвращаем 999 -> пересоздать всё.
    local list_sql="" t
    for t in $1; do list_sql="${list_sql}'${t}',"; done
    list_sql=${list_sql%,}
    psql_db -tAc "SELECT CASE WHEN COUNT(*) = 0 THEN 8 WHEN bool_and(tablename IN (${list_sql})) AND COUNT(*) >= 8 THEN 0 ELSE 999 END FROM pg_tables WHERE schemaname='public';" 2>/dev/null \
        | tr -d '[:space:]' || echo 999
}

# ПРЯМОЕ ПРИМЕНЕНИЕ ВСЕЙ СХЕМЫ ЧЕРЕЗ psql (без Prisma CLI / Query Engine — экономия RAM).
# Дамп соответствует prisma/schema.prisma 1:1 (типы, имена, индексы, @@map, @default, @updatedAt).
apply_full_schema_sql() {
    echo "[entrypoint] создаю ВСЮ схему БД напрямую через PostgreSQL SQL (минимум RAM)"

    psql_db <<'EOSQL'
CREATE TABLE IF NOT EXISTS "User" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    "personId" INTEGER,
    "roleName" TEXT
);
CREATE TABLE IF NOT EXISTS "UserRole" (
    id SERIAL PRIMARY KEY,
    v0 TEXT NOT NULL UNIQUE
);
DO $$ BEGIN
    ALTER TABLE "User" ADD CONSTRAINT FK_User_roleName
        FOREIGN KEY ("roleName") REFERENCES "UserRole"(v0) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- casbin-адаптер ожидает именно такую таблицу (Prisma @@map("casbin_rule"))
CREATE TABLE IF NOT EXISTS casbin_rule (
    id SERIAL PRIMARY KEY,
    ptype TEXT NOT NULL,
    v0 TEXT, v1 TEXT, v2 TEXT, v3 TEXT, v4 TEXT, v5 TEXT
);
CREATE TABLE IF NOT EXISTS "Department" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- enum создаём только если его нет (CREATE TYPE не поддерживает IF NOT EXISTS)
DO $$ BEGIN
    CREATE TYPE "BookingStage" AS ENUM ('AWAITING_RECORD','RECORDING','PROCESSING','SENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "Booking" (
    id TEXT PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    purpose TEXT,
    role TEXT NOT NULL,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    "dateLabel" TEXT,
    stage "BookingStage" NOT NULL DEFAULT 'AWAITING_RECORD',
    "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS Booking_departmentId_idx ON "Booking"("departmentId");
CREATE INDEX IF NOT EXISTS Booking_date_slot_idx ON "Booking"(date, slot);
DO $$ BEGIN
    ALTER TABLE "Booking" ADD CONSTRAINT Booking_departmentId_fkey
        FOREIGN KEY ("departmentId") REFERENCES "Department"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "StudioConfig" (
    id INTEGER PRIMARY KEY DEFAULT 1,
    "blockedDays" INTEGER[] NOT NULL DEFAULT '{}',
    "msgTeacher" TEXT NOT NULL,
    "msgStudent" TEXT NOT NULL,
    "openTime" TEXT NOT NULL DEFAULT '09:00',
    "closeTime" TEXT NOT NULL DEFAULT '17:00',
    "slotDuration" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "DayBlock" (
    id SERIAL PRIMARY KEY,
    "configId" INTEGER NOT NULL,
    audience TEXT NOT NULL,
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS DayBlock_configId_idx ON "DayBlock"("configId");
DO $$ BEGIN
    ALTER TABLE "DayBlock" ADD CONSTRAINT DayBlock_configId_fkey
        FOREIGN KEY ("configId") REFERENCES "StudioConfig"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "TimeOverride" (
    id SERIAL PRIMARY KEY,
    "configId" INTEGER NOT NULL,
    original TEXT NOT NULL,
    "newTime" TEXT,
    duration INTEGER,
    deleted BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("configId", original)
);
CREATE INDEX IF NOT EXISTS TimeOverride_configId_idx ON "TimeOverride"("configId");
DO $$ BEGIN
    ALTER TABLE "TimeOverride" ADD CONSTRAINT TimeOverride_configId_fkey
        FOREIGN KEY ("configId") REFERENCES "StudioConfig"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO "StudioConfig" (id, "msgTeacher", "msgStudent")
VALUES (1,
        'В этот день преподаватели не могут записаться. Студия работает в особом режиме.',
        'В этот день студия работает только для преподавателей. Студенты не могут записаться.')
ON CONFLICT (id) DO NOTHING;
EOSQL

    echo "[entrypoint] схема создана"
    return 0
}

ALL_TABLES="User UserRole casbin_rule Department Booking StudioConfig DayBlock TimeOverride"

if apply_migrations_via_psql; then
    echo "[entrypoint] миграции применены"
else
    # Раньше проверялось наличие всего 3 таблиц модуля studio — из-за этого seed
    # падал ("table public.UserRole does not exist"): таблицы студии от старого
    # direct_apply_schema_sql уже были, а User/UserRole/casbin_rule/Department — нет.
    # Теперь сверяется ВЕСЬ набор таблиц схемы (8 шт., см. prisma/schema.prisma).
    MISSING=$(missing_count "$ALL_TABLES")
    if [ "${MISSING}" != "0" ]; then
        echo "[entrypoint] схема неполная или чужая (код ${MISSING}) — применяю полную схему"
        if ! apply_full_schema_sql; then
            echo "[entrypoint] ERROR: прямое применение схемы не удалось."
            exit 1
        fi
    else
        echo "[entrypoint] все таблицы схемы уже есть — пропускаем создание"
    fi
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
