import {
  LEGAL_REQUEST_TRANSITIONS,
  LEGAL_REQUEST_TERMINAL_STATES,
  isLegalRequestTransitionAllowed,
} from '../legal-request.state-machine';
import { LegalRequestStatus } from '@glo/shared';

describe('Legal Request state machine', () => {
  describe('LEGAL_REQUEST_TRANSITIONS map', () => {
    it('defines transitions for all 9 statuses', () => {
      const allStatuses: LegalRequestStatus[] = [
        LegalRequestStatus.draft,
        LegalRequestStatus.submitted,
        LegalRequestStatus.triaged,
        LegalRequestStatus.in_progress,
        LegalRequestStatus.converted_to_matter,
        LegalRequestStatus.closed,
        LegalRequestStatus.cancelled,
        LegalRequestStatus.rejected,
        LegalRequestStatus.waiting_for_information,
      ];
      for (const s of allStatuses) {
        expect(LEGAL_REQUEST_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(LEGAL_REQUEST_TRANSITIONS[s])).toBe(true);
      }
    });

    it('marks converted_to_matter, closed, cancelled, rejected as terminal', () => {
      expect(LEGAL_REQUEST_TERMINAL_STATES.size).toBe(4);
      expect(LEGAL_REQUEST_TERMINAL_STATES.has(LegalRequestStatus.converted_to_matter)).toBe(true);
      expect(LEGAL_REQUEST_TERMINAL_STATES.has(LegalRequestStatus.closed)).toBe(true);
      expect(LEGAL_REQUEST_TERMINAL_STATES.has(LegalRequestStatus.cancelled)).toBe(true);
      expect(LEGAL_REQUEST_TERMINAL_STATES.has(LegalRequestStatus.rejected)).toBe(true);
    });

    it('terminal states have empty transition arrays', () => {
      expect(LEGAL_REQUEST_TRANSITIONS[LegalRequestStatus.converted_to_matter]).toEqual([]);
      expect(LEGAL_REQUEST_TRANSITIONS[LegalRequestStatus.closed]).toEqual([]);
      expect(LEGAL_REQUEST_TRANSITIONS[LegalRequestStatus.cancelled]).toEqual([]);
      expect(LEGAL_REQUEST_TRANSITIONS[LegalRequestStatus.rejected]).toEqual([]);
    });
  });

  describe('isLegalRequestTransitionAllowed', () => {
    it('allows draft → submitted', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.draft,
          LegalRequestStatus.submitted,
        ),
      ).toBe(true);
    });

    it('allows draft → cancelled', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.draft,
          LegalRequestStatus.cancelled,
        ),
      ).toBe(true);
    });

    it('allows submitted → triaged', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.submitted,
          LegalRequestStatus.triaged,
        ),
      ).toBe(true);
    });

    it('allows submitted → rejected', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.submitted,
          LegalRequestStatus.rejected,
        ),
      ).toBe(true);
    });

    it('allows triaged → in_progress', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.triaged,
          LegalRequestStatus.in_progress,
        ),
      ).toBe(true);
    });

    it('allows in_progress → converted_to_matter', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.in_progress,
          LegalRequestStatus.converted_to_matter,
        ),
      ).toBe(true);
    });

    it('allows waiting_for_information → triaged (re-triage)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.waiting_for_information,
          LegalRequestStatus.triaged,
        ),
      ).toBe(true);
    });

    it('allows waiting_for_information → in_progress', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.waiting_for_information,
          LegalRequestStatus.in_progress,
        ),
      ).toBe(true);
    });

    // ─── Invalid transitions ────────────────────────────────────

    it('rejects draft → in_progress (must go through submitted/triaged)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.draft,
          LegalRequestStatus.in_progress,
        ),
      ).toBe(false);
    });

    it('rejects draft → triaged (must submit first)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.draft,
          LegalRequestStatus.triaged,
        ),
      ).toBe(false);
    });

    it('rejects closed → in_progress (terminal state)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.closed,
          LegalRequestStatus.in_progress,
        ),
      ).toBe(false);
    });

    it('rejects rejected → submitted (terminal state)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.rejected,
          LegalRequestStatus.submitted,
        ),
      ).toBe(false);
    });

    it('rejects converted_to_matter → any (terminal state)', () => {
      const allOtherStatuses = Object.values(LegalRequestStatus).filter(
        (s) => s !== LegalRequestStatus.converted_to_matter,
      );
      for (const s of allOtherStatuses) {
        expect(
          isLegalRequestTransitionAllowed(
            LegalRequestStatus.converted_to_matter,
            s,
          ),
        ).toBe(false);
      }
    });

    it('rejects cancelled → any (terminal state)', () => {
      const allOtherStatuses = Object.values(LegalRequestStatus).filter(
        (s) => s !== LegalRequestStatus.cancelled,
      );
      for (const s of allOtherStatuses) {
        expect(
          isLegalRequestTransitionAllowed(
            LegalRequestStatus.cancelled,
            s,
          ),
        ).toBe(false);
      }
    });

    it('rejects in_progress → draft (backward not allowed)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.in_progress,
          LegalRequestStatus.draft,
        ),
      ).toBe(false);
    });

    it('rejects triaged → submitted (backward not allowed)', () => {
      expect(
        isLegalRequestTransitionAllowed(
          LegalRequestStatus.triaged,
          LegalRequestStatus.submitted,
        ),
      ).toBe(false);
    });
  });
});
