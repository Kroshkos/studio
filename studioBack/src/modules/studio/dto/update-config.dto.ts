import {IsNumber, IsArray, IsString, IsOptional, ArrayMaxSize, ArrayUnique, Min, Max } from 'class-validator';

export class UpdateConfigDto {
  // Схема дней недели: 1=Пн … 7=Вс (совпадает с Calendar.tsx на фронте)
  @IsArray() @IsOptional() @ArrayUnique() @ArrayMaxSize(7)
  @IsNumber({}, { each: true }) @Min(1) @Max(7) blockedDays?: number[];
  @IsString() @IsOptional() msgTeacher?: string;
  @IsString() @IsOptional() msgStudent?: string;
}