export enum LegalRequestStatus {
  draft = 'draft',
  submitted = 'submitted',
  triaged = 'triaged',
  in_progress = 'in_progress',
  converted_to_matter = 'converted_to_matter',
  closed = 'closed',
  cancelled = 'cancelled',
  rejected = 'rejected',
  waiting_for_information = 'waiting_for_information',
}

export enum MatterStatus {
  open = 'open',
  in_progress = 'in_progress',
  on_hold = 'on_hold',
  waiting_for_information = 'waiting_for_information',
  resolved = 'resolved',
  closed = 'closed',
  archived = 'archived',
  cancelled = 'cancelled',
}

export enum ContractStatus {
  draft = 'draft',
  under_review = 'under_review',
  changes_requested = 'changes_requested',
  pending_approval = 'pending_approval',
  approved = 'approved',
  pending_signature = 'pending_signature',
  signed = 'signed',
  active = 'active',
  expired = 'expired',
  terminated = 'terminated',
  archived = 'archived',
  rejected = 'rejected',
  draft_new_version = 'draft_new_version',
}

export enum DocumentStatus {
  draft = 'draft',
  under_review = 'under_review',
  changes_requested = 'changes_requested',
  approved = 'approved',
  exported = 'exported',
  filed = 'filed',
  archived = 'archived',
}

export enum ApprovalDecision {
  approved = 'approved',
  rejected = 'rejected',
  changes_requested = 'changes_requested',
}

export enum ApprovalStepType {
  sequential = 'sequential',
  parallel = 'parallel',
}

export enum ConflictCheckStatus {
  not_checked = 'not_checked',
  no_match = 'no_match',
  possible_match = 'possible_match',
  requires_review = 'requires_review',
  cleared_by_lawyer = 'cleared_by_lawyer',
  blocked = 'blocked',
}

export enum SignatureStatus {
  pending = 'pending',
  signed = 'signed',
  declined = 'declined',
  unknown = 'unknown',
}

export enum NotificationStatus {
  unread = 'unread',
  read = 'read',
  delivered = 'delivered',
  failed = 'failed',
}

export enum AuditAction {
  create = 'create',
  read = 'read',
  update = 'update',
  delete = 'delete',
  login = 'login',
  logout = 'logout',
  export = 'export',
  approve = 'approve',
  reject = 'reject',
  upload = 'upload',
  download = 'download',
  sign = 'sign',
  legal_hold = 'legal_hold',
  retention = 'retention',
}

export enum RoleCode {
  enterprise_owner = 'enterprise_owner',
  legal_admin = 'legal_admin',
  general_counsel = 'general_counsel',
  lawyer = 'lawyer',
  contract_manager = 'contract_manager',
  business_requester = 'business_requester',
  finance_approver = 'finance_approver',
  executive_approver = 'executive_approver',
  auditor = 'auditor',
  platform_admin = 'platform_admin',
}

export enum MfaMethod {
  totp = 'totp',
}

export enum WebhookDeliveryStatus {
  pending = 'pending',
  success = 'success',
  failed = 'failed',
  dead_letter = 'dead_letter',
}

export enum ClassificationLevel {
  public = 'public',
  internal = 'internal',
  confidential = 'confidential',
  restricted = 'restricted',
}

export enum ExportFormat {
  pdf = 'pdf',
  docx = 'docx',
}

export enum VirusScanStatus {
  pending = 'pending',
  clean = 'clean',
  infected = 'infected',
  error = 'error',
}
