import { DocumentStatus } from '@glo/shared';

/**
 * Document state machine (7 states, per build-pack/02-mvp-prd.md).
 *
 *   draft
 *     → under_review
 *     → changes_requested (author catches issues before review)
 *     → archived (cancel)
 *   under_review
 *     → changes_requested (reviewer requests edits)
 *     → approved
 *     → draft (return to author for major edits)
 *     → archived (cancel)
 *   changes_requested
 *     → under_review (author resubmits with edits)
 *     → draft (return to draft for major rework)
 *     → archived (cancel)
 *   approved
 *     → exported (PDF/DOCX export via Gotenberg — Phase 8)
 *     → filed (moved to long-term storage)
 *     → archived
 *     NOTE: Approved documents are IMMUTABLE. Any content change creates
 *     a new Document row with a new version, never modifies the approved one.
 *   exported
 *     → filed
 *     → archived
 *   filed
 *     → archived
 *   archived
 *     (terminal)
 *
 * Per Rule 12: Immutable approved document versions. Changes create new
 * versions, never overwrite. The approved DocumentVersion row's binary
 * is never modified — only new DocumentVersion rows can be added.
 */
export const DOCUMENT_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.draft]: [
    DocumentStatus.under_review,
    DocumentStatus.changes_requested,
    DocumentStatus.archived,
  ],
  [DocumentStatus.under_review]: [
    DocumentStatus.changes_requested,
    DocumentStatus.approved,
    DocumentStatus.draft,
    DocumentStatus.archived,
  ],
  [DocumentStatus.changes_requested]: [
    DocumentStatus.under_review,
    DocumentStatus.draft,
    DocumentStatus.archived,
  ],
  [DocumentStatus.approved]: [
    DocumentStatus.exported,
    DocumentStatus.filed,
    DocumentStatus.archived,
  ],
  [DocumentStatus.exported]: [
    DocumentStatus.filed,
    DocumentStatus.archived,
  ],
  [DocumentStatus.filed]: [
    DocumentStatus.archived,
  ],
  [DocumentStatus.archived]: [],
};

export const DOCUMENT_TERMINAL_STATES: ReadonlySet<DocumentStatus> = new Set([
  DocumentStatus.archived,
]);

/**
 * Statuses where the document content can be edited (new versions uploaded).
 * Once approved, no new versions can be added — a new Document must be
 * created instead.
 */
export const DOCUMENT_EDITABLE_STATES: ReadonlySet<DocumentStatus> = new Set([
  DocumentStatus.draft,
  DocumentStatus.under_review,
  DocumentStatus.changes_requested,
]);

/**
 * Check whether a transition is allowed by the state machine.
 */
export function isDocumentTransitionAllowed(
  from: DocumentStatus,
  to: DocumentStatus,
): boolean {
  const allowed = DOCUMENT_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
