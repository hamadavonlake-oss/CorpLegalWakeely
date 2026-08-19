import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  IsDateString,
  IsNumber,
  IsIn,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractStatus, ClassificationLevel, SignatureStatus } from '@glo/shared';

// ─── Contract DTOs ─────────────────────────────────────────────────────

export class CreateContractDto {
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
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterpartyNameEn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsString()
  totalCurrency?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;
}

export class UpdateContractDto {
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
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  counterpartyNameEn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsString()
  totalCurrency?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: ClassificationLevel;

  @IsOptional()
  @IsInt()
  rowVersion?: number;
}

export class TransitionContractDto {
  @IsEnum(ContractStatus)
  to!: ContractStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

// ─── Contract Party DTOs ───────────────────────────────────────────────

export class CreateContractPartyDto {
  @IsIn(['internal', 'external'])
  partyType!: 'internal' | 'external';

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsString()
  @MaxLength(100)
  role!: string;

  @IsOptional()
  contactInfo?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  registrationNo?: string;

  @IsOptional()
  @IsString()
  taxId?: string;
}

export class UpdateContractPartyDto {
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
  @MaxLength(100)
  role?: string;

  @IsOptional()
  contactInfo?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  registrationNo?: string;

  @IsOptional()
  @IsString()
  taxId?: string;
}

// ─── Contract Value DTOs ──────────────────────────────────────────────

export class CreateContractValueDto {
  @IsIn(['base', 'tax', 'fee', 'discount', 'penalty'])
  valueType!: 'base' | 'tax' | 'fee' | 'discount' | 'penalty';

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  year?: number;
}

export class UpdateContractValueDto {
  @IsOptional()
  @IsIn(['base', 'tax', 'fee', 'discount', 'penalty'])
  valueType?: 'base' | 'tax' | 'fee' | 'discount' | 'penalty';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  year?: number;
}

// ─── Contract Signature DTOs ──────────────────────────────────────────

export class CreateContractSignatureDto {
  @IsString()
  @MaxLength(255)
  signerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  signerNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerTitle?: string;

  @IsOptional()
  @IsUUID()
  signerUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;
}

export class UpdateContractSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  signerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  signerNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerTitle?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;
}

export class RecordSignatureDto {
  @IsEnum(SignatureStatus)
  status!: SignatureStatus;

  @IsOptional()
  @IsString()
  signedDocumentUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
