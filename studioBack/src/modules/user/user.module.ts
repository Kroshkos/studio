import { Module } from '@nestjs/common';

import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { UserinfoController } from '@/modules/user/userinfo.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UserController, UserinfoController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
