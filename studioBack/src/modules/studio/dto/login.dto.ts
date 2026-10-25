import { IsString, IsNotEmpty } from 'class-validator';

// Единая форма входа: логин подразделения ИЛИ логин администратора
export class LoginDto {
  @IsString() @IsNotEmpty() login: string;
  @IsString() @IsNotEmpty() password: string;
}
