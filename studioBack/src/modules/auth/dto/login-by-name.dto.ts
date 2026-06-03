import { ApiProperty } from '@nestjs/swagger';

export class LoginByNameDto {
  @ApiProperty({
    description: 'Имя пользователя',
  })
  name: string;

  @ApiProperty({
    description: 'Пароль пользователя',
  })
  password: string;
}
