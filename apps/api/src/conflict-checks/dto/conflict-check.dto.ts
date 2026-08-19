import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConflictCheckStatus } from '@glo/shared';

/** A single name entry: Arabic + English, at least one required. */
export class ConflictCheckNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;
}

export class CreateConflictCheckDto {
  @IsIn(['matter'])
  parentType!: 'matter'; // Phase 2: only matter. Phase 3 will add 'contract'.

  @IsUUID()
  parentId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictCheckNameDto)
  names!: ConflictCheckNameDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  registrationNumbers?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConflictCheckDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictCheckNameDto)
  names?: ConflictCheckNameDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  registrationNumbers?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  resultSummary?: string;
}

export class TransitionConflictCheckDto {
  @IsEnum(ConflictCheckStatus)
  to!: ConflictCheckStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  resultSummary?: string;
}
