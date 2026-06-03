import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetUserDto {
  @ApiPropertyOptional({
    description: 'УИД пользователя',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Имя пользователя',
    minLength: 4,
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Email пользователя',
  })
  email: string;
}
