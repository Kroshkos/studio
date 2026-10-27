import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString() @IsNotEmpty() @MinLength(2)
  name: string;

  @IsString() @IsNotEmpty() @MinLength(4)
  password: string;
}
