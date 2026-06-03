import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { User as UserModel } from 'generated/prisma';
import { ApiBearerAuth, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { GetUserDto } from './dto/get-user.dto';
import {
  USER_ALREADY_EXIST,
  USER_NOT_FOUND,
  UserService,
} from './user.service';
import { UserDto } from './dto/user.dto';
import { UpdateUserDto } from '@/modules/user/dto/update-user.dto';
import { CreateUserDto } from '@/modules/user/dto/create-user.dto';

@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiResponse({
    status: 200,
    description: 'Пользователь успешно создан',
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 409,
    description: USER_ALREADY_EXIST,
  })
  @Post()
  create(@Body() createUserRoleDto: CreateUserDto) {
    return this.userService.create(createUserRoleDto);
  }

  @Get('find')
  @ApiOkResponse({ type: UserDto })
  @ApiResponse({
    status: 404,
    description: USER_NOT_FOUND,
  })
  async findUser(
    @Query() query: GetUserDto,
  ): Promise<Omit<UserModel, 'password'> | null> {
    const { id, ...otherQueries } = query;

    const res = await this.userService.getUnique({
      id: Number(id) || undefined,
      ...otherQueries,
    });

    return res;
  }

  @Get()
  @ApiOkResponse({ type: UserDto, isArray: true })
  async getUsers(@Query() getUserDto: GetUserDto) {
    const { id, ...other } = getUserDto;

    return await this.userService.findMany({
      id: Number(id) || undefined,
      ...other,
    });
  }

  @ApiResponse({
    status: 200,
    description: 'Пользователь успешно изменен',
  })
  @ApiResponse({
    status: 404,
    description: USER_NOT_FOUND,
  })
  @Patch(':id')
  @ApiOkResponse({ type: UserDto })
  update(@Param('id') id: string, @Body() user: UpdateUserDto) {
    return this.userService.update(+id, user);
  }

  @ApiResponse({
    status: 200,
    description: 'Пользователь успешно удален',
  })
  @ApiResponse({
    status: 404,
    description: USER_NOT_FOUND,
  })
  @Delete(':id')
  @ApiOkResponse({ type: UserDto })
  remove(@Param('id') id: string) {
    return this.userService.delete(+id);
  }
}
