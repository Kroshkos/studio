import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Имя пользователя',
    minLength: 4,
  })
  name: string;

  @ApiProperty({
    description: 'Email пользователя',
  })
  email: string;

  @ApiProperty({
    description: 'Пароль пользователя',
  })
  password: string;

  @ApiPropertyOptional({
    description: 'Роль пользователя',
  })
  roleName: string;
}
