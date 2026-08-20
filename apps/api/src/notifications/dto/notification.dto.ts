import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsIn,
  IsObject,
  IsDateString,
  MaxLength,
} from 'class-validator';

// ─── Notification DTOs ─────────────────────────────────────────────────

export class CreateNotificationDto {
  @IsUUID()
  userId!: string;

  @IsString()
  type!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  @MaxLength(1000)
  body!: string;

  @IsOptional()
  @IsIn(['info', 'success', 'warning', 'error'])
  severity?: string;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsOptional()
  @IsString()
  objectType?: string;

  @IsOptional()
  @IsString()
  objectId?: string;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

// ─── Preference DTOs ───────────────────────────────────────────────────

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsObject()
  enabledTypes?: Record<string, boolean>;

  @IsOptional()
  @IsIn(['instant', 'hourly', 'daily', 'weekly'])
  digestFrequency?: string;

  @IsOptional()
  @IsObject()
  quietHours?: { start: string; end: string; timezone: string };
}
