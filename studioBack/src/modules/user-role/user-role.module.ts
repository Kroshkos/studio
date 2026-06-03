import { Module } from '@nestjs/common';
import { UserRoleService } from './user-role.service';
import { UserRoleController } from './user-role.controller';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { CasbinModule } from '@/modules/casbin/casbin.module';

@Module({
  imports: [PrismaModule, CasbinModule],
  controllers: [UserRoleController],
  providers: [UserRoleService],
})
export class UserRoleModule {}
