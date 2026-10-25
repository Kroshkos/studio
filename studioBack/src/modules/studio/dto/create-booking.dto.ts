import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn, Matches } from 'class-validator';

export class CreateBookingDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() purpose?: string;
  @IsIn(['teacher', 'student']) role: 'teacher' | 'student';
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;    // YYYY-MM-DD
  @IsString() @Matches(/^([01]\d|2[0-3]):00$/, { message: 'Слот должен быть в формате HH:00' })
  slot: string;    // "09:00"
}