import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  IsBoolean,
  IsIn,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Rule DTOs ─────────────────────────────────────────────────────────

export class CreateApprovalRuleConditionDto {
  @IsIn(['type', 'category', 'total_value', 'total_currency', 'country_code', 'entity_id', 'classification'])
  field!: string;

  @IsIn([
    'equals', 'not_equals', 'greater_than', 'less_than',
    'greater_than_or_equal', 'less_than_or_equal', 'in', 'contains',
  ])
  operator!: string;

  @IsString()
  value!: string;
}

export class CreateApprovalRuleStepDto {
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  approverRole?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsBoolean()
  canDelegate?: boolean;

  @IsOptional()
  @IsBoolean()
  canSkip?: boolean;
}

export class CreateApprovalRuleDto {
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

  @IsIn(['contract', 'document'])
  objectType!: 'contract' | 'document';

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsIn(['sequential', 'parallel'])
  approvalType!: 'sequential' | 'parallel';

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  escalationMinutes?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateApprovalRuleConditionDto)
  conditions!: CreateApprovalRuleConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateApprovalRuleStepDto)
  steps!: CreateApprovalRuleStepDto[];
}

export class UpdateApprovalRuleDto {
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
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsIn(['sequential', 'parallel'])
  approvalType?: 'sequential' | 'parallel';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  escalationMinutes?: number;

  @IsOptional()
  @IsInt()
  rowVersion?: number;
}

// ─── Instance DTOs ─────────────────────────────────────────────────────

export class SubmitForApprovalDto {
  @IsIn(['contract', 'document'])
  objectType!: 'contract' | 'document';

  @IsUUID()
  objectId!: string;

  @IsOptional()
  @IsString()
  submitNotes?: string;
}

export class DecideApprovalStepDto {
  @IsIn(['approved', 'rejected', 'changes_requested'])
  decision!: 'approved' | 'rejected' | 'changes_requested';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DelegateApprovalStepDto {
  @IsUUID()
  delegateTo!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SkipApprovalStepDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
