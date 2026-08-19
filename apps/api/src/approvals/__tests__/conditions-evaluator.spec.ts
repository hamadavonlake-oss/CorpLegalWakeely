import { evaluateConditions, type ApprovalRuleConditionData, type ObjectData } from '../conditions-evaluator';

describe('Conditions Evaluator', () => {
  const baseObject: ObjectData = {
    type: 'vendor_agreement',
    category: 'vendor',
    totalValue: '75000',
    totalCurrency: 'JOD',
    countryCode: 'JO',
    entityId: 'ent-1',
    classification: 'confidential',
  };

  describe('empty conditions', () => {
    it('returns true when conditions array is empty (default rule matches everything)', () => {
      expect(evaluateConditions([], baseObject)).toBe(true);
    });

    it('returns true when conditions is undefined', () => {
      expect(evaluateConditions(undefined as unknown as ApprovalRuleConditionData[], baseObject)).toBe(true);
    });
  });

  describe('equals operator', () => {
    it('matches string field equals', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'equals', value: 'vendor_agreement' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when value differs', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'equals', value: 'nda' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('not_equals operator', () => {
    it('matches when values differ', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'not_equals', value: 'nda' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when values are equal', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'not_equals', value: 'vendor_agreement' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('greater_than operator', () => {
    it('matches when numeric value is greater', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'greater_than', value: '50000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when numeric value is less', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'greater_than', value: '100000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });

    it('matches when value equals (strict greater than does not match equal)', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'greater_than', value: '75000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('greater_than_or_equal operator', () => {
    it('matches when value is greater', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'greater_than_or_equal', value: '50000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('matches when value is equal', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'greater_than_or_equal', value: '75000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when value is less', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'greater_than_or_equal', value: '100000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('less_than operator', () => {
    it('matches when numeric value is less', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'less_than', value: '100000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when value is greater', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'less_than', value: '50000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('less_than_or_equal operator', () => {
    it('matches when value is equal', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'less_than_or_equal', value: '75000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when value is greater', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'total_value', operator: 'less_than_or_equal', value: '50000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('in operator', () => {
    it('matches when value is in the comma-separated list', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'in', value: 'nda, vendor_agreement, employment' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when value is not in list', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'in', value: 'nda, employment' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });

    it('trims whitespace in the list', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'in', value: 'nda,  vendor_agreement  , employment' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });
  });

  describe('contains operator', () => {
    it('matches when value is a substring (case-insensitive)', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'contains', value: 'VENDOR' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('does not match when value is not a substring', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'contains', value: 'nda' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('multiple conditions (AND)', () => {
    it('returns true when all conditions match', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'equals', value: 'vendor_agreement' },
        { field: 'total_value', operator: 'greater_than', value: '50000' },
        { field: 'country_code', operator: 'equals', value: 'JO' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(true);
    });

    it('returns false when any condition fails', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'equals', value: 'vendor_agreement' },
        { field: 'total_value', operator: 'greater_than', value: '100000' }, // fails
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });

    it('returns false on first failing condition (short-circuit)', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'equals', value: 'nda' }, // fails first
        { field: 'total_value', operator: 'greater_than', value: '100000' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('missing fields', () => {
    it('returns false when field is missing from object', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'entity_id', operator: 'equals', value: 'ent-1' },
      ];
      const partialObject: ObjectData = { type: 'nda' }; // no entityId
      expect(evaluateConditions(conditions, partialObject)).toBe(false);
    });

    it('returns false when field value is null', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'entity_id', operator: 'equals', value: 'ent-1' },
      ];
      const partialObject: ObjectData = { entityId: null };
      expect(evaluateConditions(conditions, partialObject)).toBe(false);
    });
  });

  describe('unknown operator', () => {
    it('returns false for unknown operator', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'regex', value: '.*' },
      ];
      expect(evaluateConditions(conditions, baseObject)).toBe(false);
    });
  });

  describe('document-specific field mapping', () => {
    it('resolves "type" field to documentType for documents', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'type', operator: 'equals', value: 'contract_draft' },
      ];
      const docObject: ObjectData = {
        documentType: 'contract_draft',
        documentClassification: 'confidential',
      };
      expect(evaluateConditions(conditions, docObject)).toBe(true);
    });

    it('resolves "classification" field to documentClassification for documents', () => {
      const conditions: ApprovalRuleConditionData[] = [
        { field: 'classification', operator: 'equals', value: 'confidential' },
      ];
      const docObject: ObjectData = {
        documentType: 'contract_draft',
        documentClassification: 'confidential',
      };
      expect(evaluateConditions(conditions, docObject)).toBe(true);
    });
  });
});
