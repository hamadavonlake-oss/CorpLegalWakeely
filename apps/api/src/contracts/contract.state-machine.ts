import { ContractStatus } from '@glo/shared';

/**
 * Contract state machine (13 states, per build-pack/02-mvp-prd.md).
 *
 *   draft
 *     → under_review
 *     → cancelled (via draft_new_version path — see below)
 *     → archived
 *   under_review
 *     → changes_requested
 *     → pending_approval
 *     → rejected
 *     → draft (return to draft for edits)
 *   changes_requested
 *     → under_review (resubmit after edits)
 *     → draft (return to draft for major edits)
 *   pending_approval
 *     → approved
 *     → rejected
 *     → changes_requested
 *     → draft (cancel approval, return to drafting)
 *   approved
 *     → pending_signature
 *     → active (skip signature if not required)
 *     → archived (cancel before signature)
 *   pending_signature
 *     → signed
 *     → archived (cancel before signing)
 *   signed
 *     → active
 *   active
 *     → expired (auto, when expiry_date passes)
 *     → terminated (early termination)
 *     → archived (closed without termination)
 *   expired
 *     → archived
 *     → draft_new_version (renewal)
 *   terminated
 *     → archived
 *   draft_new_version
 *     → under_review
 *     → archived
 *   rejected
 *     (terminal)
 *   archived
 *     (terminal)
 *
 * Note: `cancelled` is not a status in the 13-state machine. To cancel a
 * contract before signature, transition to `archived`. This matches the
 * PRD which lists `archived` as the catch-all terminal state.
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  [ContractStatus.draft]: [
    ContractStatus.under_review,
    ContractStatus.archived,
  ],
  [ContractStatus.under_review]: [
    ContractStatus.changes_requested,
    ContractStatus.pending_approval,
    ContractStatus.rejected,
    ContractStatus.draft,
  ],
  [ContractStatus.changes_requested]: [
    ContractStatus.under_review,
    ContractStatus.draft,
  ],
  [ContractStatus.pending_approval]: [
    ContractStatus.approved,
    ContractStatus.rejected,
    ContractStatus.changes_requested,
    ContractStatus.draft,
  ],
  [ContractStatus.approved]: [
    ContractStatus.pending_signature,
    ContractStatus.active,
    ContractStatus.archived,
  ],
  [ContractStatus.pending_signature]: [
    ContractStatus.signed,
    ContractStatus.archived,
  ],
  [ContractStatus.signed]: [
    ContractStatus.active,
  ],
  [ContractStatus.active]: [
    ContractStatus.expired,
    ContractStatus.terminated,
    ContractStatus.archived,
  ],
  [ContractStatus.expired]: [
    ContractStatus.archived,
    ContractStatus.draft_new_version,
  ],
  [ContractStatus.terminated]: [
    ContractStatus.archived,
  ],
  [ContractStatus.draft_new_version]: [
    ContractStatus.under_review,
    ContractStatus.archived,
  ],
  [ContractStatus.rejected]: [],
  [ContractStatus.archived]: [],
};

export const CONTRACT_TERMINAL_STATES: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.rejected,
  ContractStatus.archived,
]);

/**
 * Statuses from which the contract can be edited (fields like title,
 * description, parties, values). Once approved, edits require creating
 * a new version (`draft_new_version`).
 */
export const CONTRACT_EDITABLE_STATES: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.draft,
  ContractStatus.under_review,
  ContractStatus.changes_requested,
  ContractStatus.draft_new_version,
]);

/**
 * Statuses that represent a "live" contract (counts towards active
 * contract metrics on dashboards).
 */
export const CONTRACT_ACTIVE_STATES: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.active,
  ContractStatus.signed,
  ContractStatus.pending_signature,
]);

/**
 * Check whether a transition is allowed by the state machine.
 */
export function isContractTransitionAllowed(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  const allowed = CONTRACT_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
