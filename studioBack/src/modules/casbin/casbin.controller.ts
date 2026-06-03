import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CasbinService } from '@/modules/casbin/casbin.service';
import { CasbinPolicyDto } from '@/modules/casbin/dto/cabin-policy.dto';
import { CreateCasbinPolicyDto } from '@/modules/casbin/dto/create-cabin-policy.dto';

@ApiBearerAuth()
@Controller('casbin')
export class CasbinController {
  constructor(private readonly casbinService: CasbinService) {}

  @ApiResponse({
    status: 201,
    description: 'Разрешение успешно создано',
    type: CreateCasbinPolicyDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Разрешение уже существует',
  })
  @Post('policy')
  createPolicy(@Body() data: CreateCasbinPolicyDto) {
    return this.casbinService.createPolicy(data.name, data.path, data.method);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешения найдены',
    type: CasbinPolicyDto,
    isArray: true,
  })
  @Get('policy')
  findAllPolicy() {
    return this.casbinService.findAllPolicy();
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешения найдены',
    type: CasbinPolicyDto,
    isArray: true,
  })
  @Get('policy/by-name')
  findAllPolicyByName(@Query('name') name: string) {
    return this.casbinService.findPolicyByName(name);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешения найдены',
    type: CasbinPolicyDto,
    isArray: true,
  })
  @Get('policy/by-role')
  getRolePolicy(@Query('roleId') roleId: string) {
    return this.casbinService.getPolicyByRoleId(+roleId);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешение успешно найдено',
    type: CasbinPolicyDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Разрешение не найдено',
  })
  @Get('policy/:id')
  findOnePolicyByName(@Param('id') id: string) {
    return this.casbinService.findOnePolicy(+id);
  }

  @ApiResponse({
    status: 200,
    description: 'Разрешение успешно удалено',
    type: CasbinPolicyDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Разрешение не найдено',
  })
  @Delete('policy/:id')
  removePolicy(@Param('id') id: string) {
    return this.casbinService.removePolicy(+id);
  }
}
