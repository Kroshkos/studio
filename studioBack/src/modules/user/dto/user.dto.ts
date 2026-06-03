import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({
    description: 'УИД пользователя',
  })
  id: number;

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
    description: 'Роль пользователя',
    nullable: true,
    type: 'string',
  })
  roleName: string | null;

  @ApiProperty({
    description: 'УИД человека',
    nullable: true,
    type: 'number',
  })
  personId: number | null;
}
