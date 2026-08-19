import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({ example: 'SecureP@ssw0rd!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Ahmad' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Al-Rashid' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: 'Acme Legal' })
  @IsString()
  organizationName!: string;

  @ApiProperty({ example: 'acme-legal', description: 'URL-safe slug (alphanumeric + hyphens)' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug!: string;
}
