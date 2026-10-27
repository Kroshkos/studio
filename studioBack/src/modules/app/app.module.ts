import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from '@/modules/user/user.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UserRoleModule } from '@/modules/user-role/user-role.module';
import { LoggerMiddleware } from '@/modules/app/logger.middleware';
import { CasbinModule } from '@/modules/casbin/casbin.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@/modules/auth/guards/auth.guard';
import { ScopeGuard } from '@/modules/auth/guards/scope.guard';
import { CasbinGuard } from '@/modules/auth/guards/casbin.guard';
import { LocalSessionGuard } from '@/modules/auth/guards/local-session.guard';
import { StudioModule } from '@/modules/studio/studio.module';

// В standalone-режиме (вся платформа в одном контейнере, STANDALONE!=false)
// внешняя OAuth-авторизация недоступна — вместо AuthGuard/Casbin/Scope
// используется LocalSessionGuard (сессии студии ставит StudioAuthGuard).
const isStandalone =
  (process.env.STANDALONE || '').toLowerCase() !== 'false';

@Module({
  imports: [
    AuthModule, 
    UserModule, 
    UserRoleModule, 
    PrismaModule, 
    CasbinModule,
    StudioModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ...(isStandalone
      ? [{ provide: APP_GUARD, useClass: LocalSessionGuard }]
      : [
          { provide: APP_GUARD, useClass: AuthGuard },
          { provide: APP_GUARD, useClass: CasbinGuard },
          { provide: APP_GUARD, useClass: ScopeGuard },
        ]),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
