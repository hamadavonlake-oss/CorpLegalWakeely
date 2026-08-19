import {
  MATTER_TRANSITIONS,
  MATTER_TERMINAL_STATES,
  isMatterTransitionAllowed,
} from '../matter.state-machine';
import { MatterStatus } from '@glo/shared';

describe('Matter state machine', () => {
  describe('MATTER_TRANSITIONS map', () => {
    it('defines transitions for all 8 statuses', () => {
      const allStatuses: MatterStatus[] = [
        MatterStatus.open,
        MatterStatus.in_progress,
        MatterStatus.on_hold,
        MatterStatus.waiting_for_information,
        MatterStatus.resolved,
        MatterStatus.closed,
        MatterStatus.archived,
        MatterStatus.cancelled,
      ];
      for (const s of allStatuses) {
        expect(MATTER_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(MATTER_TRANSITIONS[s])).toBe(true);
      }
    });

    it('marks archived and cancelled as terminal', () => {
      expect(MATTER_TERMINAL_STATES.size).toBe(2);
      expect(MATTER_TERMINAL_STATES.has(MatterStatus.archived)).toBe(true);
      expect(MATTER_TERMINAL_STATES.has(MatterStatus.cancelled)).toBe(true);
    });

    it('terminal states have empty transition arrays', () => {
      expect(MATTER_TRANSITIONS[MatterStatus.archived]).toEqual([]);
      expect(MATTER_TRANSITIONS[MatterStatus.cancelled]).toEqual([]);
    });
  });

  describe('isMatterTransitionAllowed', () => {
    // ─── Valid transitions ──────────────────────────────────────

    it('allows open → in_progress', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.open, MatterStatus.in_progress),
      ).toBe(true);
    });

    it('allows open → cancelled', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.open, MatterStatus.cancelled),
      ).toBe(true);
    });

    it('allows in_progress → on_hold', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.in_progress, MatterStatus.on_hold),
      ).toBe(true);
    });

    it('allows in_progress → waiting_for_information', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.in_progress, MatterStatus.waiting_for_information),
      ).toBe(true);
    });

    it('allows in_progress → resolved', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.in_progress, MatterStatus.resolved),
      ).toBe(true);
    });

    it('allows on_hold → in_progress (resume)', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.on_hold, MatterStatus.in_progress),
      ).toBe(true);
    });

    it('allows resolved → closed', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.resolved, MatterStatus.closed),
      ).toBe(true);
    });

    it('allows closed → archived', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.closed, MatterStatus.archived),
      ).toBe(true);
    });

    // ─── Invalid transitions ────────────────────────────────────

    it('rejects open → resolved (must go through in_progress)', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.open, MatterStatus.resolved),
      ).toBe(false);
    });

    it('rejects open → closed (must resolve first)', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.open, MatterStatus.closed),
      ).toBe(false);
    });

    it('rejects archived → any (terminal state)', () => {
      const allOtherStatuses = Object.values(MatterStatus).filter(
        (s) => s !== MatterStatus.archived,
      );
      for (const s of allOtherStatuses) {
        expect(isMatterTransitionAllowed(MatterStatus.archived, s)).toBe(false);
      }
    });

    it('rejects cancelled → any (terminal state)', () => {
      const allOtherStatuses = Object.values(MatterStatus).filter(
        (s) => s !== MatterStatus.cancelled,
      );
      for (const s of allOtherStatuses) {
        expect(isMatterTransitionAllowed(MatterStatus.cancelled, s)).toBe(false);
      }
    });

    it('rejects closed → in_progress (must archive, not reopen)', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.closed, MatterStatus.in_progress),
      ).toBe(false);
    });

    it('rejects resolved → in_progress (backward not allowed)', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.resolved, MatterStatus.in_progress),
      ).toBe(false);
    });

    it('rejects on_hold → resolved (must resume first)', () => {
      expect(
        isMatterTransitionAllowed(MatterStatus.on_hold, MatterStatus.resolved),
      ).toBe(false);
    });
  });
});
