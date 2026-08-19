import {
  CONTRACT_TRANSITIONS,
  CONTRACT_TERMINAL_STATES,
  CONTRACT_EDITABLE_STATES,
  CONTRACT_ACTIVE_STATES,
  isContractTransitionAllowed,
} from '../contract.state-machine';
import { ContractStatus } from '@glo/shared';

describe('Contract state machine', () => {
  describe('CONTRACT_TRANSITIONS map', () => {
    it('defines transitions for all 13 statuses', () => {
      const allStatuses: ContractStatus[] = [
        ContractStatus.draft,
        ContractStatus.under_review,
        ContractStatus.changes_requested,
        ContractStatus.pending_approval,
        ContractStatus.approved,
        ContractStatus.pending_signature,
        ContractStatus.signed,
        ContractStatus.active,
        ContractStatus.expired,
        ContractStatus.terminated,
        ContractStatus.archived,
        ContractStatus.rejected,
        ContractStatus.draft_new_version,
      ];
      expect(allStatuses).toHaveLength(13);
      for (const s of allStatuses) {
        expect(CONTRACT_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(CONTRACT_TRANSITIONS[s])).toBe(true);
      }
    });

    it('marks rejected and archived as terminal', () => {
      expect(CONTRACT_TERMINAL_STATES.size).toBe(2);
      expect(CONTRACT_TERMINAL_STATES.has(ContractStatus.rejected)).toBe(true);
      expect(CONTRACT_TERMINAL_STATES.has(ContractStatus.archived)).toBe(true);
    });

    it('terminal states have empty transition arrays', () => {
      expect(CONTRACT_TRANSITIONS[ContractStatus.rejected]).toEqual([]);
      expect(CONTRACT_TRANSITIONS[ContractStatus.archived]).toEqual([]);
    });
  });

  describe('State sets', () => {
    it('CONTRACT_EDITABLE_STATES includes draft, under_review, changes_requested, draft_new_version', () => {
      expect(CONTRACT_EDITABLE_STATES.has(ContractStatus.draft)).toBe(true);
      expect(CONTRACT_EDITABLE_STATES.has(ContractStatus.under_review)).toBe(true);
      expect(CONTRACT_EDITABLE_STATES.has(ContractStatus.changes_requested)).toBe(true);
      expect(CONTRACT_EDITABLE_STATES.has(ContractStatus.draft_new_version)).toBe(true);
      // Approved contracts are NOT editable
      expect(CONTRACT_EDITABLE_STATES.has(ContractStatus.approved)).toBe(false);
      expect(CONTRACT_EDITABLE_STATES.has(ContractStatus.active)).toBe(false);
    });

    it('CONTRACT_ACTIVE_STATES includes active, signed, pending_signature', () => {
      expect(CONTRACT_ACTIVE_STATES.has(ContractStatus.active)).toBe(true);
      expect(CONTRACT_ACTIVE_STATES.has(ContractStatus.signed)).toBe(true);
      expect(CONTRACT_ACTIVE_STATES.has(ContractStatus.pending_signature)).toBe(true);
      // Draft is NOT active
      expect(CONTRACT_ACTIVE_STATES.has(ContractStatus.draft)).toBe(false);
    });
  });

  describe('isContractTransitionAllowed', () => {
    // ─── Happy path lifecycle ───────────────────────────────────

    it('allows draft → under_review', () => {
      expect(isContractTransitionAllowed(ContractStatus.draft, ContractStatus.under_review)).toBe(true);
    });

    it('allows under_review → pending_approval', () => {
      expect(isContractTransitionAllowed(ContractStatus.under_review, ContractStatus.pending_approval)).toBe(true);
    });

    it('allows pending_approval → approved', () => {
      expect(isContractTransitionAllowed(ContractStatus.pending_approval, ContractStatus.approved)).toBe(true);
    });

    it('allows approved → pending_signature', () => {
      expect(isContractTransitionAllowed(ContractStatus.approved, ContractStatus.pending_signature)).toBe(true);
    });

    it('allows pending_signature → signed', () => {
      expect(isContractTransitionAllowed(ContractStatus.pending_signature, ContractStatus.signed)).toBe(true);
    });

    it('allows signed → active', () => {
      expect(isContractTransitionAllowed(ContractStatus.signed, ContractStatus.active)).toBe(true);
    });

    it('allows approved → active (skip signature)', () => {
      expect(isContractTransitionAllowed(ContractStatus.approved, ContractStatus.active)).toBe(true);
    });

    it('allows active → expired', () => {
      expect(isContractTransitionAllowed(ContractStatus.active, ContractStatus.expired)).toBe(true);
    });

    it('allows active → terminated', () => {
      expect(isContractTransitionAllowed(ContractStatus.active, ContractStatus.terminated)).toBe(true);
    });

    it('allows expired → draft_new_version (renewal)', () => {
      expect(isContractTransitionAllowed(ContractStatus.expired, ContractStatus.draft_new_version)).toBe(true);
    });

    it('allows draft_new_version → under_review', () => {
      expect(isContractTransitionAllowed(ContractStatus.draft_new_version, ContractStatus.under_review)).toBe(true);
    });

    // ─── Reviewer feedback paths ────────────────────────────────

    it('allows under_review → changes_requested', () => {
      expect(isContractTransitionAllowed(ContractStatus.under_review, ContractStatus.changes_requested)).toBe(true);
    });

    it('allows changes_requested → under_review (resubmit)', () => {
      expect(isContractTransitionAllowed(ContractStatus.changes_requested, ContractStatus.under_review)).toBe(true);
    });

    it('allows pending_approval → changes_requested', () => {
      expect(isContractTransitionAllowed(ContractStatus.pending_approval, ContractStatus.changes_requested)).toBe(true);
    });

    it('allows pending_approval → rejected', () => {
      expect(isContractTransitionAllowed(ContractStatus.pending_approval, ContractStatus.rejected)).toBe(true);
    });

    it('allows under_review → rejected', () => {
      expect(isContractTransitionAllowed(ContractStatus.under_review, ContractStatus.rejected)).toBe(true);
    });

    // ─── Invalid transitions ────────────────────────────────────

    it('rejects draft → approved (must go through review + approval)', () => {
      expect(isContractTransitionAllowed(ContractStatus.draft, ContractStatus.approved)).toBe(false);
    });

    it('rejects draft → active (must go through full lifecycle)', () => {
      expect(isContractTransitionAllowed(ContractStatus.draft, ContractStatus.active)).toBe(false);
    });

    it('rejects active → draft (cannot reopen, must use draft_new_version from expired)', () => {
      expect(isContractTransitionAllowed(ContractStatus.active, ContractStatus.draft)).toBe(false);
    });

    it('rejects signed → draft (cannot edit signed contracts)', () => {
      expect(isContractTransitionAllowed(ContractStatus.signed, ContractStatus.draft)).toBe(false);
    });

    it('rejects archived → any (terminal state)', () => {
      const allOtherStatuses = Object.values(ContractStatus).filter(
        (s) => s !== ContractStatus.archived,
      );
      for (const s of allOtherStatuses) {
        expect(isContractTransitionAllowed(ContractStatus.archived, s)).toBe(false);
      }
    });

    it('rejects rejected → any (terminal state)', () => {
      const allOtherStatuses = Object.values(ContractStatus).filter(
        (s) => s !== ContractStatus.rejected,
      );
      for (const s of allOtherStatuses) {
        expect(isContractTransitionAllowed(ContractStatus.rejected, s)).toBe(false);
      }
    });

    it('rejects expired → active (must renew via draft_new_version)', () => {
      expect(isContractTransitionAllowed(ContractStatus.expired, ContractStatus.active)).toBe(false);
    });

    it('rejects terminated → active (cannot revive a terminated contract)', () => {
      expect(isContractTransitionAllowed(ContractStatus.terminated, ContractStatus.active)).toBe(false);
    });

    it('rejects under_review → signed (must go through approval)', () => {
      expect(isContractTransitionAllowed(ContractStatus.under_review, ContractStatus.signed)).toBe(false);
    });

    it('rejects pending_signature → active (must be signed first)', () => {
      expect(isContractTransitionAllowed(ContractStatus.pending_signature, ContractStatus.active)).toBe(false);
    });
  });
});
