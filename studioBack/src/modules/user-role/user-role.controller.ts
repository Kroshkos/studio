import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import {
  USER_ROLE_ALREADY_EXIST,
  USER_ROLE_NOT_FOUND,
  UserRoleService,
} from './user-role.service';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserRoleDto } from '@/modules/user-role/dto/user-role.dto';
import { CasbinPolicyDto } from '@/modules/casbin/dto/cabin-policy.dto';
import { ToggleUserRolePolicyDto } from '@/modules/user-role/dto/toggle-user-role-policy.dto';

@ApiBearerAuth()
@Controller('user-role')
export class UserRoleController {
  constructor(private readonly userRoleService: UserRoleService) {}

  @ApiResponse({
    status: 200,
    description: 'Роль успешно создана',
    type: CreateUserRoleDto,
  })
  @ApiResponse({
    status: 409,
    description: USER_ROLE_ALREADY_EXIST,
  })
  @Post()
  create(@Body() createUserRoleDto: CreateUserRoleDto) {
    return this.userRoleService.create(createUserRoleDto);
  }

  @ApiResponse({
    status: 200,
    description: 'Список всех ролей успешно получен',
    type: UserRoleDto,
    isArray: true,
  })
  @Get()
  findAll() {
    return this.userRoleService.findAll();
  }

  @ApiResponse({
    status: 200,
    description: 'Роль успешно получена',
    type: UserRoleDto,
  })
  @ApiResponse({
    status: 404,
    description: USER_ROLE_NOT_FOUND,
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userRoleService.findOne(+id);
  }

  @ApiResponse({
    status: 200,
    description: 'Роль успешно удалена',
  })
  @ApiResponse({
    status: 404,
    description: USER_ROLE_NOT_FOUND,
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userRoleService.remove(+id);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешения найдены',
    type: CasbinPolicyDto,
    isArray: true,
  })
  @ApiResponse({
    status: 404,
    description: USER_ROLE_NOT_FOUND,
  })
  @Get(':id/policy')
  getPolicy(@Param('id') roleId: string) {
    return this.userRoleService.getPolicy(+roleId);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешение успешно добавлено к роли',
  })
  @ApiResponse({
    status: 404,
    description: 'Роль или разрешение не найдено',
  })
  @Post(':id/policy/:policyId')
  addPolicy(@Param('id') roleId: string, @Param('policyId') policyId: string) {
    return this.userRoleService.addPolicy(+roleId, +policyId);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешение успешно удалено',
    type: CasbinPolicyDto,
    isArray: true,
  })
  @ApiResponse({
    status: 404,
    description: 'Роль или разрешение не найдено',
  })
  @Delete(':id/policy/:policyId')
  deletePolicy(
    @Param('id') roleId: string,
    @Param('policyId') policyId: string,
  ) {
    return this.userRoleService.removePolicy(+roleId, +policyId);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешение успешно удалено или добавлено',
    type: ToggleUserRolePolicyDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Роль или разрешение не найдено',
  })
  @Post(':id/policy/:policyId/toggle')
  togglePolicy(
    @Param('id') roleId: string,
    @Param('policyId') policyId: string,
  ) {
    return this.userRoleService.togglePolicy(+roleId, +policyId);
  }
}
