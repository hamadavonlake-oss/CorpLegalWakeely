import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsBoolean,
  IsIn,
  MaxLength,
  Min,
  IsObject,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MaxLength(100)
  templateCode!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['contract', 'letter', 'memo', 'notice', 'clause_set'])
  type!: string;

  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  defaultValues?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsIn(['ar', 'en', 'ar,en'])
  locale?: string;

  // The DOCX file is uploaded separately via multipart
  @IsString()
  filename!: string;

  @IsString()
  mimeType!: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  defaultValues?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsIn(['ar', 'en', 'ar,en'])
  locale?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  rowVersion?: number;
}

export class FillTemplateDto {
  /// Variables to fill the template with. Required keys depend on the
  /// template's variablesSchema.
  @IsObject()
  variables!: Record<string, unknown>;

  /// Optional: link the generated document to a contract/matter/request
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsUUID()
  legalRequestId?: string;

  /// Output filename (without extension). Default: template name + timestamp.
  @IsOptional()
  @IsString()
  outputFilename?: string;
}

export class LinkClauseToTemplateDto {
  @IsUUID()
  clauseId!: string;

  @IsString()
  placeholderName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
