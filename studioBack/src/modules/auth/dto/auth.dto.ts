import { UserDto } from '@/modules/user/dto/user.dto';
import { ApiProperty } from '@nestjs/swagger';

export class AuthDto extends UserDto {
  @ApiProperty({
    description: 'Авторизационный JWT токен',
  })
  token: string;
}
