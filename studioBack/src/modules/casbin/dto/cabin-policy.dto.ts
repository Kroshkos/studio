import { ApiProperty } from '@nestjs/swagger';

export class CasbinPolicyDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  v0: string;

  @ApiProperty()
  v1: string;

  @ApiProperty()
  v2: string;
}
