# Architecture Decision Records

## ADR-001 Modular Monolith
Use NestJS + TypeScript modular monolith. Keep strict modules: identity, organizations, requests, matters, contracts, documents, templates, approvals, deadlines, search, audit, licensing, integrations. Extract services only when justified.

## ADR-002 Tenant Context
Every request, query, file, search, notification and report requires server-derived Tenant Context. Never trust client-supplied organization_id. Enforce middleware, service/repository checks, PostgreSQL RLS and isolation tests.

## ADR-003 PostgreSQL/RLS
Use PostgreSQL. Use Prisma for schema/migrations plus custom SQL migrations for RLS. Every sensitive table has organization_id; every transaction sets tenant context.

## ADR-004 Files
Store metadata in PostgreSQL and binaries in S3-compatible object storage; MinIO On-Premise. Never store binaries in PostgreSQL. Use signed URLs only, encryption, content hash, MIME/size/virus status.

## ADR-005 Versions/Legal Hold
Immutable approved document versions. Changes create new versions. Soft delete, retention policies, legal holds and status history are mandatory.

## ADR-006 Documents
DOCX templates via docxtemplater or equivalent; PDF via LibreOffice headless or Gotenberg. No full collaborative editor in MVP. Isolate conversion workers.

## ADR-007 Workflow
Use configurable state machines, not BPMN. Store allowed transitions, roles, conditions, comments, tasks, notifications and audit events.

## ADR-008 Approvals
Rules depend on organization/entity/country/contract type/value/risk. Support sequential, parallel, delegation and basic escalation. Reapproval may be required after changes.

## ADR-009 Country Packs
Signed, versioned package containing locale, terminology, currency/timezone/date formats, entity/contract types and basic templates. No country-specific legal rules in core.

## ADR-010 Identity
Email/password in MVP. MFA optional per organization and mandatory for privileged roles. Keycloak or equivalent. SSO/SAML/OIDC/LDAP in Phase 2.

## ADR-011 API
REST OpenAPI 3, versioned, OAuth/API keys, rate limits, idempotency, pagination, webhooks with signatures.

## ADR-012 Deployment
Cloud multi-tenant plus connected On-Premise Docker Compose. Full Offline/Air-Gapped is later. Same portable core.

## ADR-013 Audit
Central append-only/tamper-evident audit log with actor, tenant, object, action, time, IP/device, correlation ID and before/after where appropriate.

## ADR-014 Licensing
Separate subscriptions from technical licenses. Cloud uses subscriptions; On-Premise uses signed licenses. Do not abruptly destroy access; use policy-defined grace/read-only mode.

## ADR-015 Wakeely Pro
Optional future connector only. Metadata-only by default; selected/full approved sync optional. Platform continues if Wakeely Pro is unavailable.

## ADR-016 Updates
Use backward-compatible migrations. Docker image/package updates must support validation and rollback. Country packs do not alter historical documents.
