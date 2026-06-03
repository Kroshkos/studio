import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRoleDto } from '@/modules/user-role/dto/user-role.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CasbinService } from '@/modules/casbin/casbin.service';
import { ToggleUserRolePolicyDto } from '@/modules/user-role/dto/toggle-user-role-policy.dto';

export const USER_ROLE_NOT_FOUND = 'Роль не найдена';
export const USER_ROLE_ALREADY_EXIST = 'Роль с таким названием уже существует';

@Injectable()
export class UserRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casbinService: CasbinService,
  ) {}

  async create(createUserRoleDto: CreateUserRoleDto) {
    let role = await this.prisma.userRole.findFirst({
      where: {
        name: createUserRoleDto.name,
      },
    });

    if (role) throw new ConflictException(USER_ROLE_ALREADY_EXIST);

    role = await this.prisma.userRole.create({
      data: {
        name: createUserRoleDto.name,
      },
    });

    return role;
  }

  findAll() {
    const roles = this.prisma.userRole.findMany();

    return roles;
  }

  async findOne(id: number): Promise<UserRoleDto> {
    const role = await this.prisma.userRole.findFirst({
      where: {
        id,
      },
    });

    if (!role) throw new NotFoundException(USER_ROLE_NOT_FOUND);

    return role;
  }

  async remove(id: number) {
    const role = await this.prisma.userRole.findUnique({
      where: {
        id,
      },
    });

    if (!role) throw new NotFoundException(USER_ROLE_NOT_FOUND);

    return this.prisma.userRole.delete({
      where: {
        id,
      },
    });
  }

  async getPolicy(id: number) {
    const role = await this.prisma.userRole.findUnique({
      where: {
        id,
      },
    });

    if (!role) {
      throw new NotFoundException(USER_ROLE_NOT_FOUND);
    }

    return this.casbinService.getPolicyByRoleName(role.name);
  }

  async addPolicy(roleId: number, policyId: number) {
    const role = await this.findOne(roleId);
    const policy = await this.casbinService.findOnePolicy(policyId);

    await this.casbinService.addRolePolicy(role.name, policy.v0 ?? '');
  }

  async removePolicy(roleId: number, policyId: number) {
    const role = await this.findOne(roleId);
    const policy = await this.casbinService.findOnePolicy(policyId);

    await this.casbinService.removeRolePolicy(role.name, policy.v0 ?? '');
  }

  togglePolicy(
    roleId: number,
    policyId: number,
  ): Promise<ToggleUserRolePolicyDto> {
    return this.casbinService.toggleRolePolicy(roleId, policyId);
  }
}
