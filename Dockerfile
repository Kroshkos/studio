# =============================================================================
# Одно-контейнерная сборка всей платформы:
#   PostgreSQL 16 + NestJS (backend) + React/Vite (frontend, отдаётся через nginx)
# Собирается на multi-stage, внутри одного образа работают 3 процесса
# под управлением supervisord.
# =============================================================================
FROM node:20-bookworm AS build

USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# ---------- Backend (NestJS + Prisma) ----------
COPY studioBack/package.json studioBack/package-lock.json ./backend/
RUN cd backend && npm ci --legacy-peer-deps

COPY studioBack/ ./backend/
RUN cd backend \
    && npx prisma generate \
    # компилируем сид-скрипт в standalone CJS до основного билда:
    # tsc с CLI-флагами игнорирует tsconfig.json, поэтому alias @/* не ломает сборку.
    # (в проекте module=nodenext, а у пакета нет "type": "module" — расширение .cjs обязательно)
    && npx tsc src/seed.ts --outDir dist-seed --module commonjs \
       --moduleResolution node --target ES2022 --esModuleInterop --skipLibCheck \
    && npm run build \
    && cp dist-seed/seed.js dist/seed.cjs && rm -rf dist-seed \
    # кастомный output генератора Prisma (../generated/prisma) кладёт клиент в generated/,
    # а сгенерированный client.js делает require('.') — то есть обращается к пакету
    # @prisma/client по имени. Кладём его в node_modules, чтобы резолвился при запуске.
    && mkdir -p node_modules/generated \
    && rm -rf node_modules/generated/prisma \
    && cp -r generated/prisma node_modules/generated/prisma \
    # кладём рядом со скомпилированным кодом файл модели casbin —
    # он читается в рантайме из рабочей директории
    && cp Casbin_role_model.conf dist/Casbin_role_model.conf \
    # prisma.service.js (dist/modules/prisma/) импортирует клиент как '../../../generated/prisma',
    # что резолвится в backend/generated — это и есть папка generated/ от `prisma generate`,
    # поэтому дополнительно копировать её никуда не нужно.
    # (раньше здесь был `cp -r generated /build/backend/generated`, что при попадании в
    #  кэш-мусор слоя создавало рекурсию generated/generated — убрано намеренно)
    && rm -rf /build/backend/generated/generated

# ---------- Frontend (Vite/React) ----------
COPY studio-frontend/package.json studio-frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

COPY studio-frontend/ ./frontend/
RUN cd frontend && npm run build
# готовая статика лежит в /build/frontend/dist


# =============================================================================
# Финальный образ
# =============================================================================
FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        postgresql \
        nginx \
        supervisor \
        openssl \
        ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- приложение ---
WORKDIR /app

# бэкенд: только продакшен-зависимости + собранный код + сгенерированный prisma-клиент
COPY --from=build /build/backend/package.json /build/backend/package-lock.json /app/backend/
RUN cd /app/backend && npm ci --omit=dev --legacy-peer-deps
# Prisma CLI (dev-зависимость) нужен в рантайме для `prisma db push`/`migrate deploy` при старте контейнера
RUN cd /app/backend && npm install --no-save --legacy-peer-deps prisma@6.19.3
COPY --from=build /build/backend/node_modules/.prisma /app/backend/node_modules/.prisma
COPY --from=build /build/backend/node_modules/@prisma /app/backend/node_modules/@prisma
COPY --from=build /build/backend/node_modules/generated /app/backend/node_modules/generated
COPY --from=build /build/backend/dist /app/backend/dist
COPY --from=build /build/backend/prisma /app/backend/prisma
# prisma-клиент рядом с dist/ — так резолвятся импорты '../generated/prisma' (seed.cjs)
# и '../../../generated/prisma' (dist/modules/prisma/prisma.service.js)
COPY --from=build /build/backend/generated /app/backend/generated

# фронтенд: собранная статика для nginx
COPY --from=build /build/frontend/dist /app/frontend/dist

# конфиги и скрипты
COPY docker/nginx.conf /etc/nginx/sites-available/default
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# --- конфигурация приложения (можно переопределить через -e / docker run) ---
ENV DB_USER=studio \
    DB_PASSWORD=studio \
    DB_NAME=studio \
    DATABASE_URL="postgresql://studio:studio@localhost:5432/studio?schema=public" \
    PORT=3001 \
    APP_ID=0e2ec2df-ee53-4327-a472-9d78c278bdbb \
    APP_KEY=8VcWJmvuBy7i52ZdX+bOFdzSVB9ujmPRMtzRgJkkBlM= \
    APP_NAME=studio \
    BASE_URL=http://localhost \
    FRONT_URL=http://localhost \
    AUTH_SERVICE_URL=http://localhost \
    AUTH_SERVICE_BACK_URL=http://localhost \
    ADMIN_LOGIN=admin \
    ADMIN_PASSWORD=studio2024 \
    RUN_SEED=true

# В Kubernetes pod'ы получают hostname вида <pod>.<svc>.<ns>.svc.cluster.local.
# Если хост в DATABASE_URL совпадает с hostname пода — это петля back-to-self
# (обычно из-за автоматически подставленного секрета внешней БД); считаем
# такую конфигурацию локальной и подключаемся к встроенному postgres через 127.0.0.1.
RUN python3 - <<'PY'
p = '/usr/local/bin/entrypoint.sh'
s = open(p).read()
marker = '# стартуем временный postgres для инициализации'
patch = '''# --- self-loop guard: не даём подключиться к самому себе как к "внешней" БД ---
if [ -n "${DB_HOST:-}" ] && [ "${DB_HOST}" = "$(hostname -f 2>/dev/null || hostname)" ]; then
    echo "[entrypoint] DB_HOST совпадает с hostname пода (self-loop) — использую встроенный postgres"
    export DB_HOST=127.0.0.1
fi
URL_HOST=$(node -e 'try{console.log(new URL(process.env.DATABASE_URL).hostname)}catch(e){console.log("")}')
if [ "${URL_HOST}" = "$(hostname -f 2>/dev/null || hostname)" ]; then
    echo "[entrypoint] DATABASE_URL указывает на сам под (self-loop) — переписываю хост на 127.0.0.1"
    DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.hostname="127.0.0.1";console.log(u.toString())')
    export DATABASE_URL
fi

'''
assert marker in s
s = s.replace(marker, patch + marker, 1)
open(p, 'w').write(s)
print("patched")
PY

# --- переопределение конфигурации через переменные окружения (K8s/docker run) ---
# Позволяет запускать контейнер в Kubernetes: хост БД, порты, ключи и т.д.
# задаются через env без пересборки образа.
RUN printf '%s\n' \
    'DB_USER="${DB_USER:-studio}"' \
    'DB_PASSWORD="${DB_PASSWORD:-studio}"' \
    'DB_NAME="${DB_NAME:-studio}"' \
    'DATABASE_URL="${DATABASE_URL:-postgresql://${DB_USER:-studio}:${DB_PASSWORD:-studio}@${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-studio}?schema=public}"' \
    'PORT="${PORT:-3001}"' \
    'APP_ID="${APP_ID:-0e2ec2df-ee53-4327-a472-9d78c278bdbb}"' \
    'APP_KEY="${APP_KEY:-8VcWJmvuBy7i52ZdX+bOFdzSVB9ujmPRMtzRgJkkBlM=}"' \
    'APP_NAME="${APP_NAME:-studio}"' \
    'BASE_URL="${BASE_URL:-http://localhost}"' \
    'FRONT_URL="${FRONT_URL:-http://localhost}"' \
    'AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-http://localhost}"' \
    'AUTH_SERVICE_BACK_URL="${AUTH_SERVICE_BACK_URL:-http://localhost}"' \
    'ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"' \
    'ADMIN_PASSWORD="${ADMIN_PASSWORD:-studio2024}"' \
    'RUN_SEED="${RUN_SEED:-true}"' \
    > /etc/env-overrides.conf

EXPOSE 80

# Примечание: VOLUME на каталоге данных PG не объявлен намеренно —
# в k8s-под с emptyDir/tmpfs это приводило бы к потере/несовместимости
# инициализации кластера; данные живут в слое образа (эфемерны по design
# «всё в одном контейнере») либо на явно смонтированном volume того же пути.

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
