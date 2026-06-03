import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { USER_NOT_FOUND } from './user.service';
import { UserDto } from './dto/user.dto';
import { JWTPayload } from '@/lib/jwt';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { SkipCasbin } from '@/modules/auth/decorators/skip-casbin.decorator';

@ApiBearerAuth()
@Controller('userinfo')
export class UserinfoController {
  constructor() {}

  @Get()
  @SkipCasbin()
  @ApiOkResponse({ type: UserDto })
  @ApiResponse({
    status: 404,
    description: USER_NOT_FOUND,
  })
  get(@CurrentUser() user: JWTPayload): UserDto {
    return user.user;
  }
}
