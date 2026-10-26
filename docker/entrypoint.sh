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

# применяем схему (если есть migrations — иначе db push)
if ls prisma/migrations >/dev/null 2>&1; then
    echo "[entrypoint] prisma migrate deploy"
    ./node_modules/.bin/prisma migrate deploy
else
    echo "[entrypoint] prisma db push"
    ./node_modules/.bin/prisma db push --skip-generate
fi

# сид-данные (скрипт идемпотентен)
if [ "${RUN_SEED:-true}" = "true" ]; then
    echo "[entrypoint] посев начальных данных"
    node seed.cjs || echo "[entrypoint] WARNING: seed завершился с ошибкой"
fi

# останавливаем временный postgres — его запустит supervisord
pg_ctlcluster "${PG_VER}" "${PG_CLUSTER}" stop

echo "[entrypoint] инициализация завершена, запускаю ${*}"
exec "$@"
