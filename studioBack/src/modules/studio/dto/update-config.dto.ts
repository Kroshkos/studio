import {IsNumber, IsArray, IsString, IsOptional, ArrayMaxSize, ArrayUnique, Min, Max } from 'class-validator';

export class UpdateConfigDto {
  @IsArray() @IsOptional() @ArrayUnique() @ArrayMaxSize(5)
  @IsNumber({}, { each: true }) @Min(1) @Max(5) blockedDays?: number[];
  @IsString() @IsOptional() msgTeacher?: string;
  @IsString() @IsOptional() msgStudent?: string;
}