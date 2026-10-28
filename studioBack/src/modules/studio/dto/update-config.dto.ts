import {IsNumber, IsArray, IsString, IsOptional, ArrayMaxSize, ArrayUnique, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DayBlockDto } from './day-block.dto';

export class UpdateConfigDto {
  @IsArray() @IsOptional() @ArrayUnique() @ArrayMaxSize(5)
  @IsNumber({}, { each: true }) @Min(1) @Max(5) blockedDays?: number[];
  @IsString() @IsOptional() msgTeacher?: string;
  @IsString() @IsOptional() msgStudent?: string;
  @IsArray() @IsOptional()
  @ValidateNested({ each: true }) @Type(() => DayBlockDto) dayBlocks?: DayBlockDto[];
}