import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsBoolean,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClauseDto {
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string;

  @IsIn([
    'boilerplate', 'termination', 'confidentiality', 'payment',
    'liability', 'governing_law', 'dispute_resolution', 'force_majeure',
    'indemnification', 'warranty', 'assignment', 'amendment', 'misc',
  ])
  category!: string;

  @IsString()
  bodyText!: string;

  @IsOptional()
  @IsString()
  bodyTextEn?: string;

  @IsOptional()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class UpdateClauseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string;

  @IsOptional()
  @IsIn([
    'boilerplate', 'termination', 'confidentiality', 'payment',
    'liability', 'governing_law', 'dispute_resolution', 'force_majeure',
    'indemnification', 'warranty', 'assignment', 'amendment', 'misc',
  ])
  category?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  bodyTextEn?: string;

  @IsOptional()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  rowVersion?: number;
}
