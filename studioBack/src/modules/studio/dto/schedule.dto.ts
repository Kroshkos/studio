import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TimeOverrideDto {
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Некорректное исходное время слота' })
  original: string;

  @IsString() @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Некорректное новое время слота' })
  newTime?: string;

  @IsInt() @IsOptional() @Min(5) @Max(480)
  duration?: number;

  @IsBoolean() @IsOptional()
  deleted?: boolean;
}

export class ScheduleDto {
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Некорректное время открытия' })
  openTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Некорректное время закрытия' })
  closeTime: string;

  @IsInt() @Min(5) @Max(480)
  slotDuration: number;

  @IsArray() @IsOptional()
  @ValidateNested({ each: true }) @Type(() => TimeOverrideDto)
  overrides?: TimeOverrideDto[];
}
