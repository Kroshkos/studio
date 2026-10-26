# Деплой сервиса видеостудии на Amvera

Сервис разворачивается **одним приложением**: NestJS-бэкенд отдаёт API и собранный
фронтенд (SPA) из папки `studioBack/frontend-dist`. Конфигурация сборки — в
[`amvera.yml`](./amvera.yml) (формат описан в [документации Amvera](https://docs.amvera.ru)).

## Архитектура деплоя

```
Amvera App (Node.js 20)
├── dist/            ← собранный бэкенд (NestJS, порт $PORT)
├── frontend-dist/   ← собранный React SPA (отдаётся бэкендом как статика)
└── Prisma           ← миграции выполняются автоматически при старте
PostgreSQL           ← отдельный сервис Amvera («База данных → PostgreSQL»)
```

## Шаг 1. Создание базы данных PostgreSQL

1. В панели Amvera: **«Базы данных» → «PostgreSQL» → Создать**.
2. Скопируйте строку подключения (`DATABASE_URL`) из карточки БД.
3. При необходимости добавьте ваш IP в раздел **«Настройки → Доступ»** (для локальной разработки).

## Шаг 2. Импорт проекта

1. Запушьте этот репозиторий в GitHub/GitLab/Bitbucket.
2. В панели Amvera: **«Приложения» → «Импорт приложения»** → выберите репозиторий.
3. Amvera автоматически обнаружит файл `amvera.yml` в корне репозитория.

## Шаг 3. Переменные окружения

В настройках приложения (вкладка **«Переменные окружения»**) задайте:

| Переменная | Обязательная | Значение |
|---|---|---|
| `DATABASE_URL` | ✅ | Строка подключения из Шага 1 |
| `APP_KEY` | ✅ | Секрет для JWT: `openssl rand -base64 32` |
| `ADMIN_LOGIN` | ✅ | Логин администратора (вводится на странице входа) |
| `ADMIN_PASSWORD` | ✅ | Сложный пароль администратора |
| `APP_ID` | ⭕ | `video-studio` (любая метка) |
| `APP_NAME` | ⭕ | `video-studio` |
| `BASE_URL` | ⭕ | `https://<ваше-приложение>.amveranet` |
| `FRONT_URL` | ⭕ | `*` (SPA раздаётся тем же приложением) или список origin'ов через запятую |

> Не используйте значения-заглушки из `.env.example` в продакшене.
> `PORT` задавать не нужно — платформа выдаёт его сама, код читает `process.env.PORT`.

## Шаг 4. Сборка и запуск

Нажмите **«Собрать и запустить»**. Выполняются команды из `amvera.yml`:

```bash
# build
cd studioBack && npm install && npx prisma generate && npm run build
cd studio-frontend && npm install && npm run build
mkdir -p studioBack/frontend-dist && cp -r studio-frontend/dist/* studioBack/frontend-dist/

# run (при каждом старте контейнера)
npx prisma migrate deploy && node dist/main.js
```

Healthcheck: `GET /health` (возвращает `{"status":"ok"}`).
Swagger API: `https://<домен>/swagger`.

## Шаг 5. Первый вход

1. Откройте домен приложения.
2. Войдите под `ADMIN_LOGIN` / `ADMIN_PASSWORD` → откроется панель администрирования.
3. Создайте подразделения (логин = название подразделения, пароль задаёте вы).
4. Пользователи входят под названием подразделения и бронируют слоты.

## Обновление кода

- `git push` в подключённый репозиторий → в панели Amvera нажмите **«Собрать и запустить»**
  (или включите автодеплой по webhook в настройках приложения).
- Новые миграции Prisma (`prisma migrate dev` локально) применяются автоматически при старте.

## Раздельный деплой (альтернатива)

Если хотите разместить фронтенд и бэкенд двумя отдельными приложениями Amvera:

1. **Бэкенд**:скопируйте `studioBack` в отдельный репозиторий, `amvera.yml` — такой же, но без шагов со `studio-frontend`.
2. **Фронтенд**:создайте приложение из `studio-frontend`, переменная окружения
   `VITE_API_URL=https://<backend>.amveranet/studio`, команда запуска — `npm run preview -- --host --port 3000`
   (или используйте статическое размещение Amvera).
3. В бэкенде задайте `FRONT_URL=https://<frontend>.amveranet` (CSP/CORS).

## Локальная проверка перед деплоем

```bash
docker run -d --name pg -e POSTGRES_USER=studio -e POSTGRES_PASSWORD=studio \
  -e POSTGRES_DB=studio_db -p 5432:5432 postgres:16

cd studioBack && cp .env.example .env   # заполните DATABASE_URL, APP_KEY, ADMIN_*
npm install && npx prisma migrate deploy && npm run start:dev

cd ../studio-frontend && npm install && npm run dev   # http://localhost:3000
```
