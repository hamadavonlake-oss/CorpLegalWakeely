import {
  CONFLICT_CHECK_TRANSITIONS,
  isConflictCheckTransitionAllowed,
} from '../conflict-check.state-machine';
import { ConflictCheckStatus } from '@glo/shared';

describe('Conflict Check state machine', () => {
  describe('CONFLICT_CHECK_TRANSITIONS map', () => {
    it('defines transitions for all 6 statuses', () => {
      const allStatuses: ConflictCheckStatus[] = [
        ConflictCheckStatus.not_checked,
        ConflictCheckStatus.no_match,
        ConflictCheckStatus.possible_match,
        ConflictCheckStatus.requires_review,
        ConflictCheckStatus.cleared_by_lawyer,
        ConflictCheckStatus.blocked,
      ];
      for (const s of allStatuses) {
        expect(CONFLICT_CHECK_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(CONFLICT_CHECK_TRANSITIONS[s])).toBe(true);
      }
    });
  });

  describe('isConflictCheckTransitionAllowed', () => {
    // ─── From not_checked ────────────────────────────────────────

    it('allows not_checked → no_match', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.not_checked,
          ConflictCheckStatus.no_match,
        ),
      ).toBe(true);
    });

    it('allows not_checked → possible_match', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.not_checked,
          ConflictCheckStatus.possible_match,
        ),
      ).toBe(true);
    });

    it('allows not_checked → requires_review', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.not_checked,
          ConflictCheckStatus.requires_review,
        ),
      ).toBe(true);
    });

    it('allows not_checked → cleared_by_lawyer', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.not_checked,
          ConflictCheckStatus.cleared_by_lawyer,
        ),
      ).toBe(true);
    });

    it('allows not_checked → blocked', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.not_checked,
          ConflictCheckStatus.blocked,
        ),
      ).toBe(true);
    });

    // ─── Reset paths ────────────────────────────────────────────

    it('allows no_match → not_checked (reset)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.no_match,
          ConflictCheckStatus.not_checked,
        ),
      ).toBe(true);
    });

    it('allows possible_match → not_checked (reset)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.possible_match,
          ConflictCheckStatus.not_checked,
        ),
      ).toBe(true);
    });

    it('allows requires_review → not_checked (reset)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.requires_review,
          ConflictCheckStatus.not_checked,
        ),
      ).toBe(true);
    });

    it('allows cleared_by_lawyer → not_checked (reset)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.cleared_by_lawyer,
          ConflictCheckStatus.not_checked,
        ),
      ).toBe(true);
    });

    it('allows blocked → not_checked (reset)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.blocked,
          ConflictCheckStatus.not_checked,
        ),
      ).toBe(true);
    });

    // ─── Resolution paths ───────────────────────────────────────

    it('allows possible_match → cleared_by_lawyer', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.possible_match,
          ConflictCheckStatus.cleared_by_lawyer,
        ),
      ).toBe(true);
    });

    it('allows possible_match → blocked', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.possible_match,
          ConflictCheckStatus.blocked,
        ),
      ).toBe(true);
    });

    it('allows requires_review → cleared_by_lawyer', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.requires_review,
          ConflictCheckStatus.cleared_by_lawyer,
        ),
      ).toBe(true);
    });

    it('allows requires_review → blocked', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.requires_review,
          ConflictCheckStatus.blocked,
        ),
      ).toBe(true);
    });

    // ─── Invalid transitions ───────────────────────────────────

    it('rejects no_match → cleared_by_lawyer (must reset first)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.no_match,
          ConflictCheckStatus.cleared_by_lawyer,
        ),
      ).toBe(false);
    });

    it('rejects no_match → blocked (must reset first)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.no_match,
          ConflictCheckStatus.blocked,
        ),
      ).toBe(false);
    });

    it('rejects cleared_by_lawyer → blocked (must reset first)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.cleared_by_lawyer,
          ConflictCheckStatus.blocked,
        ),
      ).toBe(false);
    });

    it('rejects blocked → cleared_by_lawyer (must reset first)', () => {
      expect(
        isConflictCheckTransitionAllowed(
          ConflictCheckStatus.blocked,
          ConflictCheckStatus.cleared_by_lawyer,
        ),
      ).toBe(false);
    });
  });
});
