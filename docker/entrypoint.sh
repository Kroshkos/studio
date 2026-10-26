#!/bin/bash
# Инициализация БД при первом запуске контейнера.
# Дальше все процессы (postgres, nest, nginx) поднимает supervisord.
set -e

export DB_USER="${DB_USER:-studio}"
export DB_PASSWORD="${DB_PASSWORD:-studio}"
export DB_NAME="${DB_NAME:-studio}"

PG_VER=$(pg_lsclusters -h | awk '{print $1}' | head -n1)
PG_CLUSTER=$(pg_lsclusters -h | awk '{print $2}' | head -n1)
export PG_VER PG_CLUSTER

echo "[entrypoint] PostgreSQL ${PG_VER}, кластер: ${PG_CLUSTER}"

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
    npx --yes prisma@6 migrate deploy
else
    echo "[entrypoint] prisma db push"
    npx --yes prisma@6 db push --skip-generate
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
