import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString() @IsNotEmpty({ message: 'Укажите наименование подразделения' })
  name: string;

  @IsString() @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password: string;
}

export class UpdateDepartmentDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @MinLength(6) password: string;
}
