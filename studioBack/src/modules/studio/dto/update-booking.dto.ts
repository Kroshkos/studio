import { IsString, IsOptional, IsIn, IsInt, IsEmail, Matches } from 'class-validator';

export class UpdateBookingDto {
  @IsString() @IsOptional()
  @Matches(/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/, { message: 'Телефон должен быть в формате +7 (999) 999-99-99' })
  phone?: string;

  @IsString() @IsOptional() @IsEmail()
  email?: string;

  @IsString() @IsOptional()
  purpose?: string;

  @IsIn(['teacher', 'student']) @IsOptional()
  role?: 'teacher' | 'student';

  @IsString() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsString() @IsOptional() @Matches(/^([01]\d|2[0-3]):00$/)
  slot?: string;

  @IsIn(['waiting', 'recording', 'processing', 'sent']) @IsOptional()
  stageKey?: 'waiting' | 'recording' | 'processing' | 'sent';

  @IsInt() @IsOptional()
  departmentId?: number;
}
