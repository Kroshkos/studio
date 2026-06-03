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
import { StudioModule } from '@/modules/studio/studio.module';

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
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CasbinGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ScopeGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
