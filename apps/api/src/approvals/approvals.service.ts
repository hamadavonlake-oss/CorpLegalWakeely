import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { ERROR_CODES, ContractStatus, DocumentStatus } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import {
  evaluateConditions,
  type ApprovalRuleConditionData,
  type ObjectData,
} from './conditions-evaluator';

/**
 * Step statuses (per build-pack/02-mvp-prd.md).
 * Instance statuses are computed from step statuses.
 */
type StepStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'delegated'
  | 'skipped'
  | 'escalated';

type InstanceStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'cancelled'
  | 'expired';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Rule CRUD
  // ═══════════════════════════════════════════════════════════════

  async createRule(
    ctx: TenantContext,
    input: {
      name: string;
      nameEn?: string;
      description?: string;
      objectType: 'contract' | 'document';
      priority?: number;
      approvalType: 'sequential' | 'parallel';
      isRequired?: boolean;
      escalationMinutes?: number;
      conditions: Array<{ field: string; operator: string; value: string }>;
      steps: Array<{
        stepOrder: number;
        name: string;
        nameEn?: string;
        approverRole?: string;
        assignedUserId?: string;
        canDelegate?: boolean;
        canSkip?: boolean;
      }>;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Validate step assignees (if specified) belong to org
      for (const step of input.steps) {
        if (step.assignedUserId) {
          const user = await tx.user.findFirst({
            where: { id: step.assignedUserId, organizationId: ctx.organizationId, deletedAt: null },
            select: { id: true },
          });
          if (!user) {
            throw new NotFoundException({
              success: false,
              error: { code: ERROR_CODES.NOT_FOUND, message: `User ${step.assignedUserId} not found in organization` },
            });
          }
        }
        // Validate step order is unique and sequential
        if (step.stepOrder < 1) {
          throw new BadRequestException({
            success: false,
            error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Step order must be >= 1 (got ${step.stepOrder})` },
          });
        }
      }

      // Check for duplicate step orders
      const stepOrders = input.steps.map((s) => s.stepOrder);
      if (new Set(stepOrders).size !== stepOrders.length) {
        throw new BadRequestException({
          success: false,
          error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Duplicate step orders in rule' },
        });
      }

      const rule = await tx.approvalRule.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          nameEn: input.nameEn,
          description: input.description,
          objectType: input.objectType,
          priority: input.priority ?? 100,
          approvalType: input.approvalType,
          isRequired: input.isRequired ?? true,
          escalationMinutes: input.escalationMinutes,
          createdBy: ctx.userId,
          conditions: {
            create: input.conditions.map((c) => ({
              organizationId: ctx.organizationId,
              field: c.field,
              operator: c.operator,
              value: c.value,
            })),
          },
          steps: {
            create: input.steps.map((s) => ({
              organizationId: ctx.organizationId,
              stepOrder: s.stepOrder,
              name: s.name,
              nameEn: s.nameEn,
              approverRole: s.approverRole,
              assignedUserId: s.assignedUserId,
              canDelegate: s.canDelegate ?? false,
              canSkip: s.canSkip ?? false,
            })),
          },
        },
        include: { conditions: true, steps: { orderBy: { stepOrder: 'asc' } } },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'approval_rule',
        objectId: rule.id,
        correlationId: rule.name,
        afterState: {
          name: rule.name,
          objectType: rule.objectType,
          approvalType: rule.approvalType,
          stepCount: input.steps.length,
          conditionCount: input.conditions.length,
        },
      });

      this.logger.log(
        `Approval rule created: ${rule.name} (${input.steps.length} steps, ${input.conditions.length} conditions)`,
      );
      return rule;
    });
  }

  async findRule(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const rule = await tx.approvalRule.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          conditions: true,
          steps: { orderBy: { stepOrder: 'asc' } },
          instances: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, status: true, objectType: true, objectId: true, submittedAt: true },
          },
        },
      });
      if (!rule) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval rule not found' },
        });
      }
      return rule;
    });
  }

  async listRules(
    ctx: TenantContext,
    pagination: PaginationDto & { objectType?: string; isActive?: boolean },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.objectType ? { objectType: pagination.objectType } : {}),
        ...(pagination.isActive !== undefined ? { isActive: pagination.isActive } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.approvalRule.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { priority: 'asc' },
          include: {
            _count: { select: { conditions: true, steps: true, instances: true } },
          },
        }),
        tx.approvalRule.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  async updateRule(
    ctx: TenantContext,
    id: string,
    input: {
      name?: string;
      nameEn?: string;
      description?: string;
      priority?: number;
      approvalType?: string;
      isActive?: boolean;
      isRequired?: boolean;
      escalationMinutes?: number;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.approvalRule.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval rule not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Approval rule was modified by another user.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      // Don't allow editing a rule that has active instances
      if (input.approvalType !== undefined && input.approvalType !== existing.approvalType) {
        const activeInstances = await tx.approvalInstance.count({
          where: { ruleId: id, status: 'pending' },
        });
        if (activeInstances > 0) {
          throw new BadRequestException({
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: `Cannot change approval type while ${activeInstances} instances are pending`,
            },
          });
        }
      }

      const { rowVersion: _rv, ...updateData } = input;
      const updated = await tx.approvalRule.update({
        where: { id },
        data: updateData as Record<string, unknown>,
      });

      return updated;
    });
  }

  async softDeleteRule(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.approvalRule.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval rule not found' },
        });
      }

      // Check for pending instances
      const pendingInstances = await tx.approvalInstance.count({
        where: { ruleId: id, status: 'pending' },
      });
      if (pendingInstances > 0) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Cannot delete rule with ${pendingInstances} pending instances`,
          },
        });
      }

      await tx.approvalRule.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId, isActive: false },
      });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Submit for Approval — find matching rule + create instance
  // ═══════════════════════════════════════════════════════════════

  async submitForApproval(
    ctx: TenantContext,
    input: {
      objectType: 'contract' | 'document';
      objectId: string;
      submitNotes?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // 1. Fetch the object being approved + validate its status
      const objectData = await this.fetchObjectForApproval(
        tx,
        ctx.organizationId,
        input.objectType,
        input.objectId,
      );

      // 2. Check for existing pending/rejected instances on this object
      const existingInstances = await tx.approvalInstance.findMany({
        where: {
          organizationId: ctx.organizationId,
          objectType: input.objectType,
          objectId: input.objectId,
          status: { in: ['pending', 'changes_requested'] },
        },
      });
      if (existingInstances.length > 0) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'An approval instance is already in progress for this object',
          },
        });
      }

      // 3. Find matching rules (active, ordered by priority)
      const candidateRules = await tx.approvalRule.findMany({
        where: {
          organizationId: ctx.organizationId,
          objectType: input.objectType,
          isActive: true,
          deletedAt: null,
        },
        include: {
          conditions: true,
          steps: { orderBy: { stepOrder: 'asc' } },
        },
        orderBy: { priority: 'asc' },
      });

      // 4. Find the first rule whose conditions all match
      let matchedRule: typeof candidateRules[number] | null = null;
      for (const rule of candidateRules) {
        const conditionsData: ApprovalRuleConditionData[] = rule.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        }));
        if (evaluateConditions(conditionsData, objectData, this.logger)) {
          matchedRule = rule;
          break;
        }
      }

      if (!matchedRule) {
        // No matching rule: if the object is required to have approval,
        // we reject. Otherwise, we auto-approve.
        this.logger.warn(`No matching approval rule for ${input.objectType}:${input.objectId}`);
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `No matching approval rule found for this ${input.objectType}. Configure a rule or set its object_type to match.`,
          },
        });
      }

      if (matchedRule.steps.length === 0) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Rule '${matchedRule.name}' has no steps configured`,
          },
        });
      }

      // 5. Create the instance + instance steps
      const instance = await tx.approvalInstance.create({
        data: {
          organizationId: ctx.organizationId,
          ruleId: matchedRule.id,
          objectType: input.objectType,
          objectId: input.objectId,
          status: 'pending',
          currentStepOrder: matchedRule.approvalType === 'sequential' ? 1 : null,
          submittedBy: ctx.userId,
          submitNotes: input.submitNotes,
        },
      });

      // Create instance steps from rule steps
      // For assignedUserId: use it directly. For approverRole: we'd need to resolve
      // to a user — for MVP, we store the role and the first user with that role
      // becomes the assignee. If no user has the role, the step stays pending.
      const instanceSteps = [];
      for (const step of matchedRule.steps) {
        let assignedTo = step.assignedUserId;

        // If no specific user, try to resolve from role
        if (!assignedTo && step.approverRole) {
          const userWithRole = await tx.user.findFirst({
            where: {
              organizationId: ctx.organizationId,
              deletedAt: null,
              roles: { some: { role: { code: step.approverRole } } },
            },
            select: { id: true },
          });
          if (userWithRole) {
            assignedTo = userWithRole.id;
          }
        }

        if (!assignedTo) {
          // No assignee resolved — log warning, leave step pending with no assignee
          // (this is a configuration error, but we don't block submission)
          this.logger.warn(
            `Step '${step.name}' has no assignable user (role=${step.approverRole}, assignedUserId=${step.assignedUserId})`,
          );
          throw new BadRequestException({
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: `Step '${step.name}' has no assignable user. Configure assignedUserId or ensure role '${step.approverRole}' has at least one user.`,
            },
          });
        }

        const instanceStep = await tx.approvalInstanceStep.create({
          data: {
            instanceId: instance.id,
            organizationId: ctx.organizationId,
            ruleStepId: step.id,
            stepOrder: step.stepOrder,
            name: step.name,
            nameEn: step.nameEn,
            assignedTo,
            status: 'pending',
          },
        });
        instanceSteps.push(instanceStep);
      }

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'approval_instance',
        objectId: instance.id,
        correlationId: `${input.objectType}:${input.objectId}`,
        afterState: {
          ruleId: matchedRule.id,
          ruleName: matchedRule.name,
          stepCount: instanceSteps.length,
          approvalType: matchedRule.approvalType,
        },
      });

      this.logger.log(
        `Approval instance created: ${instance.id} for ${input.objectType}:${input.objectId} ` +
          `(rule: ${matchedRule.name}, ${instanceSteps.length} steps)`,
      );

      return {
        instance,
        rule: { id: matchedRule.id, name: matchedRule.name, approvalType: matchedRule.approvalType },
        steps: instanceSteps,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Decide Step — approve / reject / request changes
  // ═══════════════════════════════════════════════════════════════

  async decideStep(
    ctx: TenantContext,
    instanceStepId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    notes?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const step = await tx.approvalInstanceStep.findFirst({
        where: { id: instanceStepId, organizationId: ctx.organizationId },
        include: { instance: { include: { rule: true } } },
      });
      if (!step) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval step not found' },
        });
      }

      if (step.instance.status !== 'pending') {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot decide on step in instance with status '${step.instance.status}'`,
          },
        });
      }

      if (step.status !== 'pending') {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Step is already in status '${step.status}'`,
          },
        });
      }

      // Only the assigned user can decide (or someone with manage permissions)
      if (step.assignedTo !== ctx.userId) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Only the assigned user can decide on this step',
          },
        });
      }

      // For sequential rules: only the current step can be decided
      if (step.instance.rule.approvalType === 'sequential') {
        if (step.instance.currentStepOrder !== step.stepOrder) {
          throw new BadRequestException({
            success: false,
            error: {
              code: ERROR_CODES.INVALID_STATE_TRANSITION,
              message: `This is not the current step. Current step: ${step.instance.currentStepOrder}, this step: ${step.stepOrder}`,
            },
          });
        }
      }

      // Update the step
      const updatedStep = await tx.approvalInstanceStep.update({
        where: { id: step.id },
        data: {
          status: decision as StepStatus,
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          decisionNotes: notes,
        },
      });

      // Recompute instance status
      const newStatus = await this.recomputeInstanceStatus(tx, step.instance.id);

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: decision === 'approved' ? 'approve' : decision === 'rejected' ? 'reject' : 'update',
        objectType: 'approval_instance_step',
        objectId: step.id,
        correlationId: step.instance.id,
        beforeState: { status: step.status },
        afterState: { status: decision, notes, newInstanceStatus: newStatus },
      });

      this.logger.log(
        `Approval step ${step.id}: ${step.status} → ${decision} (instance now: ${newStatus})`,
      );

      return {
        step: updatedStep,
        instanceStatus: newStatus,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Delegate Step — assign to another user
  // ═══════════════════════════════════════════════════════════════

  async delegateStep(
    ctx: TenantContext,
    instanceStepId: string,
    delegateTo: string,
    notes?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const step = await tx.approvalInstanceStep.findFirst({
        where: { id: instanceStepId, organizationId: ctx.organizationId },
        include: { instance: { include: { rule: true } } },
      });
      if (!step) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval step not found' },
        });
      }

      if (step.status !== 'pending') {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot delegate a step in status '${step.status}'`,
          },
        });
      }

      // Check the rule step allows delegation
      const ruleStep = step.ruleStepId
        ? await tx.approvalRuleStep.findUnique({ where: { id: step.ruleStepId } })
        : null;
      if (ruleStep && !ruleStep.canDelegate) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'This step does not allow delegation',
          },
        });
      }

      // Only the currently assigned user can delegate
      if (step.assignedTo !== ctx.userId) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Only the assigned user can delegate this step',
          },
        });
      }

      // Validate delegateTo belongs to org
      const delegateUser = await tx.user.findFirst({
        where: { id: delegateTo, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!delegateUser) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Delegate user not found in organization' },
        });
      }

      const updatedStep = await tx.approvalInstanceStep.update({
        where: { id: step.id },
        data: {
          assignedTo: delegateTo,
          originalAssignee: step.originalAssignee ?? step.assignedTo,
          delegatedTo: delegateTo,
          decisionNotes: notes ? `Delegated: ${notes}` : 'Delegated',
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'approval_instance_step',
        objectId: step.id,
        correlationId: step.instance.id,
        beforeState: { assignedTo: step.assignedTo },
        afterState: { assignedTo: delegateTo, delegatedTo: delegateTo, originalAssignee: step.originalAssignee ?? step.assignedTo },
      });

      this.logger.log(`Approval step ${step.id} delegated to ${delegateTo}`);
      return updatedStep;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Skip Step — auto-approve a skippable step
  // ═══════════════════════════════════════════════════════════════

  async skipStep(ctx: TenantContext, instanceStepId: string, reason?: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const step = await tx.approvalInstanceStep.findFirst({
        where: { id: instanceStepId, organizationId: ctx.organizationId },
        include: { instance: { include: { rule: true } } },
      });
      if (!step) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval step not found' },
        });
      }

      if (step.status !== 'pending') {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot skip a step in status '${step.status}'`,
          },
        });
      }

      // Check the rule step allows skipping
      const ruleStep = step.ruleStepId
        ? await tx.approvalRuleStep.findUnique({ where: { id: step.ruleStepId } })
        : null;
      if (!ruleStep || !ruleStep.canSkip) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'This step does not allow skipping',
          },
        });
      }

      const updatedStep = await tx.approvalInstanceStep.update({
        where: { id: step.id },
        data: {
          status: 'skipped' as StepStatus,
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          decisionNotes: `Skipped: ${reason ?? 'No reason provided'}`,
        },
      });

      // Recompute instance status (skipped steps advance sequential flow)
      const newStatus = await this.recomputeInstanceStatus(tx, step.instance.id);

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'approval_instance_step',
        objectId: step.id,
        correlationId: step.instance.id,
        afterState: { status: 'skipped', reason, newInstanceStatus: newStatus },
      });

      return { step: updatedStep, instanceStatus: newStatus };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Cancel Instance — submitter cancels a pending approval
  // ═══════════════════════════════════════════════════════════════

  async cancelInstance(ctx: TenantContext, instanceId: string, reason?: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const instance = await tx.approvalInstance.findFirst({
        where: { id: instanceId, organizationId: ctx.organizationId },
      });
      if (!instance) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval instance not found' },
        });
      }

      if (instance.status !== 'pending') {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot cancel an instance in status '${instance.status}'`,
          },
        });
      }

      // Only the submitter or a legal admin can cancel
      if (instance.submittedBy !== ctx.userId) {
        // Check if user has legal admin role (simplified check)
        const userRoles = await tx.userRole.findMany({
          where: { userId: ctx.userId },
          include: { role: { select: { code: true } } },
        });
        const isAdmin = userRoles.some(
          (ur) => ur.role.code === 'legal_admin' || ur.role.code === 'enterprise_owner',
        );
        if (!isAdmin) {
          throw new ForbiddenException({
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Only the submitter or a legal admin can cancel an approval',
            },
          });
        }
      }

      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: {
          status: 'cancelled' as InstanceStatus,
          completedAt: new Date(),
        },
      });

      // Cancel all pending steps
      await tx.approvalInstanceStep.updateMany({
        where: { instanceId, status: 'pending' },
        data: {
          status: 'skipped' as StepStatus,
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          decisionNotes: `Instance cancelled: ${reason ?? 'No reason'}`,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'approval_instance',
        objectId: instanceId,
        correlationId: `${instance.objectType}:${instance.objectId}`,
        beforeState: { status: 'pending' },
        afterState: { status: 'cancelled', reason },
      });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Re-approval Trigger — when an approved object is modified,
  // existing approvals must be re-done (Rule 12 / ADR-008)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Mark all existing approval instances for an object as needing re-approval.
   * Called when an approved contract/document is modified.
   *
   * Implementation: marks approved instances as 'changes_requested' so
   * the submitter knows to resubmit. Pending instances are cancelled.
   */
  async triggerReapproval(
    ctx: TenantContext,
    objectType: 'contract' | 'document',
    objectId: string,
    reason: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const instances = await tx.approvalInstance.findMany({
        where: {
          organizationId: ctx.organizationId,
          objectType,
          objectId,
          status: { in: ['approved', 'pending', 'changes_requested'] },
        },
      });

      for (const instance of instances) {
        if (instance.status === 'pending' || instance.status === 'changes_requested') {
          // Cancel pending instances — they need to be resubmitted fresh
          await tx.approvalInstance.update({
            where: { id: instance.id },
            data: {
              status: 'cancelled' as InstanceStatus,
              completedAt: new Date(),
            },
          });
          await tx.approvalInstanceStep.updateMany({
            where: { instanceId: instance.id, status: 'pending' },
            data: {
              status: 'skipped' as StepStatus,
              decidedAt: new Date(),
              decisionNotes: `Re-approval triggered: ${reason}`,
            },
          });
        } else if (instance.status === 'approved') {
          // Mark approved instances as changes_requested so the submitter
          // knows a new approval round is needed
          await tx.approvalInstance.update({
            where: { id: instance.id },
            data: {
              status: 'changes_requested' as InstanceStatus,
              completedAt: new Date(),
            },
          });
        }

        await this.audit.append({
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: 'update',
          objectType: 'approval_instance',
          objectId: instance.id,
          correlationId: `${objectType}:${objectId}`,
          beforeState: { status: instance.status },
          afterState: {
            status: instance.status === 'approved' ? 'changes_requested' : 'cancelled',
            reason,
          },
        });
      }

      this.logger.log(
        `Re-approval triggered for ${objectType}:${objectId}: ${instances.length} instances affected`,
      );

      return { affectedInstances: instances.length };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Query: list instances / find instance / list my pending steps
  // ═══════════════════════════════════════════════════════════════

  async findInstance(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const instance = await tx.approvalInstance.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: {
          rule: { select: { id: true, name: true, nameEn: true, approvalType: true, objectType: true } },
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });
      if (!instance) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval instance not found' },
        });
      }
      return instance;
    });
  }

  async listInstancesForObject(
    ctx: TenantContext,
    objectType: 'contract' | 'document',
    objectId: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      return tx.approvalInstance.findMany({
        where: {
          organizationId: ctx.organizationId,
          objectType,
          objectId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          rule: { select: { id: true, name: true, approvalType: true } },
          steps: { orderBy: { stepOrder: 'asc' }, select: {
            id: true, stepOrder: true, name: true, nameEn: true,
            assignedTo: true, status: true, decidedBy: true, decidedAt: true,
            decisionNotes: true,
          } },
        },
      });
    });
  }

  /**
   * List approval steps assigned to the current user that are pending.
   * Used for the "My Pending Approvals" dashboard widget.
   */
  async listMyPendingSteps(ctx: TenantContext, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        assignedTo: ctx.userId,
        status: 'pending' as StepStatus,
        instance: { status: 'pending' },
      };

      const [rows, total] = await Promise.all([
        tx.approvalInstanceStep.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'asc' },
          include: {
            instance: {
              select: {
                id: true, objectType: true, objectId: true, submittedAt: true, submittedBy: true,
                rule: { select: { name: true, approvalType: true } },
              },
            },
          },
        }),
        tx.approvalInstanceStep.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch the contract or document being approved, validate its status,
   * and return the data needed for rule condition matching.
   */
  private async fetchObjectForApproval(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
    objectType: 'contract' | 'document',
    objectId: string,
  ): Promise<ObjectData> {
    if (objectType === 'contract') {
      const contract = await tx.contract.findFirst({
        where: { id: objectId, organizationId, deletedAt: null },
        select: {
          id: true, type: true, category: true, totalValue: true, totalCurrency: true,
          entityId: true, classification: true, status: true,
          entity: { select: { countryCode: true } },
        },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }
      // Only allow submission from draft, under_review, or changes_requested
      const allowedStatuses: ContractStatus[] = [
        ContractStatus.draft,
        ContractStatus.under_review,
        ContractStatus.changes_requested,
      ];
      if (!allowedStatuses.includes(contract.status as ContractStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot submit contract in status '${contract.status}' for approval`,
          },
        });
      }
      return {
        type: contract.type,
        category: contract.category,
        totalValue: contract.totalValue?.toString() ?? null,
        totalCurrency: contract.totalCurrency,
        countryCode: contract.entity?.countryCode ?? null,
        entityId: contract.entityId,
        classification: contract.classification,
      };
    }

    // Document
    const document = await tx.document.findFirst({
      where: { id: objectId, organizationId, deletedAt: null },
        select: {
          id: true, type: true, classification: true, status: true,
        },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }
      const allowedDocStatuses: DocumentStatus[] = [
        DocumentStatus.draft,
        DocumentStatus.under_review,
        DocumentStatus.changes_requested,
      ];
      if (!allowedDocStatuses.includes(document.status as DocumentStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot submit document in status '${document.status}' for approval`,
          },
        });
      }
      return {
        documentType: document.type,
        documentClassification: document.classification,
        classification: document.classification,
        type: document.type,
      };
  }

  /**
   * Recompute the instance status based on its steps.
   * Called after every step decision.
   *
   * Sequential:
   *   - If any step rejected → instance = rejected
   *   - If any step changes_requested → instance = changes_requested
   *   - If all steps approved/skipped → instance = approved, advance currentStepOrder
   *   - Otherwise → instance = pending (advance currentStepOrder if current step is done)
   *
   * Parallel:
   *   - If any step rejected → instance = rejected
   *   - If any step changes_requested → instance = changes_requested
   *   - If all steps approved/skipped → instance = approved
   *   - Otherwise → instance = pending
   */
  private async recomputeInstanceStatus(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    instanceId: string,
  ): Promise<InstanceStatus> {
    const instance = await tx.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        rule: { select: { approvalType: true } },
        steps: true,
      },
    });
    if (!instance) throw new Error('Instance not found');

    const steps = instance.steps;
    let newStatus: InstanceStatus = 'pending';

    // Check for rejection or changes_requested (terminal decisions)
    if (steps.some((s) => s.status === 'rejected')) {
      newStatus = 'rejected';
    } else if (steps.some((s) => s.status === 'changes_requested')) {
      newStatus = 'changes_requested';
    } else if (steps.every((s) => s.status === 'approved' || s.status === 'skipped')) {
      newStatus = 'approved';
    }

    // For sequential rules, advance currentStepOrder when current step is done
    if (
      instance.rule.approvalType === 'sequential' &&
      newStatus === 'pending' &&
      instance.currentStepOrder !== null
    ) {
      const currentStep = steps.find((s) => s.stepOrder === instance.currentStepOrder);
      if (currentStep && (currentStep.status === 'approved' || currentStep.status === 'skipped')) {
        // Find the next pending step
        const nextStep = steps
          .filter((s) => s.stepOrder > instance.currentStepOrder!)
          .sort((a, b) => a.stepOrder - b.stepOrder)[0];
        await tx.approvalInstance.update({
          where: { id: instanceId },
          data: {
            currentStepOrder: nextStep ? nextStep.stepOrder : null,
            status: nextStep ? 'pending' : 'approved',
            completedAt: nextStep ? null : new Date(),
          },
        });
        return nextStep ? 'pending' : 'approved';
      }
    }

    // Update instance status + completedAt if terminal
    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: {
        status: newStatus,
        completedAt: ['approved', 'rejected', 'changes_requested', 'cancelled', 'expired'].includes(newStatus)
          ? new Date()
          : null,
      },
    });

    return newStatus;
  }
}
