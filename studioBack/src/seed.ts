import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const createCRUDCasbinRule = async (
  role: string,
  path: string,
  methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
) => {
  const userRole = await prisma.userRole.findFirst({
    where: {
      name: role,
    },
  });

  if (!userRole) {
    await prisma.userRole.create({
      data: {
        name: role,
      },
    });
  }

  for (const method of methods) {
    const policy = await prisma.casbinRule.findFirst({
      where: {
        ptype: 'p',
        v0: `${role}_${method.toLowerCase()}`,
        v1: path,
        v2: method,
      },
    });

    if (!policy) {
      await prisma.casbinRule.create({
        data: {
          ptype: 'p',
          v0: `${role}_${method.toLowerCase()}`,
          v1: path,
          v2: method,
        },
      });
    }

    const rolePolicy = await prisma.casbinRule.findFirst({
      where: {
        ptype: 'g',
        v0: role,
        v1: `${role}_${method.toLowerCase()}`,
      },
    });

    if (!rolePolicy) {
      await prisma.casbinRule.create({
        data: {
          ptype: 'g',
          v0: role,
          v1: `${role}_${method.toLowerCase()}`,
        },
      });
    }
  }
};


async function ensureStudioConfig() {
  const existing = await prisma.studioConfig.findUnique({ where: { id: 1 } });
  if (!existing) {
    await prisma.studioConfig.create({
      data: {
        id: 1,
        blockedDays: [],
        msgTeacher: 'В этот день преподаватели не могут записаться. Студия работает в особом режиме.',
        msgStudent: 'В этот день студия работает только для преподавателей. Студенты не могут записаться.',
      },
    });
  }
}

async function ensureAdminDepartment() {
  // Подразделение «admin»: используется для входа по ADMIN_LOGIN/ADMIN_PASSWORD
  // (см. studio.controller.ts: логин, совпадающий с ADMIN_LOGIN, идёт в validateAdmin,
  // остальные — в loginDepartment, который ищет запись в таблице Department).
  // Идемпотентно: если существует — обновляем хэш пароля из текущих переменных окружения.
  const password = process.env.ADMIN_PASSWORD || 'studio2024';
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.department.findUnique({ where: { name: 'admin' } });
  if (existing) {
    if (!existing.isActive || existing.passwordHash !== passwordHash) {
      await prisma.department.update({
        where: { id: existing.id },
        data: { passwordHash, isActive: true },
      });
    }
    return;
  }

  await prisma.department.create({
    data: { name: 'admin', passwordHash, isActive: true },
  });
}

async function main() {
  await createCRUDCasbinRule('user', '/lk', ['GET']);
  await createCRUDCasbinRule('admin', '/*');
  await ensureStudioConfig();
  await ensureAdminDepartment();

  console.log('База проинициализирована!');
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
