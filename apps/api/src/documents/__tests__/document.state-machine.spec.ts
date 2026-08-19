import {
  DOCUMENT_TRANSITIONS,
  DOCUMENT_TERMINAL_STATES,
  DOCUMENT_EDITABLE_STATES,
  isDocumentTransitionAllowed,
} from '../document.state-machine';
import { DocumentStatus } from '@glo/shared';

describe('Document state machine', () => {
  describe('DOCUMENT_TRANSITIONS map', () => {
    it('defines transitions for all 7 statuses', () => {
      const allStatuses: DocumentStatus[] = [
        DocumentStatus.draft,
        DocumentStatus.under_review,
        DocumentStatus.changes_requested,
        DocumentStatus.approved,
        DocumentStatus.exported,
        DocumentStatus.filed,
        DocumentStatus.archived,
      ];
      expect(allStatuses).toHaveLength(7);
      for (const s of allStatuses) {
        expect(DOCUMENT_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(DOCUMENT_TRANSITIONS[s])).toBe(true);
      }
    });

    it('marks archived as terminal', () => {
      expect(DOCUMENT_TERMINAL_STATES.size).toBe(1);
      expect(DOCUMENT_TERMINAL_STATES.has(DocumentStatus.archived)).toBe(true);
    });

    it('terminal states have empty transition arrays', () => {
      expect(DOCUMENT_TRANSITIONS[DocumentStatus.archived]).toEqual([]);
    });
  });

  describe('State sets', () => {
    it('DOCUMENT_EDITABLE_STATES includes draft, under_review, changes_requested', () => {
      expect(DOCUMENT_EDITABLE_STATES.has(DocumentStatus.draft)).toBe(true);
      expect(DOCUMENT_EDITABLE_STATES.has(DocumentStatus.under_review)).toBe(true);
      expect(DOCUMENT_EDITABLE_STATES.has(DocumentStatus.changes_requested)).toBe(true);
      // Approved is NOT editable (immutable per Rule 12)
      expect(DOCUMENT_EDITABLE_STATES.has(DocumentStatus.approved)).toBe(false);
      expect(DOCUMENT_EDITABLE_STATES.has(DocumentStatus.exported)).toBe(false);
    });
  });

  describe('isDocumentTransitionAllowed', () => {
    // ─── Happy path lifecycle ───────────────────────────────────────

    it('allows draft → under_review', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.draft, DocumentStatus.under_review)).toBe(true);
    });

    it('allows under_review → approved', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.under_review, DocumentStatus.approved)).toBe(true);
    });

    it('allows approved → exported (PDF/DOCX export via Gotenberg)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.approved, DocumentStatus.exported)).toBe(true);
    });

    it('allows approved → filed', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.approved, DocumentStatus.filed)).toBe(true);
    });

    it('allows exported → filed', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.exported, DocumentStatus.filed)).toBe(true);
    });

    it('allows filed → archived', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.filed, DocumentStatus.archived)).toBe(true);
    });

    it('allows draft → archived (cancel)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.draft, DocumentStatus.archived)).toBe(true);
    });

    // ─── Reviewer feedback paths ──────────────────────────────────

    it('allows under_review → changes_requested', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.under_review, DocumentStatus.changes_requested)).toBe(true);
    });

    it('allows changes_requested → under_review (resubmit)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.changes_requested, DocumentStatus.under_review)).toBe(true);
    });

    it('allows changes_requested → draft (major rework)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.changes_requested, DocumentStatus.draft)).toBe(true);
    });

    it('allows under_review → draft (return to author)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.under_review, DocumentStatus.draft)).toBe(true);
    });

    it('allows draft → changes_requested (author self-review)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.draft, DocumentStatus.changes_requested)).toBe(true);
    });

    // ─── Invalid transitions ───────────────────────────────────────

    it('rejects draft → approved (must go through review)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.draft, DocumentStatus.approved)).toBe(false);
    });

    it('rejects approved → draft (approved is immutable — must create new document)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.approved, DocumentStatus.draft)).toBe(false);
    });

    it('rejects approved → under_review (approved is immutable)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.approved, DocumentStatus.under_review)).toBe(false);
    });

    it('rejects archived → any (terminal state)', () => {
      const allOtherStatuses = Object.values(DocumentStatus).filter(
        (s) => s !== DocumentStatus.archived,
      );
      for (const s of allOtherStatuses) {
        expect(isDocumentTransitionAllowed(DocumentStatus.archived, s)).toBe(false);
      }
    });

    it('rejects filed → draft (filed documents cannot be edited)', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.filed, DocumentStatus.draft)).toBe(false);
    });

    it('rejects exported → draft', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.exported, DocumentStatus.draft)).toBe(false);
    });

    it('rejects filed → under_review', () => {
      expect(isDocumentTransitionAllowed(DocumentStatus.filed, DocumentStatus.under_review)).toBe(false);
    });
  });
});
