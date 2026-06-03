import { ApiProperty } from '@nestjs/swagger';

export class UserRoleDto {
  @ApiProperty({
    description: 'УИД роли',
  })
  id: number;

  @ApiProperty({
    description: 'Название роли',
  })
  name: string;
}
