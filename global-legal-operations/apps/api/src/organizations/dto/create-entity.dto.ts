import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEntityDto {
  @ApiProperty({ example: 'فرع عمّان' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Amman Branch' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({ example: 'شركة الأمل القانونية – فرع عمّان' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @ApiPropertyOptional({ example: 'JO-1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNo?: string;

  @ApiProperty({ example: 'JO', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  countryCode!: string;

  @ApiPropertyOptional({ example: 'limited_liability_company' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;
}
