import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { initSwagger } from './config/swagger';

// Подгружаем .env до импорта appEnv (он валидирует переменные окружения в конструкторе)
for (const candidate of [
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
]) {
  try {
    if (fs.existsSync(candidate)) {
      for (const line of fs
        .readFileSync(candidate, 'utf8')
        .split(/\r?\n/)) {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (!m) continue;
        let value = (m[2] ?? '').trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = value;
      }
      break;
    }
  } catch {
    /* игнорируем */
  }
}

import { AppModule } from './modules/app/app.module';
import { AllExceptionsFilter } from './config/exceptionsFilter';
import { initDotEnv } from '@/config/dotEnv';
import { initServiceToken } from '@/config/authToken';
import * as session from 'express-session';
import cookieParser from 'cookie-parser';
import { appEnv } from '@/lib/env';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  initDotEnv();
  app.enableCors({
    origin: appEnv.frontUrl,
    credentials: true,
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(
    session.default({ secret: 'dog', resave: true, saveUninitialized: true }),
  );

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  initSwagger(app);
  //await initServiceToken();

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((err) => {
  console.log('Ошибка: ', err);
});
