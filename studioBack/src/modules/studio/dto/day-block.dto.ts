import { IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';

export type BlockAudience = 'teacher' | 'student' | 'all';

export class DayBlockDto {
  // необязательный id — чтобы фронтенд мог редактировать существующие блокировки на месте
  @IsInt() @IsOptional()
  id?: number;

  @IsIn(['teacher', 'student', 'all'])
  audience: BlockAudience;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Некорректная дата начала блокировки' })
  dateFrom: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Некорректная дата окончания блокировки' })
  dateTo: string;

  // Необязательное время: если указано — блокировка только на этот промежуток часов внутри дней
  @IsString() @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Некорректное время начала блокировки' })
  timeFrom?: string | null;

  @IsString() @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Некорректное время окончания блокировки' })
  timeTo?: string | null;
}

export class UpdateDayBlocksDto {
  @IsOptional()
  dayBlocks?: DayBlockDto[];
}
