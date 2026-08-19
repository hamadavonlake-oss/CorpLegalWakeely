import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsIn,
} from 'class-validator';
import { LegalRequestStatus, ClassificationLevel } from '@glo/shared';

export class CreateLegalRequestDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}

export class UpdateLegalRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;

  @IsOptional()
  @IsInt()
  rowVersion?: number;
}

export class TransitionLegalRequestDto {
  @IsEnum(LegalRequestStatus)
  to!: LegalRequestStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

// Re-export for IsInt — class-validator doesn't auto-import.
import { IsInt } from 'class-validator';
