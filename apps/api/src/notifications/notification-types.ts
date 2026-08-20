/**
 * Notification type constants — used as the `type` field on Notification rows.
 * Per build-pack/02-mvp-prd.md, event types include:
 *   - request submitted
 *   - matter assigned
 *   - approval needed
 *   - approval decision
 *   - deadline approaching
 *   - contract status changed
 *   - document uploaded
 */
export const NOTIFICATION_TYPES = {
  // Legal Requests
  REQUEST_SUBMITTED: 'request.submitted',
  REQUEST_ASSIGNED: 'request.assigned',
  REQUEST_STATUS_CHANGED: 'request.status_changed',
  REQUEST_INFO_REQUESTED: 'request.info_requested',
  // Matters
  MATTER_CREATED: 'matter.created',
  MATTER_ASSIGNED: 'matter.assigned',
  MATTER_STATUS_CHANGED: 'matter.status_changed',
  // Conflict Checks
  CONFLICT_CHECK_BLOCKED: 'conflict_check.blocked',
  CONFLICT_CHECK_REQUIRES_REVIEW: 'conflict_check.requires_review',
  // Contracts
  CONTRACT_STATUS_CHANGED: 'contract.status_changed',
  CONTRACT_EXPIRING: 'contract.expiring',
  CONTRACT_EXPIRED: 'contract.expired',
  // Documents
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_APPROVED: 'document.approved',
  DOCUMENT_CHANGES_REQUESTED: 'document.changes_requested',
  // Approvals
  APPROVAL_NEEDED: 'approval.needed',
  APPROVAL_DECISION: 'approval.decision',
  APPROVAL_DELEGATED: 'approval.delegated',
  APPROVAL_ESCALATED: 'approval.escalated',
  APPROVAL_COMPLETED: 'approval.completed',
  APPROVAL_REJECTED: 'approval.rejected',
  // Deadlines
  DEADLINE_APPROACHING: 'deadline.approaching',
  DEADLINE_OVERDUE: 'deadline.overdue',
  // System
  SYSTEM_ANNOUNCEMENT: 'system.announcement',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * Severity levels for notifications.
 */
export const NOTIFICATION_SEVERITY = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type NotificationSeverity =
  | (typeof NOTIFICATION_SEVERITY)[keyof typeof NOTIFICATION_SEVERITY];

/**
 * Digest frequency options for notification preferences.
 */
export const DIGEST_FREQUENCY = {
  INSTANT: 'instant',
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
} as const;

export type DigestFrequency = (typeof DIGEST_FREQUENCY)[keyof typeof DIGEST_FREQUENCY];

/**
 * Default notification preferences (used when a user has no preference row).
 */
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppEnabled: true,
  emailEnabled: false,
  enabledTypes: {},
  digestFrequency: 'instant',
  quietHours: null,
};
