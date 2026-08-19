import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsIn,
  IsInt,
} from 'class-validator';
import { MatterStatus, ClassificationLevel } from '@glo/shared';

export class CreateMatterDto {
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
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsUUID()
  responsibleUser?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;
}

export class UpdateMatterDto {
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
  @IsUUID()
  responsibleUser?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;

  @IsOptional()
  @IsInt()
  rowVersion?: number;
}

export class TransitionMatterDto {
  @IsEnum(MatterStatus)
  to!: MatterStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class LinkRequestToMatterDto {
  @IsUUID()
  requestId!: string;
}

export class ConvertRequestToMatterDto {
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
}
