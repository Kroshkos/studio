import { initDotEnv } from '@/config/dotEnv';

// ВАЖНО: dotenv должен быть загружен ДО создания AppModule, т.к. часть
// конфигурации (appEnv) читает process.env в момент импорта/инстанцирования.
initDotEnv();

import { NestFactory } from '@nestjs/core';
import { initSwagger } from './config/swagger';
import { AppModule } from './modules/app/app.module';
import { AllExceptionsFilter } from './config/exceptionsFilter';
import { appEnv } from '@/lib/env';
import * as session from 'express-session';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as expressStatic from 'serve-static';
import type { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpServer = app.getHttpAdapter().getInstance();

  // Тело запроса — до подключения статики и fallback (см. ниже)
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // FRONT_URL может содержать список origin'ов через запятую
  // (например, превью- и продакшен-домены на Amvera).
  const corsOrigin =
    appEnv.frontUrl === '*'
      ? true
      : appEnv.frontUrl.split(',').map((s) => s.trim());

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(
    session.default({ secret: 'dog', resave: true, saveUninitialized: true }),
  );

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  initSwagger(app);

  // Статика фронтенда: если рядом с dist бэкенда лежит собранный SPA
  // (../frontend-dist — см. amvera.json), приложение отдаёт его вместе с API.
  // Это позволяет деплоить весь сервис одним приложением на Amvera без CORS.
  const frontendDist = join(__dirname, '..', 'frontend-dist');

  if (existsSync(frontendDist)) {
    httpServer.use(expressStatic.default(frontendDist));
    // SPA fallback: все не-API маршруты отдают index.html
    httpServer.get(/^(?!\/(studio|auth|api|swagger|docs|health)).*/, (req: Request, res: Response) => {
      res.sendFile(join(frontendDist, 'index.html'));
    });
    console.log('Сервируется статика фронтенда из frontend-dist');
  }

  // На PaaS (Amvera и аналоги) порт выдаётся через переменную окружения PORT.
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Сервер запущен на порту ${port}`);
}

bootstrap().catch((err) => {
  console.log('Ошибка: ', err);
});
