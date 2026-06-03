import { PrismaService } from '@/modules/prisma/prisma.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Enforcer } from 'casbin';

@Injectable()
export class CasbinService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('CASBIN_ENFORCER') private readonly enforcer: Enforcer,
  ) {}

  async findAllPolicy() {
    return await this.prisma.casbinRule.findMany({
      where: {
        ptype: 'p',
      },
    });
  }

  async findPolicyByName(policyName: string) {
    return await this.prisma.casbinRule.findMany({
      where: {
        ptype: 'p',
        v0: {
          contains: policyName,
        },
      },
    });
  }

  async getPolicyByRoleName(roleName: string) {
    const groups = await this.prisma.casbinRule.findMany({
      where: {
        ptype: 'g',
        v0: roleName,
      },
    });

    const policyNames: string[] = groups.map((p) => p.v1 ?? '').filter(Boolean);

    return await this.prisma.casbinRule.findMany({
      where: {
        ptype: 'p',
        v0: {
          in: policyNames,
        },
      },
    });
  }

  async findOnePolicy(id: number) {
    const policy = await this.prisma.casbinRule.findFirst({
      where: {
        id,
      },
    });

    if (!policy) {
      throw new NotFoundException('Разрешение не найдено');
    }

    return policy;
  }

  async getPolicyByRoleId(roleId: number) {
    const role = await this.prisma.userRole.findFirst({
      where: {
        id: roleId,
      },
    });

    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }

    return this.getPolicyByRoleName(role.name);
  }

  async createPolicy(v0: string, v1: string, v2: string) {
    if (await this.enforcer.hasPolicy(v0, v1, v2)) {
      throw new NotFoundException('Правило уже существует');
    }

    await this.enforcer.addPolicy(v0, v1, v2);
  }

  async removePolicy(id: number) {
    const policy = await this.prisma.casbinRule.findFirst({
      where: {
        ptype: 'p',
        id,
      },
    });

    if (!policy) {
      throw new NotFoundException('Правило не найдено');
    }

    await this.enforcer.removePolicy(
      policy.v0 ?? '',
      policy.v1 ?? '',
      policy.v2 ?? '',
    );

    if (policy.v0)
      await this.enforcer.removeFilteredGroupingPolicy(1, policy.v0);

    return policy;
  }

  async addRolePolicy(roleName: string, policyName: string) {
    await this.enforcer.addGroupingPolicy(roleName, policyName);
  }

  async removeRolePolicy(roleName: string, policyName: string) {
    await this.enforcer.removeGroupingPolicy(roleName, policyName);
  }

  async toggleRolePolicy(roleId: number, policyId: number) {
    const role = await this.prisma.userRole.findFirst({
      where: {
        id: roleId,
      },
    });

    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }

    const policy = await this.prisma.casbinRule.findFirst({
      where: {
        ptype: 'p',
        id: policyId,
        v0: {
          not: '',
        },
      },
    });

    if (!policy) {
      throw new NotFoundException('Роль не найдена');
    }

    const isHas = await this.enforcer.hasRoleForUser(
      role.name,
      policy.v0 ?? '',
    );

    if (isHas) {
      await this.removeRolePolicy(role.name, policy.v0 ?? '');
      return { isAdded: false };
    }

    await this.addRolePolicy(role.name, policy.v0 ?? '');
    return { isAdded: true };
  }
}
