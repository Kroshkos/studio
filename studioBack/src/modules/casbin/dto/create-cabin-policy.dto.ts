import { ApiProperty } from '@nestjs/swagger';

export class CreateCasbinPolicyDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  path: string;

  @ApiProperty()
  method: string;
}
