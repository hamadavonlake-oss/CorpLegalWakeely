import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsArray,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsString()
  url!: string;

  @IsOptional()
  @IsArray()
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  verifySsl?: boolean;

  @IsOptional()
  @IsString()
  secretHeaderName?: string;
}

export class UpdateWebhookDto {
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
  url?: string;

  @IsOptional()
  @IsArray()
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  verifySsl?: boolean;
}

export class RetryWebhookDeliveryDto {
  // No body needed — just the ID in the URL
}
