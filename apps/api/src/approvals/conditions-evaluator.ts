import { Logger } from '@nestjs/common';

/**
 * Conditions Evaluator — determines whether an approval rule's conditions
 * all match a given object (contract or document).
 *
 * The evaluator is a pure function: given (conditions, objectData) → boolean.
 * It's exported separately so it can be unit-tested in isolation.
 */

export interface ApprovalRuleConditionData {
  field: string;
  operator: string;
  value: string;
}

export interface ObjectData {
  type?: string | null;
  category?: string | null;
  totalValue?: number | string | null; // Decimal comes as string from Prisma
  totalCurrency?: string | null;
  countryCode?: string | null;
  entityId?: string | null;
  classification?: string | null;
  // For documents:
  documentType?: string | null;
  documentClassification?: string | null;
}

/**
 * Evaluate whether all conditions match the given object data.
 * Conditions are AND'd together: all must match for the rule to apply.
 *
 * Returns true if:
 *   - The conditions array is empty (matches everything — default rule)
 *   - Every condition matches the object
 *
 * Returns false if:
 *   - Any condition fails
 *   - The field is missing from objectData
 */
export function evaluateConditions(
  conditions: ApprovalRuleConditionData[],
  objectData: ObjectData,
  logger?: Logger,
): boolean {
  if (!conditions || conditions.length === 0) {
    return true; // empty conditions = matches everything
  }

  for (const cond of conditions) {
    if (!evaluateCondition(cond, objectData)) {
      logger?.debug(
        `Condition failed: field=${cond.field} op=${cond.operator} ` +
          `value=${cond.value} (object had: ${getObjectValue(cond.field, objectData)})`,
      );
      return false;
    }
  }
  return true;
}

function evaluateCondition(
  cond: ApprovalRuleConditionData,
  objectData: ObjectData,
): boolean {
  const actualValue = getObjectValue(cond.field, objectData);
  if (actualValue === undefined || actualValue === null) {
    return false; // missing field → no match
  }

  switch (cond.operator) {
    case 'equals':
      return String(actualValue) === cond.value;

    case 'not_equals':
      return String(actualValue) !== cond.value;

    case 'greater_than':
      return toNumber(actualValue) > toNumber(cond.value);

    case 'less_than':
      return toNumber(actualValue) < toNumber(cond.value);

    case 'greater_than_or_equal':
      return toNumber(actualValue) >= toNumber(cond.value);

    case 'less_than_or_equal':
      return toNumber(actualValue) <= toNumber(cond.value);

    case 'in':
      // value is a comma-separated list
      return cond.value
        .split(',')
        .map((v) => v.trim())
        .includes(String(actualValue));

    case 'contains':
      return String(actualValue).toLowerCase().includes(cond.value.toLowerCase());

    default:
      return false; // unknown operator → no match
  }
}

function getObjectValue(field: string, objectData: ObjectData): unknown {
  // Document-specific fields use documentType/documentClassification,
  // so the rule's "type" maps to documentType for documents.
  switch (field) {
    case 'type':
      return objectData.type ?? objectData.documentType;
    case 'category':
      return objectData.category;
    case 'total_value':
      return objectData.totalValue;
    case 'total_currency':
      return objectData.totalCurrency;
    case 'country_code':
      return objectData.countryCode;
    case 'entity_id':
      return objectData.entityId;
    case 'classification':
      return objectData.classification ?? objectData.documentClassification;
    default:
      return undefined;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
