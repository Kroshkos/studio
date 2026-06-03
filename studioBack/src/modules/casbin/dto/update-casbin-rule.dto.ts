import { ApiProperty } from '@nestjs/swagger';

export class UpdateCasbinRuleDto {
  @ApiProperty()
  v1: string;

  @ApiProperty()
  v2: string;
}
