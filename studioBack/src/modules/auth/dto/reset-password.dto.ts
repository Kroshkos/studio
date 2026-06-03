import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Код восстановления пароля с почты',
  })
  code: string;
  @ApiProperty({
    description: 'Пароль',
  })
  password: string;
}
