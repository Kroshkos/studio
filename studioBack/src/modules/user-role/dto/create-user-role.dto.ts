import { ApiProperty } from '@nestjs/swagger';

export class CreateUserRoleDto {
  @ApiProperty({
    description: 'Название роли',
  })
  name: string;
}
