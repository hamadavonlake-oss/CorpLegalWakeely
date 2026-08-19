import { ConflictCheckStatus } from '@glo/shared';

/**
 * Conflict Check status state machine (6 statuses, per build-pack/02-mvp-prd.md).
 *
 * Administrative-only — no automated legal analysis. The status reflects
 * the human reviewer's conclusion after manually searching for conflicts.
 *
 *   not_checked (default)
 *     → no_match          — search complete, no conflicts found
 *     → possible_match    — search complete, potential conflict identified
 *     → requires_review   — needs a senior lawyer's review
 *     → cleared_by_lawyer — lawyer reviewed and cleared
 *     → blocked           — confirmed conflict, action blocked
 *
 * After a result status is set, the check can be reset back to
 * `not_checked` for re-checking (e.g., if new information arrives).
 *
 *   no_match | possible_match | requires_review | cleared_by_lawyer | blocked
 *     → not_checked (reset)
 */
export const CONFLICT_CHECK_TRANSITIONS: Record<ConflictCheckStatus, ConflictCheckStatus[]> = {
  [ConflictCheckStatus.not_checked]: [
    ConflictCheckStatus.no_match,
    ConflictCheckStatus.possible_match,
    ConflictCheckStatus.requires_review,
    ConflictCheckStatus.cleared_by_lawyer,
    ConflictCheckStatus.blocked,
  ],
  [ConflictCheckStatus.no_match]: [ConflictCheckStatus.not_checked],
  [ConflictCheckStatus.possible_match]: [
    ConflictCheckStatus.not_checked,
    ConflictCheckStatus.cleared_by_lawyer,
    ConflictCheckStatus.blocked,
    ConflictCheckStatus.requires_review,
  ],
  [ConflictCheckStatus.requires_review]: [
    ConflictCheckStatus.not_checked,
    ConflictCheckStatus.cleared_by_lawyer,
    ConflictCheckStatus.blocked,
    ConflictCheckStatus.possible_match,
    ConflictCheckStatus.no_match,
  ],
  [ConflictCheckStatus.cleared_by_lawyer]: [ConflictCheckStatus.not_checked],
  [ConflictCheckStatus.blocked]: [ConflictCheckStatus.not_checked],
};

export function isConflictCheckTransitionAllowed(
  from: ConflictCheckStatus,
  to: ConflictCheckStatus,
): boolean {
  const allowed = CONFLICT_CHECK_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
