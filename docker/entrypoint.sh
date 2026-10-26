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

# В docker-образе postinst создаёт кластер, но при некоторых сборках/кэшах
# слой с данными может отсутствовать — инициализируем кластер при необходимости.
if [ ! -d "/var/lib/postgresql/${PG_VER}/${PG_CLUSTER}" ]; then
    echo "[entrypoint] каталог данных отсутствует, создаю кластер..."
    pg_dropcluster --stop "${PG_VER}" main 2>/dev/null || true
    # /run/postgresql может не существовать в контейнере (нет tmpfs от systemd)
    mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql
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
