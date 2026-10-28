import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export type BlockAudience = 'teacher' | 'student' | 'all';

export class DayBlockDto {
  @IsIn(['teacher', 'student', 'all'])
  audience: BlockAudience;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Некорректная дата начала блокировки' })
  dateFrom: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Некорректная дата окончания блокировки' })
  dateTo: string;
}

export class UpdateDayBlocksDto {
  @IsOptional()
  dayBlocks?: DayBlockDto[];
}
