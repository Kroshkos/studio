import { NestFactory } from '@nestjs/core';
import { initSwagger } from './config/swagger';
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
