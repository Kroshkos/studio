import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn, Matches } from 'class-validator';

export class CreateBookingDto {
  // Маска телефона: +7 (XXX) XXX-XX-XX
  @IsString()
  @Matches(/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/, {
    message: 'Телефон должен быть в формате +7 (999) 999-99-99',
  })
  phone: string;

  // Email обязателен — на него администратор высылает готовое видео
  @IsEmail({}, { message: 'Укажите корректный email для отправки готового видео' })
  @IsNotEmpty()
  email: string;

  @IsString() @IsOptional() purpose?: string;
  @IsIn(['teacher', 'student']) role: 'teacher' | 'student';
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;    // YYYY-MM-DD
  @IsString() @Matches(/^([01]\d|2[0-3]):00$/, { message: 'Слот должен быть в формате HH:00' })
  slot: string;    // "09:00"
}
