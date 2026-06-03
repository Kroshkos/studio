import { PrismaClient } from '../generated/prisma';

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

async function main() {
  await createCRUDCasbinRule('user', '/lk', ['GET']);
  await createCRUDCasbinRule('admin', '/*');

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
