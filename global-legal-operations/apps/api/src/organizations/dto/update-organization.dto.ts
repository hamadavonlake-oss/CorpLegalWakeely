import { IsString, IsOptional, IsInt, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'شركة الأمل القانونية', minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Al-Amal Legal', minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({ example: 'al-amal-legal', minLength: 2, maxLength: 50, description: 'URL-safe slug (alphanumeric + hyphens)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 0, description: 'Current row version for optimistic locking' })
  @IsOptional()
  @IsInt()
  rowVersion?: number;
}
