import { ApiProperty } from '@nestjs/swagger';

export class LoginByOAuthCodeDto {
  @ApiProperty({
    description: 'Код oauth авторизации',
  })
  code: string;
}
