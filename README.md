# Видеостудия — система онлайн-записи

Веб-приложение для записи подразделений на занятия в видеостудии: календарь свободных слотов, роли «администратор» и «подразделение», панель администратора с управлением блокировками, графиком работы студии и индивидуальными слотами.

## Возможности

**Подразделение (user):**
- просмотр доступных слотов по дням в календаре;
- запись на свободный слот, отмена своей записи;
- заблокированные дни/периоды отображаются с сообщением от администратора (текст зависит от роли).

**Администратор (admin):**
- управление подразделениями и пользователями (логин без учёта регистра);
- список и перенос записей;
- настройки студии в виде интерактивного календаря:
  - блокировка дней или промежутков дат для преподавателя / студента / всех, в том числе частичная — только на промежуток времени (например, 09:00–12:00), а не на весь день;
  - незаписные дни недели (рекуррентные);
  - график работы: время открытия/закрытия, длительность слота по умолчанию;
  - редактирование конкретных слотов: перенос времени, индивидуальная длительность, удаление/возврат слота;
  - сообщения, которые видит подразделение при заблокированном дне.

Все изменения настроек сохраняются атомарно (транзакция Prisma) и переживают перезагрузку страницы.

## Стек

| Часть | Технологии |
|---|---|
| Frontend | React 18 + TypeScript, Vite |
| Backend | NestJS + TypeScript, Prisma ORM |
| Авторизация | JWT, casbin (RBAC), bcrypt |
| БД | PostgreSQL 15 |
| Деплой | Docker (nginx + Node.js + PostgreSQL в одном контейнере под supervisord), хостинг Zeon |

## Структура репозитория

```
.
├── studio-frontend/       # React + Vite приложение
│   ├── src/
│   │   ├── components/    # AdminPanel, SettingsCalendar, Calendar, TimeSlots, Login и др.
│   │   ├── api/studio.ts  # HTTP-клиент (axios)
│   │   ├── types/index.ts # Общие типы (DayBlock, StudioConfig, вспомогательные функции)
│   │   └── App.tsx        # Роутинг ролей, состояние конфига
├── studioBack/            # NestJS API
│   ├── prisma/schema.prisma
│   ├── src/modules/studio/    # конфиг, слоты, блокировки, записи
│   ├── src/modules/auth/      # JWT, casbin
│   └── docker/entrypoint.sh   # инициализация БД внутри контейнера
├── Dockerfile             # единый образ (nginx + backend + postgres)
└── README.md
```

## Модель данных (основное)

- `User` — пользователи (роли admin/user через `UserRole`).
- `Department` — подразделения.
- `StudioConfig` — singleton (id = 1): `blockedDays` (дни недели), `msgTeacher`, `msgStudent`, `openTime`, `closeTime`, `slotDuration`.
- `DayBlock` — блокировки: `audience` (`teacher` / `student` / `all`), `dateFrom`, `dateTo`, опциональные `timeFrom`/`timeTo` (HH:mm; пусто = весь день).
- `TimeOverride` — изменения конкретных слотов: `original`, `newTime`, `duration`, `deleted`.
- `Booking` — запись подразделения на слот (дата + время).

Логика выдачи слотов: слоты генерируются из графика работы → применяются overrides (перенос/длительность/удаление) → исключаются дни недели из `blockedDays` и пересекающиеся `DayBlock` для текущей роли.

---

# Текущая конфигурация деплоя (Zeon, один контейнер)

Проект разворачивается на платформе **Zeon** одним Docker-контейнером, внутри которого supervisord запускает три процесса:

1. **PostgreSQL 15** (кластер `main`) — локальная БД;
2. **NestJS backend** — порт 3000;
3. **nginx** — отдаёт собранный фронтенд (статика) и проксирует `/api/*` на localhost:3000.

Особенности, заложенные в `docker/entrypoint.sh`:

- **Экономия RAM.** Лимит плана ≤512 MiB, поэтому инициализация схемы выполняется напрямую через `psql` (полный SQL-дамп всех таблиц: User, UserRole, casbin_rule, Department, StudioConfig, DayBlock, TimeOverride, Booking), а не через `prisma db push` (Query Engine потребляет ~150 МБ и упирался в OOM).
- Схема создаётся идемпотентно (`IF NOT EXISTS`), начальные данные сеются отдельным компактным скриптом.
- `NODE_OPTIONS=--max-old-space-size=128` — ограничение кучи Node.
- При старте: создание роли/БД `studio`, применение схемы, seed, запуск supervisord.

Переменные окружения (задаются в настройках проекта на Zeon):

| Переменная | Пример | Назначение |
|---|---|---|
| `DATABASE_URL` | `postgresql://studio:***@localhost:5432/studio` | строка подключения Prisma |
| `JWT_SECRET` | случайная строка | подпись JWT |
| `PORT` | `3000` | порт backend |

Сборка образа выполняется платформой из репозитория при пуше в `main` (или по кнопке Redeploy).

### Известные ограничения текущего решения
- Stateless-деплои: при пересборке контейнера состояние БД сохраняется только если Zeon предоставляет volume для `/var/lib/postgresql`; иначе используйте выносной PostgreSQL.
- Один контейнер = один instance; горизонтальное масштабирование невозможно.
- Все процессы делят лимит RAM проекта.

---

# Деплой на собственный сервис (раздельные контейнеры)

Для переноса на собственный сервер/VPS (Docker + docker-compose) нужно внести следующие изменения.

## 1. Отказ от единого контейнера

Убираем supervisord и встроенный PostgreSQL. Каждый процесс — отдельный контейнер: `postgres`, `backend`, `frontend` (nginx).

## 2. Multi-stage Dockerfile для backend

```dockerfile
# studioBack/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=384
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated/prisma ./generated/prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

## 3. Multi-stage Dockerfile для frontend

```dockerfile
# studio-frontend/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` для фронтенда:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # SPA-роутинг
    }

    location /api/ {
        proxy_pass http://backend:3000/;    # префикс /api снимается
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 4. docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: studio
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: studio
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U studio -d studio"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    build: ./studioBack
    environment:
      DATABASE_URL: postgresql://studio:${POSTGRES_PASSWORD}@postgres:5432/studio
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3000
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build: ./studio-frontend
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  pgdata:
```

## 5. Что именно меняется относительно текущей конфигурации

| Было (Zeon, один контейнер) | Стало (собственный сервис) |
|---|---|
| PostgreSQL внутри контейнера, кластер `main` | Отдельный контейнер `postgres` + volume `pgdata` |
| Инициализация схемы прямым SQL в `entrypoint.sh` (экономия RAM) | Стандартные миграции: `npx prisma migrate dev --name init` локально → коммит папки `prisma/migrations` → `npx prisma migrate deploy` при старте контейнера backend |
| Seed начальных данных shell-скриптом | `npx prisma db seed` (скрипт seed остаётся) |
| `DATABASE_URL` указывает на `localhost` | Указывает на сервис `postgres` по имени сети compose |
| nginx + статика + прокси в одном контейнере | Отдельный nginx-контейнер, `proxy_pass http://backend:3000/` по внутренней DNS-сети |
| Фронтенд собирается внутри общего образа | Отдельный multi-stage build фронтенда |
| Лимит RAM делится на все процессы | Каждому сервису можно задать свой лимит (`deploy.resources.limits`) |
| TLS терминируется платформой | TLS терминируется на frontend-nginx (сертификаты Let's Encrypt/certbot или reverse-proxy уровня выше: Traefik/Caddy/nginx) |

Дополнительно:
- `.env` файл рядом с compose (не коммитить!): `POSTGRES_PASSWORD`, `JWT_SECRET`.
- `CORS` в backend (`main.ts` — `app.enableCors`) ограничить origin вашего домена вместо `*`.
- В фронтенде `VITE_API_URL` задать равным `/api` (прокси через nginx) — тогда код клиента менять не нужно.
- Бэкапы: регулярный `pg_dump` из контейнера postgres на хост.

## 6. Перенос существующих данных с Zeon

```bash
# дамп со старого контейнера (zeon CLI / docker exec)
docker exec <container> pg_dump -U studio studio > backup.sql

# восстановление в новый postgres
cat backup.sql | docker exec -i $(docker-compose ps -q postgres) psql -U studio -d studio
```

После восстановления выполните `npx prisma migrate resolve --applied <имена миграций>` (или просто убедитесь, что схема совпадает с последней миграцией), чтобы `migrate deploy` не пытался пересоздать существующие таблицы.

---

# Локальная разработка

```bash
# backend
cd studioBack
npm install
npx prisma generate          # после изменений schema.prisma
npx prisma migrate dev       # локальная миграция
npm run start:dev            # http://localhost:3000

# frontend
cd studio-frontend
npm install
npm run dev                  # http://localhost:5173 (прокси /api на :3000 в vite.config)
```

Нужен локальный PostgreSQL (или `docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:15`) и `DATABASE_URL` в `studioBack/.env`.

## Проверки перед коммитом

```bash
cd studioBack && npx tsc --noEmit && npm run build
cd studio-frontend && npx tsc --noEmit && npm run build
```
