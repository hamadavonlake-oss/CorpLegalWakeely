# Global Legal Operations Platform - Work Log

---
Task ID: 0-1
Agent: main
Task: Environment check

Work Log:
- Verified Node.js v24.18.0, npm 11.16.0, Debian 13
- Docker NOT available in this environment (noted as risk)
- 2 CPUs, 4.1GB RAM, 9.3GB disk available

Stage Summary:
- Environment suitable for development
- Docker Compose files created but cannot be run
- All builds will be verified via direct compilation

---
Task ID: 0-2
Agent: main
Task: Create monorepo root configuration

Work Log:
- Created package.json with npm workspaces + Turborepo
- Created turbo.json with build/dev/lint/test pipeline
- Created tsconfig.base.json with strict TypeScript settings
- Created .prettierrc, .prettierignore
- Created eslint.config.mjs (flat config)
- Created .gitignore, .npmrc

Stage Summary:
- Monorepo root ready with 4 workspace packages

---
Task ID: 0-3
Agent: phase0-api (subagent)
Task: Create NestJS API application

Work Log:
- Created apps/api with NestJS 11, Prisma, MinIO, BullMQ, argon2, otplib
- Created health module with 4 service checks (DB, Redis, Storage, Gotenberg)
- Created TenantGuard, @TenantCtx() decorator, PaginationDto, HttpExceptionFilter
- Fixed HealthCheckError import (NestJS 11 API change)
- Fixed TenantContext name conflict with @glo/shared type

Stage Summary:
- 17 files in apps/api
- NestJS builds successfully
- 2 E2E tests pass (module bootstrap + HealthController resolution)

---
Task ID: 0-4
Agent: phase0-web (subagent)
Task: Create Next.js web application

Work Log:
- Created apps/web with Next.js 15, React 19, next-intl 4, Tailwind CSS 4
- Created Arabic RTL / English LTR layout with language switcher
- Created i18n routing (ar default, en), middleware, messages (ar.json, en.json)
- Fixed Next.js 15 async params in layout.tsx
- Fixed next.config.ts type annotation for standalone output

Stage Summary:
- 13 files in apps/web
- Next.js builds successfully (3 static pages, 1 dynamic route)

---
Task ID: 0-5
Agent: phase0-shared (subagent)
Task: Create @glo/shared package

Work Log:
- Created 16 string enums covering all state machines, statuses, roles, actions
- Created TypeScript interfaces: PaginationDto, ApiResponse, TenantContext, HealthCheckResponse, WebhookPayload, AuditLogEntry
- Created constants: ERROR_CODES, WEBHOOK_EVENT_TYPES, webhook config
- Created utils: uuidv4, isValidUuid, computeWebhookSignature
- Fixed package.json exports to include "import" condition for Next.js ESM

Stage Summary:
- 7 files in packages/shared
- Shared package builds and is consumed by both api and web

---
Task ID: 0-6
Agent: main
Task: Create Prisma schema and Docker Compose

Work Log:
- Created prisma/schema.prisma with 10 core tables (Phase 0)
- Tables: Organization, OrganizationSetting, Entity, Department, User, Role, Permission, UserRole, RolePermission, AuditLog
- 11 enums mirroring @glo/shared
- Fixed missing reverse relations (departments, roles on Organization)
- Prisma generate succeeds
- Created docker-compose.yml: PostgreSQL 16, Redis 7, MinIO, Gotenberg 8, API, Web
- Created Dockerfile.api (multi-stage) and Dockerfile.web (multi-stage)
- Created .env.example with all required variables
- Created infrastructure/scripts: setup.sh, migrate.sh, seed.sh

---
Task ID: 0-11
Agent: main
Task: Verify full build and tests

Work Log:
- Full monorepo build: 4/4 packages successful (shared, config, api, web)
- E2E tests: 2/2 passed (app bootstrap, HealthController resolution)
- npm warnings about shamefully-hoist (cosmetic, will be addressed)

Stage Summary:
- Phase 0 builds and tests are green
- Docker verification deferred (see 0-12)
- Ready for Phase 1 (Auth & Organizations)

---
Task ID: 0-12
Agent: main
Task: Phase 0 closure - Docker documentation and smoke test

Work Log:
- Docker was NOT available in the execution environment
- Created docker-smoke-test.sh for future verification
- Added production warning to .env.example

Docker لم يكن متاحاً في بيئة التنفيذ، لذلك لم يتم التحقق من:
- تشغيل PostgreSQL.
- تشغيل Redis.
- تشغيل MinIO.
- تشغيل Gotenberg.
- تشغيل API وWeb معاً داخل Compose.
- صحة الشبكات الداخلية.
- صحة health checks بين الخدمات.
- persistence volumes.
- إعادة التشغيل بعد توقف خدمة.

Stage Summary:
- docker-smoke-test.sh ready at infrastructure/scripts/docker-smoke-test.sh
- .env.example updated with production warning
- Phase 0 FULLY CLOSED pending Docker verification in proper environment

---
Task ID: 1-1
Agent: main
Task: Expand Prisma schema to 16 tables (Phase 1)

Work Log:
- Expanded prisma/schema.prisma from 10 to 16 tables
- Added reference data tables: Country, Locale, Currency
- Added legal operations tables: LegalRequest, LegalRequestMatterLink, Matter
- Added identity table: AuthSession
- Added UserStatus enum (active/locked/disabled)
- Added ClassificationLevel and VirusScanStatus enums
- All tables have row_version, deleted_at soft delete where applicable
- Proper indexes on organizationId+status, assignedBy, assignedTo
- Entity and Department validated against Country codes
- LegalRequestMatterLink provides many-to-many between requests and matters

Stage Summary:
- 16 models: Country, Locale, Currency, Organization, OrganizationSetting, Entity, Department, User, AuthSession, Role, Permission, UserRole, RolePermission, LegalRequest, LegalRequestMatterLink, Matter, AuditLog
- 14 Prisma enums
- Schema validated with prisma generate

---
Task ID: 1-2
Agent: main
Task: Create database layer (PrismaService, RLS, TenantTransaction)

Work Log:
- Created PrismaService with graceful connect/disconnect lifecycle
- Implemented healthCheck() method with SELECT 1 + latency measurement
- Implemented executeInTenantTransaction() with SET_CONFIG for RLS
- Created RlsContextService using AsyncLocalStorage for tenant context propagation
- Created TenantTransactionService as convenience wrapper (Phase 1: direct execution, Phase 2: RLS)
- Created PrismaModule as @Global() module exporting PrismaService

Stage Summary:
- 4 files in apps/api/src/database/
- PrismaModule is global — all modules can inject PrismaService
- RLS foundation ready for Phase 2 activation

---
Task ID: 1-3
Agent: main
Task: Implement AuthProvider abstraction and full Auth system

Work Log:
- Created AuthProvider interface with 7 methods (validateCredentials, issueAccessToken, rotateRefreshToken, revokeSession, revokeAllUserSessions, enrollMfa, verifyMfa)
- Created AuthIdentity, TokenPair, MfaEnrollment interfaces
- Implemented AuthService implementing AuthProvider:
  - RSA-4096 key pair management (load from disk or generate dev-only)
  - kid derived from SHA-256 of public key (first 16 hex chars)
  - Argon2id password hashing (memoryCost: 65536, timeCost: 3, parallelism: 4)
  - JWT RS256 signing with kid header via @nestjs/jwt
  - Access token TTL: 15m, Refresh token TTL: 30d
  - Refresh token: 64 random bytes, hashed with Argon2id before storage
  - Refresh token rotation with old session revocation
  - Account lockout after 5 failed attempts (15 min lockout)
  - TOTP MFA enrollment via otplib (secret + otpauth URL)
  - TOTP verification and enable/disable flow
  - Registration flow: create org → create role → create user with hashed password
- Created JwtStrategy (passport-jwt) with RS256 algorithm
- Created JwtAuthGuard with custom error handling (TOKEN_EXPIRED vs INVALID_TOKEN)
- Created AuthController with 7 endpoints: register, login, refresh, logout, mfa/enroll, mfa/verify, mfa/disable, GET me
- Created 4 DTOs: RegisterDto, LoginDto, RefreshDto, MfaVerifyDto
- Created AuthModule with PassportModule + JwtModule (async, RS256 default)
- AuthProvider token exported for future Keycloak swap

Stage Summary:
- 10 files in apps/api/src/identity/auth/
- Full auth lifecycle: register → login → MFA → token rotation → logout
- AuthProvider interface allows future Keycloak/SSO swap without changing consumers

---
Task ID: 1-4
Agent: main
Task: Implement Organizations, Entities, Departments CRUD

Work Log:
- Created OrganizationsService with full CRUD:
  - createOrg with slug uniqueness check + auto-create OrganizationSetting
  - findOne, updateOrg with optimistic locking via rowVersion
  - updateSettings with locale/currency validation against reference tables
  - createEntity with country code validation
  - listEntities with pagination + soft-delete filter
  - createDepartment with entity-owns-org validation
  - listDepartments with pagination
  - Validation helpers: validateCountryCode, validateCurrencyCode, validateLocaleCode
- Created OrganizationsController with 7 endpoints:
  - GET /organizations/me, PATCH /organizations/me
  - GET /organizations/me/entities, POST /organizations/me/entities
  - GET /organizations/me/departments, POST /organizations/me/departments
  - PATCH /organizations/me/settings
- All endpoints use @TenantCtx() for org ID (never from client body)
- Created 4 DTOs: UpdateOrganizationDto, UpdateSettingsDto, CreateEntityDto, CreateDepartmentDto

Stage Summary:
- 7 files in apps/api/src/organizations/
- Full tenant-scoped CRUD for orgs, entities, departments
- Optimistic locking on org updates
- Reference data validation (country, currency, locale)

---
Task ID: 1-5
Agent: main
Task: Implement Country Pack loader

Work Log:
- Created CountryPacksService:
  - loadCountryPack: reads manifest.json from filesystem, validates structure
  - activateCountryPack: sets org.countryPack + updates org settings with pack defaults
  - listAvailablePacks: scans packages/country-packs directory
  - validateManifest: type-guard for required fields (pack_id, country_code, version, compatibility)
  - Signature verification deferred (interface designed for it)
- Created CountryPacksController with 3 endpoints:
  - GET /country-packs (list all)
  - GET /country-packs/:code (get one)
  - POST /country-packs/:code/activate (activate for org)
- Created CountryPacksModule

Stage Summary:
- 3 files in apps/api/src/country-packs/
- Filesystem-based pack loading with manifest validation
- Activation updates org settings with pack defaults (locale, currency, timezone)

---
Task ID: 1-6
Agent: main
Task: Implement RBAC (Permission Guard + Decorator)

Work Log:
- Created @RequirePermissions(...codes) decorator using SetMetadata
- Created PermissionGuard:
  - Reads required permissions from Reflector
  - Fetches user roles from JWT payload
  - Queries rolePermissions table for permission check
  - Returns 403 FORBIDDEN if any permission missing
  - Allows through if no permissions required (open endpoints)

Stage Summary:
- 2 files: require-permissions.decorator.ts, permission.guard.ts
- RBAC foundation ready — permissions seeded in next step

---
Task ID: 1-7
Agent: main
Task: Wire all modules in AppModule

Work Log:
- Updated app.module.ts to import: PrismaModule, AuthModule, OrganizationsModule, CountryPacksModule, HealthModule
- All modules properly registered and resolved

Stage Summary:
- AppModule imports 5 feature modules + global ConfigModule
- Module wiring verified

---
Task ID: 1-8
Agent: main
Task: Phase 1 worklog snapshot (context recovery point)

Work Log:
- Session ran out of context during Phase 1 execution
- Worklog updated with all Phase 1 progress (Tasks 1-1 through 1-8)
- Phase 1 is ~70% complete

Stage Summary:
- COMPLETED: Prisma schema (16 tables), Database layer, Auth system, Organizations CRUD, Country Packs, RBAC guard, Module wiring
- REMAINING: Tests (27+), Seed scripts, Phase 1 report, compilation verification

---
Task ID: 1-9
Agent: main
Task: Compilation verification and bug fixes

Work Log:
- Fixed @TenantCtx() decorator: now resolves from request.user (JWT payload) when tenantContext not set by TenantGuard
- Fixed TenantGuard: removed `declare global` that conflicted with Express `User` type, uses type assertion instead
- Fixed AuthController: added null check for validateCredentials return (interface allows null)
- Fixed argon2.verify: removed invalid `type` option (verify auto-detects from hash)
- Fixed parseTtlToSeconds: added null-safe access for regex match groups (noUncheckedIndexedAccess)
- Fixed JwtAuthGuard: added `override` modifier (noImplicitOverride)
- Fixed UpdateOrganizationDto: added rowVersion field with @IsInt() validation
- Added missing dependencies to apps/api/package.json: @nestjs/passport, passport, passport-jwt, jsonwebtoken, @types/passport-jwt, @types/jsonwebtoken
- TenantGuard: added early return when tenantContext already set (prevents overwrite)

Stage Summary:
- TypeScript: 0 errors (tsc --noEmit clean)
- All Phase 1 code compiles without warnings

---
Task ID: 1-10
Agent: main
Task: Write 35 unit tests across 6 test suites

Work Log:
- Created src/test-helpers.ts with makeMockJwtPayload, makeMockExecutionContext, makeMockPrismaService
- Created auth.service.spec.ts (11 tests): register, validate credentials (success/not-found/wrong-password/locked/disabled/lockout), issue token, rotate refresh, revoke sessions, MFA enrollment
- Created jwt-auth.guard.spec.ts (5 tests): valid user, no user, expired token, invalid token, internal error
- Created tenant.guard.spec.ts (4 tests): health bypass, no user, set tenantContext, preserve existing
- Created tenant-ctx.decorator.spec.ts (3 tests): existing context, derive from JWT, no auth throws
- Created organizations.service.spec.ts (8 tests): find one, not found, optimistic locking, settings update, invalid country, entity ownership, pagination, create entity
- Created permission.guard.spec.ts (4 tests): no permissions required, has all, missing, no user
- Fixed test issues: import paths (rootDir=src), RS256 real key generation in mock factory, authSession.updateMany mock, TOTP URL encoding, currency isActive field
- Final result: 35/35 tests PASS, 6/6 suites green

Stage Summary:
- 35 tests exceed the 27+ requirement
- Test matrix covers: Auth (16), Tenant (7), Organizations (8), Security (4)
- All tests use mocked dependencies (no database required)

---
Task ID: 1-11
Agent: main
Task: Create seed script with demo data (no real PII)

Work Log:
- Created prisma/seed/index.ts with comprehensive seed data
- Reference data: 4 countries (JO, SA, AE, EG), 6 locales, 5 currencies
- Demo organization: Al-Noor Legal Co. (slug: al-noor-legal)
- Demo entity: Amman Main Branch (registration: DEMO-REG-001)
- 3 departments: Contracts, Litigation, Compliance
- 10 system/custom roles with Arabic+English names
- 15 permissions across 6 modules (organizations, entities, departments, users, roles, country-packs, audit)
- Role-permission mappings for all 10 roles
- 3 demo users (owner, legal-admin, lawyer) with Argon2id hashed passwords
- All emails use .demo TLD, all names are clearly fictional

Stage Summary:
- Seed script ready for `npx tsx prisma/seed/index.ts`
- No real PII anywhere in the seed data

---
Task ID: 1-12
Agent: main
Task: Phase 1 completion and report

Work Log:
- Final verification: tsc --noEmit = 0 errors, jest = 35/35 pass
- Phase 1 report generated

Stage Summary:
- Phase 1 COMPLETE
- All 12 Phase 1 deliverables done
- Ready for Phase 2 approval
---
Task ID: 2-1
Agent: main
Task: Phase 2 — Legal Requests, Matters, Conflict Checks, RLS, Audit

Work Log:
- Cloned repo from GitHub, verified Phase 0+1 state (35 tests passing, tsc clean)
- Installed dependencies (852 packages), generated Prisma client
- Extended prisma/schema.prisma:
  - Added ConflictCheckParentType enum (matter, contract)
  - Added ConflictCheck model (polymorphic parent_type + parent_id, 6-state status, JSONB names array for AR+EN, registration_numbers, checked_by/at, result_summary, soft delete, row_version)
  - Added conflictChecks back-reference on Organization
  - Added unique constraint (parent_type, parent_id) — one check per parent
  - Added 3 indexes: (org, status), (parent_type, parent_id), checked_by
- Wrote prisma/migrations/20260820000000_phase2_conflict_checks_rls/migration.sql:
  - Creates conflict_checks table with FK to organizations
  - Adds status CHECK constraint (defence in depth)
  - Enables RLS + FORCE RLS on 14 tenant-scoped tables
  - Defines tenant_isolation policy on each table:
    USING (organization_id = current_setting('app.current_organization_id', true))
    WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
  - Special policies for tables without organization_id column (auth_sessions, user_roles) using EXISTS subqueries
  - role_permissions gets a permissive policy (system-level, not tenant-scoped)
- Updated TenantTransactionService:
  - runInTenantContext now wraps every callback in a $transaction
  - Calls SET_CONFIG('app.current_organization_id', ?, true) before the callback
  - The `true` (is_local) flag scopes the variable to the current transaction
  - Added debugVisibleOrganizationCount for RLS verification
- Built AuditModule (apps/api/src/audit/):
  - AuditService.append() — append-only, runs in $transaction
  - SHA-256 hash chain per ADR-013: hash = SHA-256(prevHash + '|' + canonicalJson(payload))
  - Genesis entry uses empty prevHash
  - Canonical JSON: keys sorted ascending, no whitespace, stable nested ordering
  - AuditService.verifyChain() — walks entries chronologically, recomputes hashes, detects tampering
  - AuditService.list() — paginated with objectType/objectId/actorId filters
  - AuditController: GET /audit, GET /audit/verify
- Built LegalRequestsModule (apps/api/src/requests/):
  - 9-state machine: draft → submitted → triaged → in_progress → converted_to_matter | closed | cancelled | rejected | waiting_for_information
  - LEGAL_REQUEST_TRANSITIONS map as single source of truth
  - isLegalRequestTransitionAllowed() helper
  - Service: create, findOne, list, update (optimistic locking, only draft/waiting editable), transition (with audit), softDelete (only draft/cancelled)
  - Per-org sequential request numbers: REQ-YYYY-NNNN
  - Validates entityId and assignedTo belong to the same org
  - Controller: POST/GET/GET:id/PATCH:id/POST:id/transition/DELETE:id
  - 7 DTOs with class-validator
- Built MattersModule (apps/api/src/matters/):
  - 8-state machine: open → in_progress → on_hold → waiting_for_information → resolved → closed → archived | cancelled
  - MATTER_TRANSITIONS map
  - Service: create, findOne, list, update (optimistic locking, no archived/cancelled edits), transition, linkRequest, unlinkRequest, convertRequestToMatter
  - Per-org sequential matter numbers: MTR-YYYY-NNNN
  - convertRequestToMatter: atomic one-shot action (validates request in in_progress/triaged, creates matter, links them, transitions request to converted_to_matter, logs 2 audit entries)
  - Controller: POST/GET/GET:id/PATCH:id/POST:id/transition/POST:id/links/requests/DELETE:id/links/requests/:requestId/POST:from-request/:requestId
  - 5 DTOs
- Built ConflictChecksModule (apps/api/src/conflict-checks/):
  - 6-status state machine: not_checked → no_match | possible_match | requires_review | cleared_by_lawyer | blocked
  - Reset paths: all result statuses can reset to not_checked
  - Resolution paths: possible_match/requires_review → cleared_by_lawyer or blocked
  - Polymorphic parent (parent_type + parent_id) — Phase 2 supports 'matter' only
  - JSONB names array: [{ name: 'الاسم بالعربية', nameEn: 'English Name' }]
  - Administrative-only — NO AI/OCR (per Rule 1)
  - Service: create (validates parent belongs to org, uniqueness, at least one name), findOne, findByParent, list, update (no blocked edits), transition (sets checked_at/by on first result, clears on reset), softDelete (no active: blocked/possible_match/requires_review)
  - Controller: POST/GET/GET:id/GET:by-parent/:parentType/:parentId/PATCH:id/POST:id/transition/DELETE:id
  - 4 DTOs
- Wired all new modules into AppModule (now imports 9 modules)
- Extended seed data:
  - Added 14 new permissions (5 request, 5 matter, 4 conflict_check) — total now 29
  - Updated all 10 role-permission mappings to include Phase 2 permissions
  - Added 3 sample legal requests (draft, submitted, in_progress — AR+EN titles)
  - Added 2 sample matters (in_progress, open)
  - Added 1 request-matter link
  - Added 1 sample conflict check (not_checked, AR+EN names, 2 registration numbers)

Tests — 189/189 PASS across 14 suites (+154 new from Phase 1 baseline of 35):
- legal-request.state-machine.spec.ts (24 tests): all 9 statuses, valid + invalid transitions, terminal states
- matter.state-machine.spec.ts (18 tests): all 8 statuses, valid + invalid transitions, terminal states
- conflict-check.state-machine.spec.ts (20 tests): all 6 statuses, reset paths, resolution paths, invalid transitions
- audit.service.spec.ts (18 tests): genesis, hash chaining, per-org isolation, verifyChain (intact + tampered), canonical JSON, computeHash determinism
- legal-requests.service.spec.ts (16 tests): create, transition (valid/invalid/idempotent/RLS), update (optimistic locking/editable states), softDelete, findOne (RLS), list (tenant filtering)
- matters.service.spec.ts (21 tests): create, transition, update, linkRequest, unlinkRequest, convertRequestToMatter (valid/draft/closed/overrides), findOne (RLS), list
- conflict-checks.service.spec.ts (22 tests): create (valid/RLS/unsupported parent/duplicate/no names), transition (all paths/reset/invalid/RLS/idempotent), update (blocked check), softDelete (active statuses), findByParent, list
- tenant-transaction.service.spec.ts (8 tests): transaction wrapping, SET_CONFIG before callback, tx client passed, is_local=true, no cross-tenant leakage, error propagation, debugVisibleOrganizationCount
- (Plus 35 baseline tests from Phase 1)

Stage Summary:
- Phase 2 COMPLETE: 4 new modules (Audit, LegalRequests, Matters, ConflictChecks) + RLS activation
- 9-state Legal Request machine, 8-state Matter machine, 6-status Conflict Check machine — all with allowed-transitions validation
- SHA-256 hash chain audit log (ADR-013) with tamper detection
- PostgreSQL RLS enabled on 14 tables via migration SQL (FORCE RLS for defence in depth)
- TenantTransactionService now sets app.current_organization_id per transaction (is_local=true, fail-closed)
- 189/189 tests pass, 0 TypeScript errors, all 4 packages build
- 6 new files for state machines, 4 new modules (28 files total), 1 migration, seed extended
- Known limitation: RLS migration written but not verified against a real PostgreSQL instance (Docker unavailable in build env). Unit tests verify the application-layer contract (SET_CONFIG before callback, per-org isolation)

---
Task ID: 3-1
Agent: main
Task: Phase 3 — Contracts (13-state machine, parties, values, signatures)

Work Log:
- Extended prisma/schema.prisma with 5 new models:
  - Contract (13-state machine, FK to Entity + Matter, total_value/currency, effective/expiry dates, classification)
  - ContractParty (internal/external, JSONB contact_info, registration_no, tax_id)
  - ContractValue (base/tax/fee/discount/penalty, Decimal(18,3), multi-year support)
  - ContractSignature (manual signature tracking — signer, sequence, status, signed_document_url)
  - ContractDocumentLink (forward-compatible placeholder for Phase 4 documents)
- Added back-relations on Organization, Entity, Matter
- Wrote prisma/migrations/20260820010000_phase3_contracts/migration.sql:
  - Creates 5 tables with FK constraints + CHECK constraints for status/value_type/party_type/link_type
  - amount >= 0 CHECK on contract_values
  - sequence >= 1 CHECK on contract_signatures
  - Unique constraint on (contract_id, document_id, link_type)
  - Enables RLS + FORCE RLS on all 5 new tables
  - Tenant isolation policies on all 5 tables
- Built ContractsModule (apps/api/src/contracts/):
  - 13-state machine: draft → under_review → changes_requested → pending_approval → approved → pending_signature → signed → active → expired | terminated | archived | rejected | draft_new_version
  - CONTRACT_TRANSITIONS map as single source of truth
  - CONTRACT_EDITABLE_STATES set (draft, under_review, changes_requested, draft_new_version)
  - CONTRACT_ACTIVE_STATES set (active, signed, pending_signature)
  - Service methods (all in single ContractsService for cohesion):
    - Contract CRUD: create, findOne, list, update (optimistic locking + editable states only), transition (with audit), softDelete (draft only)
    - Parties: addParty (validates entityId for internal, blocks non-editable states), listParties, updateParty, removeParty
    - Values: addValue (auto-updates contract.totalValue for base type), listValues, removeValue
    - Signatures: addSignature (allowed in draft/approved/pending_signature/draft_new_version), listSignatures, recordSignature (manual status + signedDocumentUrl + returns allSignaturesComplete flag)
  - Per-org sequential contract numbers: CTR-YYYY-NNNN
  - Validates effectiveDate < expiryDate
  - When transitioning to active, auto-sets effectiveDate to now if missing
  - Controller with 14 endpoints: CRUD + transition + parties + values + signatures
  - 15 DTOs with class-validator
- Wired ContractsModule into AppModule (now imports 10 modules)
- Extended seed data:
  - Added 7 new contract permissions (create, read, update, transition, delete, party.manage, value.manage, signature.manage) — total now 36
  - Updated all 10 role-permission mappings: contract_manager is now the primary contract user
  - Added 2 sample contracts (NDA in draft, vendor agreement in pending_signature)
  - Added 2 parties to contract2 (internal buyer + external seller with contact_info JSON)
  - Added 2 value lines to contract2 (base 75000 JOD + tax 12000 JOD)
  - Added 2 signature records to contract2 (sequence 1 + 2, both pending)

Tests — 258/258 PASS across 16 suites (+69 new from Phase 2 baseline of 189):
- contract.state-machine.spec.ts (33 tests): all 13 statuses, full happy-path lifecycle (draft → ... → active → expired → draft_new_version → under_review), reviewer feedback paths, invalid transitions, terminal states, editable/active state sets
- contracts.service.spec.ts (36 tests): create (validation of entityId/matterId/assignedTo/dates), transition (all happy paths + auto-effectiveDate + invalid + RLS + idempotent), update (optimistic locking + non-editable states), softDelete, addParty (internal/external + non-editable states), addValue (auto-totalValue + non-editable states), signatures (add + record + already-signed + allSignaturesComplete flag + non-editable states), findOne (RLS), list

Stage Summary:
- Phase 3 COMPLETE: ContractsModule with 13-state machine + parties + values + manual signatures
- 5 new Prisma models, 1 migration, 7 new module files, 36 total permissions
- 258/258 tests pass, 0 TypeScript errors, all packages build
- Manual signature tracking per Rule 4 (NO embedded e-signature — only records signer name, date, and uploaded signed copy URL)
- ContractDocumentLink model is forward-compatible for Phase 4 (Documents)

---
Task ID: 4-1
Agent: main
Task: Phase 4 — Documents, Templates, Clauses (immutable versioning)

Work Log:
- Extended prisma/schema.prisma with 5 new models:
  - Document (7-state machine, FK to Contract/Matter/LegalRequest, total size/hash, Legal Hold, retention, classification)
  - DocumentVersion (immutable per-version: storageKey, filename, mimeType, sizeBytes, SHA-256 contentHash, approvedBy/approvedAt)
  - Template (DOCX template with variablesSchema, defaultValues, locale, countryCode)
  - Clause (reusable AR+EN clause text with category, version, variables)
  - TemplateClause (many-to-many link with placeholder name + sort order)
- Updated ContractDocumentLink to use proper Document FK (was placeholder string in Phase 3)
- Added back-relations on Organization, Contract, Matter, LegalRequest
- Wrote prisma/migrations/20260820020000_phase4_documents_templates/migration.sql:
  - Creates 5 new tables with FK constraints + CHECK constraints for status/classification/virus_scan_status/value_type
  - Adds size_bytes >= 0 CHECK, version >= 1 CHECK, current_version >= 1 CHECK
  - Adds real FK from contract_document_links.document_id to documents.id
  - Enables RLS + FORCE RLS on all 5 new tables
  - Tenant isolation policies on all new tables
- Built StorageModule (apps/api/src/storage/):
  - StorageService interface (upload, download, getSignedDownloadUrl, getSignedUploadUrl, delete, exists, healthCheck)
  - MinioStorageService implementation (S3-compatible, gracefully falls back to in-memory in dev when MinIO unavailable)
  - In production (NODE_ENV=production), throws on MinIO unavailable — never falls back
  - @Global() module so any module can inject StorageService
  - Per ADR-004: metadata in PostgreSQL, binaries in S3/MinIO via signed URLs
- Built DocumentsModule (apps/api/src/documents/):
  - 7-state machine: draft → under_review → changes_requested → approved → exported → filed → archived
  - DOCUMENT_EDITABLE_STATES set (draft, under_review, changes_requested) — approved/exported/filed/archived are immutable
  - Per-org sequential document numbers: DOC-YYYY-NNNN
  - Service methods:
    - Document CRUD: create (validates contractId/matterId/legalRequestId belong to org), findOne (with includes), list (filters), update (optimistic locking + editable states), transition (with audit, marks version approved when → approved), softDelete (blocked by Legal Hold per Rule 10)
    - Versions: uploadVersion (immutable — adds new DocumentVersion row, increments currentVersion, computes SHA-256 hash, uploads binary to storage, blocked on approved docs per Rule 12), listVersions, getVersion, getDownloadUrl (signed URL + audit log)
    - Legal Hold: setLegalHold (idempotent, audit logged with reason)
    - Retention: setRetention (set/clear retentionUntil date)
    - Contract links: linkToContract (unique per linkType), unlinkFromContract
  - Controller with 12 endpoints + multipart file upload via @UseInterceptors(FileInterceptor)
  - 9 DTOs with class-validator
- Built TemplatesModule (apps/api/src/templates/):
  - DOCX templates via docxtemplater + pizzip
  - Service: create (validates DOCX is parseable), findOne, findByCode, list, update, softDelete
  - fillTemplate: loads DOCX from storage, merges defaultValues + clause variables + provided variables, renders with docxtemplater, uploads rendered DOCX as a new Document with version 1, returns download URL
  - linkClause / unlinkClause: many-to-many with TemplateClause (placeholder name + sort order)
  - Controller with 7 endpoints + multipart upload
  - 4 DTOs
- Built ClausesModule (apps/api/src/clauses/):
  - Reusable clause library (AR + EN body text, category, version, variables)
  - 13 categories: boilerplate, termination, confidentiality, payment, liability, governing_law, dispute_resolution, force_majeure, indemnification, warranty, assignment, amendment, misc
  - Service: create, findOne, findByCode, list, update (auto-increments version when bodyText changes), softDelete
  - Controller with 6 endpoints
  - 2 DTOs
- Wired StorageModule, DocumentsModule, TemplatesModule, ClausesModule into AppModule (now imports 14 modules)
- Installed docxtemplater, pizzip, multer, @nestjs/platform-express, @types/multer
- Extended seed data:
  - 17 new permissions (8 document, 5 template, 4 clause) — total now 53
  - Updated all 10 role-permission mappings with Phase 4 permissions
  - contract_manager is now the primary template + clause manager
  - Added 3 sample clauses (TERM-30D, CONF-BIL, PAY-NET30 — all AR+EN bilingual)
  - Added 1 sample document linked to contract2 (under_review, 2 versions)

Tests — 319/319 PASS across 19 suites (+61 new from Phase 3 baseline of 258):
- document.state-machine.spec.ts (21 tests): all 7 statuses, happy-path lifecycle (draft → under_review → approved → exported → filed → archived), reviewer feedback paths, immutability checks (approved → draft rejected), terminal state
- documents.service.spec.ts (28 tests): create (validation of contractId/matterId), uploadVersion (immutable versioning, SHA-256 hash computation, blocked on approved/archived), transition (sets approvedBy/approvedAt + marks version approved, invalid transitions, idempotent), update (optimistic locking, editable states), Legal Hold (toggle, blocks soft-delete, idempotent), Retention (set/clear), Contract links (link + duplicate detection), getDownloadUrl (signed URL + audit)
- clauses.service.spec.ts (12 tests): create, findOne (RLS), findByCode, update (auto-increment version on bodyText change, optimistic locking), softDelete, list (with category filter)

Stage Summary:
- Phase 4 COMPLETE: Documents, Templates, Clauses modules + Storage abstraction
- 5 new Prisma models, 1 migration, 19 new files (services, controllers, DTOs, tests, state machine, storage interface + impl), 53 total permissions
- 319/319 tests pass, 0 TypeScript errors, all packages build
- Immutable approved document versions per Rule 12
- Legal Hold prevents permanent deletion per Rule 10
- SHA-256 content hashes for integrity verification
- DOCX template rendering via docxtemplater (Phase 6 will add Gotenberg PDF export)
- Storage abstraction supports MinIO (dev) + AWS S3 (production) via env vars

---
Task ID: 5-1
Agent: main
Task: Phase 5 — Approvals Engine (rules, instances, delegation, escalation, re-approval)

Work Log:
- Extended prisma/schema.prisma with 5 new models:
  - ApprovalRule (template: objectType, priority, approvalType sequential/parallel, escalationMinutes, isRequired)
  - ApprovalRuleCondition (field/operator/value — supports 8 operators on 7 fields)
  - ApprovalRuleStep (stepOrder, approverRole OR assignedUserId, canDelegate, canSkip)
  - ApprovalInstance (runtime: status, currentStepOrder, submittedBy, completedAt, linked to object)
  - ApprovalInstanceStep (runtime per-step: assignedTo, originalAssignee, delegatedTo, decidedBy/at, decisionNotes)
- Wrote prisma/migrations/20260820030000_phase5_approvals/migration.sql:
  - Creates 5 tables with FK constraints + CHECK constraints for object_type/approval_type/status/operator/field
  - Priority >= 0 CHECK, escalation_minutes > 0 CHECK, step_order >= 1 CHECK
  - Enables RLS + FORCE RLS on all 5 new tables
  - Tenant isolation policies on all 5 tables
- Built ApprovalsModule (apps/api/src/approvals/):
  - Conditions Evaluator (apps/api/src/approvals/conditions-evaluator.ts) — pure function module
    - evaluateConditions(conditions, objectData) → boolean (all conditions AND'd)
    - 8 operators: equals, not_equals, greater_than, less_than, greater_than_or_equal, less_than_or_equal, in (comma-list), contains (case-insensitive)
    - 7 fields: type, category, total_value, total_currency, country_code, entity_id, classification
    - Document-specific mapping: 'type' → documentType, 'classification' → documentClassification
  - ApprovalsService (apps/api/src/approvals/approvals.service.ts):
    - Rule CRUD: createRule (validates step assignees + duplicate step orders), findRule (with includes), listRules (paginated, filterable by objectType/isActive), updateRule (optimistic locking, blocks approvalType change while instances pending), softDeleteRule (blocks if pending instances)
    - submitForApproval: fetches object (contract/document), validates status, finds FIRST matching rule by priority, resolves approver from assignedUserId or role-based lookup, creates instance + instance steps, sets currentStepOrder for sequential rules
    - decideStep: validates assignee + current step (sequential), updates step status, calls recomputeInstanceStatus
    - recomputeInstanceStatus: walks all steps — rejected → instance rejected, changes_requested → instance changes_requested, all approved/skipped → instance approved. For sequential: advances currentStepOrder when current step is done.
    - delegateStep: validates canDelegate flag + assignee, updates assignedTo + originalAssignee + delegatedTo
    - skipStep: validates canSkip flag, marks step skipped, recomputes instance (advances sequential)
    - cancelInstance: submitter or legal_admin/enterprise_owner can cancel; cancels pending steps
    - triggerReapproval: when approved object is modified, marks approved instances → changes_requested, cancels pending instances (Rule 12 / ADR-008)
    - findInstance, listInstancesForObject, listMyPendingSteps (with instance.status=pending filter)
  - Controller with 13 endpoints: rule CRUD, submit, findInstance, listInstancesForObject, cancel, decide, delegate, skip, my-pending
  - 7 DTOs with class-validator
- Wired ApprovalsModule into AppModule (now imports 15 modules)
- Extended seed data:
  - 10 new approval permissions (4 rule, 6 instance/step) — total now 63
  - Updated all 10 role-permission mappings with Phase 5 permissions
  - finance_approver + executive_approver are now primary approvers (approval.decide)
  - Added 1 sample rule: "Vendor Contracts > 50k Approval" (sequential, 2 steps, escalation 3 days)
  - Added 2 conditions: type=vendor_agreement, total_value>50000
  - Added 2 steps: Legal Review (lawyer, canDelegate) → Finance Approval (finance_approver)
  - Added 1 sample instance: contract2 submitted, currentStepOrder=1, step 1 pending
- Hoisted matter1 + contract2 variable declarations out of Phase 2/3 blocks so Phase 4/5 can reference them

Tests — 381/381 PASS across 21 suites (+62 new from Phase 4 baseline of 319):
- conditions-evaluator.spec.ts (24 tests): all 8 operators (equals, not_equals, gt, lt, gte, lte, in, contains), empty conditions match, missing fields reject, multiple conditions AND'd, short-circuit on first fail, unknown operator rejects, document-specific field mapping
- approvals.service.spec.ts (38 tests): createRule (validation, duplicate step orders, step < 1), submitForApproval (matching, no-match, conflict on existing, invalid contract status, no steps, no assignable user, priority selection), decideStep (approve+advance, final approve, reject, changes_requested, forbidden for non-assignee, wrong step in sequential, already decided, parallel all-must-approve), delegateStep (success, blocked when canDelegate=false, forbidden for non-assignee), skipStep (success + advance, blocked when canSkip=false), cancelInstance (submitter can, non-submitter forbidden, legal_admin can, non-pending rejected), triggerReapproval (cancels pending, marks approved → changes_requested, ignores terminal), listMyPendingSteps (filters by assignee + status + instance.status)

Stage Summary:
- Phase 5 COMPLETE: ApprovalsModule with rules engine + runtime instances + delegation + skipping + cancellation + re-approval triggers
- 5 new Prisma models, 1 migration, 6 new files (service, controller, module, DTOs, conditions evaluator, tests), 63 total permissions
- 381/381 tests pass, 0 TypeScript errors, all packages build
- Sequential + parallel approval types supported
- Re-approval trigger integration point ready (will be called from contracts/documents update services in a follow-up)
- Per ADR-008: sequential/parallel/delegation approvals with escalation
