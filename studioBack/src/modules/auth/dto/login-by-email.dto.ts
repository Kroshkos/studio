import { ApiProperty } from '@nestjs/swagger';

export class LoginByEmailDto {
  @ApiProperty({
    description: 'Email пользователя',
  })
  email: string;

  @ApiProperty({
    description: 'Пароль пользователя',
  })
  password: string;
}
