import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class RegisterResultDto extends PartialType(RegisterDto) {
  @ApiProperty({
    description: 'Авторизационный токен',
  })
  token: string;
}
