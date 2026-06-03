import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '@/modules/user/user.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { OAuthStrategy } from '@/modules/auth/strategies/oauth.strategy';

@Module({
  imports: [UserModule, PrismaModule],
  providers: [AuthService, OAuthStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
