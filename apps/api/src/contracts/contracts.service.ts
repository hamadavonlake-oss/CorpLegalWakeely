import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { ERROR_CODES, ContractStatus, SignatureStatus } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import {
  isContractTransitionAllowed,
  CONTRACT_EDITABLE_STATES,
} from './contract.state-machine';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Contract CRUD
  // ═══════════════════════════════════════════════════════════════

  async create(
    ctx: TenantContext,
    input: {
      title: string;
      titleEn?: string;
      description?: string;
      type?: string;
      category?: string;
      priority?: string;
      entityId?: string;
      matterId?: string;
      effectiveDate?: string;
      expiryDate?: string;
      counterpartyName?: string;
      counterpartyNameEn?: string;
      totalValue?: number;
      totalCurrency?: string;
      assignedTo?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Validate entityId belongs to org
      if (input.entityId) {
        const entity = await tx.entity.findFirst({
          where: { id: input.entityId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!entity) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Entity not found in this organization' },
          });
        }
      }

      // Validate matterId belongs to org (if provided)
      if (input.matterId) {
        const matter = await tx.matter.findFirst({
          where: { id: input.matterId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true, matterNumber: true },
        });
        if (!matter) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found in this organization' },
          });
        }
      }

      // Validate assignedTo belongs to org
      if (input.assignedTo) {
        const user = await tx.user.findFirst({
          where: { id: input.assignedTo, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Assignee not found in this organization' },
          });
        }
      }

      // Validate date ordering
      if (input.effectiveDate && input.expiryDate) {
        if (new Date(input.effectiveDate) > new Date(input.expiryDate)) {
          throw new BadRequestException({
            success: false,
            error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'effectiveDate must be before expiryDate' },
          });
        }
      }

      const contractNumber = await this.generateContractNumber(tx, ctx.organizationId);

      const contract = await tx.contract.create({
        data: {
          organizationId: ctx.organizationId,
          entityId: input.entityId ?? null,
          matterId: input.matterId ?? null,
          contractNumber,
          title: input.title,
          titleEn: input.titleEn,
          description: input.description,
          type: input.type,
          category: input.category,
          status: ContractStatus.draft,
          priority: input.priority ?? 'medium',
          effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          counterpartyName: input.counterpartyName,
          counterpartyNameEn: input.counterpartyNameEn,
          totalValue: input.totalValue ?? null,
          totalCurrency: input.totalCurrency ?? null,
          assignedTo: input.assignedTo ?? null,
          createdBy: ctx.userId,
          classification: 'internal',
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'contract',
        objectId: contract.id,
        correlationId: contract.contractNumber,
        afterState: {
          title: contract.title,
          status: contract.status,
          type: contract.type,
          totalValue: contract.totalValue,
        },
      });

      this.logger.log(`Contract created: ${contract.contractNumber} by ${ctx.userId}`);
      return contract;
    });
  }

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          entity: true,
          matter: true,
          parties: true,
          values: true,
          signatures: { orderBy: { sequence: 'asc' } },
        },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }
      return contract;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & {
      status?: ContractStatus;
      entityId?: string;
      matterId?: string;
      assignedTo?: string;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.status ? { status: pagination.status } : {}),
        ...(pagination.entityId ? { entityId: pagination.entityId } : {}),
        ...(pagination.matterId ? { matterId: pagination.matterId } : {}),
        ...(pagination.assignedTo ? { assignedTo: pagination.assignedTo } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.contract.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            parties: { select: { id: true, name: true, nameEn: true, role: true, partyType: true } },
          },
        }),
        tx.contract.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: {
      title?: string;
      titleEn?: string;
      description?: string;
      type?: string;
      category?: string;
      priority?: string;
      entityId?: string;
      matterId?: string;
      effectiveDate?: string;
      expiryDate?: string;
      counterpartyName?: string;
      counterpartyNameEn?: string;
      totalValue?: number;
      totalCurrency?: string;
      assignedTo?: string;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.contract.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Contract was modified by another user. Please refresh and try again.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      // Only allow edits while in an editable state
      if (!CONTRACT_EDITABLE_STATES.has(existing.status as ContractStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot edit a contract in status '${existing.status}'. Create a new version instead.`,
          },
        });
      }

      // Validate date ordering if both provided
      const newEffective = input.effectiveDate ?? existing.effectiveDate?.toISOString();
      const newExpiry = input.expiryDate ?? existing.expiryDate?.toISOString();
      if (newEffective && newExpiry && new Date(newEffective) > new Date(newExpiry)) {
        throw new BadRequestException({
          success: false,
          error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'effectiveDate must be before expiryDate' },
        });
      }

      // Convert date strings to Date objects for Prisma
      const updateData: Record<string, unknown> = {};
      if (input.effectiveDate !== undefined) {
        updateData.effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : null;
      }
      if (input.expiryDate !== undefined) {
        updateData.expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
      }
      const { rowVersion: _rv, effectiveDate: _ed, expiryDate: _ex, ...rest } = input;
      Object.assign(updateData, rest);

      const updated = await tx.contract.update({
        where: { id },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: id,
        correlationId: existing.contractNumber,
        beforeState: { title: existing.title, totalValue: existing.totalValue },
        afterState: { title: updated.title, totalValue: updated.totalValue },
      });

      return updated;
    });
  }

  async transition(
    ctx: TenantContext,
    id: string,
    to: ContractStatus,
    reason?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.contract.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      const from = existing.status as ContractStatus;
      if (from === to) {
        return existing; // idempotent
      }

      if (!isContractTransitionAllowed(from, to)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot transition contract from '${from}' to '${to}'`,
            details: { from, to },
          },
        });
      }

      // When transitioning to `active`, set effectiveDate if not already set
      const updateData: Record<string, unknown> = {
        status: to as unknown as import('@prisma/client').$Enums.ContractStatus,
      };
      if (to === ContractStatus.active && !existing.effectiveDate) {
        updateData.effectiveDate = new Date();
      }

      const updated = await tx.contract.update({
        where: { id },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: id,
        correlationId: existing.contractNumber,
        beforeState: { status: from },
        afterState: { status: to, reason },
      });

      this.logger.log(`Contract ${existing.contractNumber}: ${from} → ${to}`);
      return updated;
    });
  }

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.contract.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      // Only allow soft-delete of draft or draft_new_version contracts
      const deletable: ContractStatus[] = [
        ContractStatus.draft,
        ContractStatus.draft_new_version,
      ];
      if (!deletable.includes(existing.status as ContractStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot delete a contract in status '${existing.status}'. Archive it instead.`,
          },
        });
      }

      await tx.contract.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'delete',
        objectType: 'contract',
        objectId: id,
        correlationId: existing.contractNumber,
      });

      return { success: true, id };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Contract Parties
  // ═══════════════════════════════════════════════════════════════

  async addParty(
    ctx: TenantContext,
    contractId: string,
    input: {
      partyType: 'internal' | 'external';
      entityId?: string;
      name: string;
      nameEn?: string;
      role: string;
      contactInfo?: Record<string, unknown>;
      registrationNo?: string;
      taxId?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, contractNumber: true, status: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      // Don't allow adding parties to archived/terminated contracts
      if (!CONTRACT_EDITABLE_STATES.has(contract.status as ContractStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot add parties to a contract in status '${contract.status}'`,
          },
        });
      }

      // If internal party, validate entityId belongs to org
      if (input.partyType === 'internal' && input.entityId) {
        const entity = await tx.entity.findFirst({
          where: { id: input.entityId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true, name: true },
        });
        if (!entity) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Entity not found in this organization' },
          });
        }
      }

      const party = await tx.contractParty.create({
        data: {
          contractId,
          organizationId: ctx.organizationId,
          partyType: input.partyType,
          entityId: input.entityId ?? null,
          name: input.name,
          nameEn: input.nameEn,
          role: input.role,
          contactInfo: input.contactInfo
            ? (input.contactInfo as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          registrationNo: input.registrationNo,
          taxId: input.taxId,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: contractId,
        correlationId: contract.contractNumber,
        afterState: { addedParty: { id: party.id, name: party.name, role: party.role } },
      });

      return party;
    });
  }

  async listParties(ctx: TenantContext, contractId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      return tx.contractParty.findMany({
        where: { contractId },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async updateParty(
    ctx: TenantContext,
    contractId: string,
    partyId: string,
    input: {
      name?: string;
      nameEn?: string;
      role?: string;
      contactInfo?: Record<string, unknown>;
      registrationNo?: string;
      taxId?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const party = await tx.contractParty.findFirst({
        where: { id: partyId, contractId, organizationId: ctx.organizationId },
      });
      if (!party) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract party not found' },
        });
      }

      const updateData: Record<string, unknown> = { ...input };
      if (input.contactInfo !== undefined) {
        updateData.contactInfo = input.contactInfo
          ? (input.contactInfo as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      }

      const updated = await tx.contractParty.update({
        where: { id: partyId },
        data: updateData,
      });

      return updated;
    });
  }

  async removeParty(ctx: TenantContext, contractId: string, partyId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const party = await tx.contractParty.findFirst({
        where: { id: partyId, contractId, organizationId: ctx.organizationId },
      });
      if (!party) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract party not found' },
        });
      }

      await tx.contractParty.delete({ where: { id: partyId } });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: contractId,
        correlationId: contractId,
        afterState: { removedPartyId: partyId },
      });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Contract Values
  // ═══════════════════════════════════════════════════════════════

  async addValue(
    ctx: TenantContext,
    contractId: string,
    input: {
      valueType: 'base' | 'tax' | 'fee' | 'discount' | 'penalty';
      description?: string;
      amount: number;
      currency: string;
      year?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, contractNumber: true, status: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      if (!CONTRACT_EDITABLE_STATES.has(contract.status as ContractStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot add values to a contract in status '${contract.status}'`,
          },
        });
      }

      const value = await tx.contractValue.create({
        data: {
          contractId,
          organizationId: ctx.organizationId,
          valueType: input.valueType,
          description: input.description,
          amount: input.amount,
          currency: input.currency,
          year: input.year,
        },
      });

      // Update contract's totalValue if this is a base value
      if (input.valueType === 'base') {
        await tx.contract.update({
          where: { id: contractId },
          data: {
            totalValue: input.amount,
            totalCurrency: input.currency,
          },
        });
      }

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: contractId,
        correlationId: contract.contractNumber,
        afterState: { addedValue: { id: value.id, type: value.valueType, amount: value.amount } },
      });

      return value;
    });
  }

  async listValues(ctx: TenantContext, contractId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      return tx.contractValue.findMany({
        where: { contractId },
        orderBy: [{ year: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async removeValue(ctx: TenantContext, contractId: string, valueId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const value = await tx.contractValue.findFirst({
        where: { id: valueId, contractId, organizationId: ctx.organizationId },
      });
      if (!value) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract value not found' },
        });
      }

      await tx.contractValue.delete({ where: { id: valueId } });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Contract Signatures (manual signature tracking)
  // ═══════════════════════════════════════════════════════════════

  async addSignature(
    ctx: TenantContext,
    contractId: string,
    input: {
      signerName: string;
      signerNameEn?: string;
      signerTitle?: string;
      signerUserId?: string;
      sequence?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, contractNumber: true, status: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      // Signatures can be added while contract is approved, pending_signature, or draft
      const signatureAllowedStates: ContractStatus[] = [
        ContractStatus.draft,
        ContractStatus.approved,
        ContractStatus.pending_signature,
        ContractStatus.draft_new_version,
      ];
      if (!signatureAllowedStates.includes(contract.status as ContractStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot add signatures to a contract in status '${contract.status}'`,
          },
        });
      }

      // Validate signerUserId if provided
      if (input.signerUserId) {
        const user = await tx.user.findFirst({
          where: { id: input.signerUserId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Signer user not found in this organization' },
          });
        }
      }

      const signature = await tx.contractSignature.create({
        data: {
          contractId,
          organizationId: ctx.organizationId,
          signerName: input.signerName,
          signerNameEn: input.signerNameEn,
          signerTitle: input.signerTitle,
          signerUserId: input.signerUserId ?? null,
          sequence: input.sequence ?? 1,
          status: SignatureStatus.pending,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: contractId,
        correlationId: contract.contractNumber,
        afterState: { addedSigner: { id: signature.id, name: signature.signerName, sequence: signature.sequence } },
      });

      return signature;
    });
  }

  async listSignatures(ctx: TenantContext, contractId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      return tx.contractSignature.findMany({
        where: { contractId },
        orderBy: { sequence: 'asc' },
      });
    });
  }

  /**
   * Record a signature — manually mark a signer's status as signed/declined.
   * Per Rule 4: NO embedded e-signature. This just records the manual
   * signature status + uploaded signed copy URL.
   */
  async recordSignature(
    ctx: TenantContext,
    contractId: string,
    signatureId: string,
    input: {
      status: SignatureStatus;
      signedDocumentUrl?: string;
      notes?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const signature = await tx.contractSignature.findFirst({
        where: { id: signatureId, contractId, organizationId: ctx.organizationId },
      });
      if (!signature) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Signature record not found' },
        });
      }

      if (signature.status === SignatureStatus.signed) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Signature already recorded as signed. Create a new signature record to override.',
          },
        });
      }

      const updateData: Record<string, unknown> = {
        status: input.status as unknown as import('@prisma/client').$Enums.SignatureStatus,
      };
      if (input.status === SignatureStatus.signed) {
        updateData.signedAt = new Date();
        if (input.signedDocumentUrl) {
          updateData.signedDocumentUrl = input.signedDocumentUrl;
        }
      }
      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }

      const updated = await tx.contractSignature.update({
        where: { id: signatureId },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'sign',
        objectType: 'contract',
        objectId: contractId,
        correlationId: signatureId,
        beforeState: { status: signature.status },
        afterState: { status: updated.status, signedAt: updated.signedAt },
      });

      // Check if all signatures are signed — if so, suggest transitioning contract to signed
      const allSignatures = await tx.contractSignature.findMany({
        where: { contractId },
        select: { status: true },
      });
      const allSigned = allSignatures.length > 0 &&
        allSignatures.every((s) => s.status === SignatureStatus.signed);

      if (allSigned && input.status === SignatureStatus.signed) {
        this.logger.log(`All signatures complete for contract ${contractId} — ready to transition to 'signed'`);
      }

      return { signature: updated, allSignaturesComplete: allSigned };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  private async generateContractNumber(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `CTR-${year}-`;
    const count = await tx.contract.count({
      where: { organizationId, contractNumber: { startsWith: prefix } },
    });
    const seq = (count + 1).toString().padStart(4, '0');
    return `${prefix}${seq}`;
  }
}
