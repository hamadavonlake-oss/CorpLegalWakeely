import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'ar', description: 'Default locale code' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'Asia/Amman', description: 'IANA timezone identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  defaultTimezone?: string;

  @ApiPropertyOptional({ example: 'JOD', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: false, description: 'Whether MFA is mandatory for all users' })
  @IsOptional()
  @IsBoolean()
  mfaMandatory?: boolean;
}
