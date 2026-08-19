import { MatterStatus } from '@glo/shared';

/**
 * Matter state machine (8 states, per build-pack/02-mvp-prd.md).
 *
 *   open
 *     → in_progress
 *     → cancelled
 *   in_progress
 *     → on_hold
 *     → waiting_for_information
 *     → resolved
 *     → cancelled
 *   on_hold
 *     → in_progress
 *     → cancelled
 *   waiting_for_information
 *     → in_progress
 *     → cancelled
 *   resolved
 *     → closed
 *     → cancelled
 *   closed
 *     → archived
 *   archived
 *     (terminal)
 *   cancelled
 *     (terminal)
 */
export const MATTER_TRANSITIONS: Record<MatterStatus, MatterStatus[]> = {
  [MatterStatus.open]: [MatterStatus.in_progress, MatterStatus.cancelled],
  [MatterStatus.in_progress]: [
    MatterStatus.on_hold,
    MatterStatus.waiting_for_information,
    MatterStatus.resolved,
    MatterStatus.cancelled,
  ],
  [MatterStatus.on_hold]: [MatterStatus.in_progress, MatterStatus.cancelled],
  [MatterStatus.waiting_for_information]: [
    MatterStatus.in_progress,
    MatterStatus.cancelled,
  ],
  [MatterStatus.resolved]: [MatterStatus.closed, MatterStatus.cancelled],
  [MatterStatus.closed]: [MatterStatus.archived],
  [MatterStatus.archived]: [],
  [MatterStatus.cancelled]: [],
};

export const MATTER_TERMINAL_STATES: ReadonlySet<MatterStatus> = new Set([
  MatterStatus.archived,
  MatterStatus.cancelled,
]);

export function isMatterTransitionAllowed(
  from: MatterStatus,
  to: MatterStatus,
): boolean {
  const allowed = MATTER_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
