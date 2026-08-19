import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  IsDateString,
  IsBoolean,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { DocumentStatus, ClassificationLevel } from '@glo/shared';

export class CreateDocumentDto {
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

  @IsIn([
    'contract_draft', 'signed_contract', 'exhibit', 'evidence',
    'correspondence', 'memo', 'other',
  ])
  type!: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsUUID()
  legalRequestId?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;
}

export class UpdateDocumentDto {
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
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;

  @IsOptional()
  @IsInt()
  rowVersion?: number;
}

export class TransitionDocumentDto {
  @IsEnum(DocumentStatus)
  to!: DocumentStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UploadVersionDto {
  @IsOptional()
  @IsString()
  changeSummary?: string;

  /// MIME type of the uploaded file (must match the actual content type)
  @IsString()
  mimeType!: string;

  @IsString()
  filename!: string;
}

export class UpdateLegalHoldDto {
  @IsBoolean()
  legalHold!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateRetentionDto {
  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class LinkDocumentToContractDto {
  @IsUUID()
  contractId!: string;

  @IsIn(['source', 'signed_copy', 'amendment', 'exhibit'])
  linkType!: 'source' | 'signed_copy' | 'amendment' | 'exhibit';
}
