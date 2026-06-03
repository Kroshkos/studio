import { ApiProperty } from '@nestjs/swagger';

export class ToggleUserRolePolicyDto {
  @ApiProperty({
    description: 'Было ли правило добавлено или удалено',
  })
  isAdded: boolean;
}
