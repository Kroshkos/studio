import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'email пользователя',
  })
  email: string;

  @ApiProperty({
    description: 'Имя пользователя',
  })
  name: string;

  @ApiProperty({
    description: 'Пароль пользователя',
  })
  password: string;
}
