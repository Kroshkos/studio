import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn } from 'class-validator';

export class CreateBookingDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() purpose?: string;
  @IsIn(['teacher', 'student']) role: 'teacher' | 'student';
  @IsString() @IsNotEmpty() date: string;    // YYYY-MM-DD
  @IsString() @IsNotEmpty() slot: string;    // "09:00"
}