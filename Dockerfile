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
    && cp -r generated/prisma node_modules/generated/prisma \
    # кладём рядом со скомпилированным кодом файл модели casbin —
    # он читается в рантайме из рабочей директории
    && cp Casbin_role_model.conf dist/Casbin_role_model.conf

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

EXPOSE 80

VOLUME ["/var/lib/postgresql"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
