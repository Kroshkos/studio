import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateBookingDto {
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() purpose?: string;
  @IsIn(['teacher', 'student']) @IsOptional() role?: 'teacher' | 'student';
  @IsString() @IsOptional() date?: string; // YYYY-MM-DD
  @IsString() @IsOptional() slot?: string; // "09:00"
}
