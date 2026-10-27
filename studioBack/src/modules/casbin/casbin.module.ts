import { CasbinController } from '@/modules/casbin/casbin.controller';
import { CasbinService } from '@/modules/casbin/casbin.service';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { Module, Global } from '@nestjs/common';
import { newEnforcer } from 'casbin';
import { PrismaAdapter } from 'casbin-prisma-adapter';
import { PrismaClient } from 'generated/prisma';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [CasbinController],
  providers: [
    {
      provide: 'CASBIN_ENFORCER',
      useFactory: async () => {
        try {
          const prisma = new PrismaClient();
          const adapter = await PrismaAdapter.newAdapter(prisma);
          const enforcer = await newEnforcer('Casbin_role_model.conf', adapter);
          await enforcer.loadPolicy();
          enforcer.enableAutoSave(true);
          enforcer.enableLog(true);
          return enforcer;
        } catch (e) {
          // В standalone-режиме внешняя RBAC не используется
          // (доступ обеспечивает StudioAuthGuard). Не роняем приложение,
          // если casbin-таблицы или конфиг недоступны.
          console.warn(
            'Casbin enforcer не инициализирован (standalone?):',
            (e as Error)?.message,
          );
          return null;
        }
      },
    },
    CasbinService,
  ],
  exports: ['CASBIN_ENFORCER', CasbinService],
})
export class CasbinModule {}
