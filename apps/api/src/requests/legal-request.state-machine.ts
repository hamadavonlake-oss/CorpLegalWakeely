import { LegalRequestStatus } from '@glo/shared';

/**
 * Legal Request state machine (9 states, per build-pack/02-mvp-prd.md).
 *
 *   draft
 *     → submitted
 *     → cancelled
 *   submitted
 *     → triaged
 *     → rejected
 *     → waiting_for_information
 *     → cancelled
 *   triaged
 *     → in_progress
 *     → waiting_for_information
 *     → closed
 *     → cancelled
 *   in_progress
 *     → converted_to_matter
 *     → waiting_for_information
 *     → closed
 *     → cancelled
 *   converted_to_matter
 *     (terminal — no further transitions)
 *   closed
 *     (terminal)
 *   cancelled
 *     (terminal)
 *   rejected
 *     (terminal)
 *   waiting_for_information
 *     → triaged
 *     → in_progress
 *     → cancelled
 *
 * This map is the single source of truth for allowed transitions in the
 * system. The service consults this table before every status update.
 */
export const LEGAL_REQUEST_TRANSITIONS: Record<LegalRequestStatus, LegalRequestStatus[]> = {
  [LegalRequestStatus.draft]: [
    LegalRequestStatus.submitted,
    LegalRequestStatus.cancelled,
  ],
  [LegalRequestStatus.submitted]: [
    LegalRequestStatus.triaged,
    LegalRequestStatus.rejected,
    LegalRequestStatus.waiting_for_information,
    LegalRequestStatus.cancelled,
  ],
  [LegalRequestStatus.triaged]: [
    LegalRequestStatus.in_progress,
    LegalRequestStatus.waiting_for_information,
    LegalRequestStatus.closed,
    LegalRequestStatus.cancelled,
  ],
  [LegalRequestStatus.in_progress]: [
    LegalRequestStatus.converted_to_matter,
    LegalRequestStatus.waiting_for_information,
    LegalRequestStatus.closed,
    LegalRequestStatus.cancelled,
  ],
  [LegalRequestStatus.converted_to_matter]: [],
  [LegalRequestStatus.closed]: [],
  [LegalRequestStatus.cancelled]: [],
  [LegalRequestStatus.rejected]: [],
  [LegalRequestStatus.waiting_for_information]: [
    LegalRequestStatus.triaged,
    LegalRequestStatus.in_progress,
    LegalRequestStatus.cancelled,
  ],
};

/**
 * Terminal states — no further transitions allowed.
 */
export const LEGAL_REQUEST_TERMINAL_STATES: ReadonlySet<LegalRequestStatus> = new Set([
  LegalRequestStatus.converted_to_matter,
  LegalRequestStatus.closed,
  LegalRequestStatus.cancelled,
  LegalRequestStatus.rejected,
]);

/**
 * Check whether a transition is allowed by the state machine.
 */
export function isLegalRequestTransitionAllowed(
  from: LegalRequestStatus,
  to: LegalRequestStatus,
): boolean {
  const allowed = LEGAL_REQUEST_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
