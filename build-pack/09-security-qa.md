# Security, QA and Operations

## Mandatory security
- Tenant context in middleware, repositories and RLS.
- No client-trusted organization_id.
- Encryption in transit/at rest.
- Signed URLs only.
- Malware scan uploads.
- MFA for privileged roles.
- Append-only/tamper-evident audit.
- Soft delete and legal hold.
- Secret management.
- Rate limits and idempotency.
- Secure headers and CSRF protection where applicable.

## Tests
- Unit, integration, E2E and API contract tests.
- Tenant isolation tests across API/database/search/storage/notifications/reports.
- Permission matrix tests.
- File upload/malware tests.
- Export tests for Arabic, RTL, long documents and tables.
- Load/performance tests.
- Backup/restore tests.
- Docker Compose install/upgrade/rollback tests.
- Dependency and secret scanning.
- Threat model using STRIDE.

## Targets
Dashboard <3s; metadata search <1s; full-text search <3s; common document open <3s; standard export <10s for 95% of jobs; MVP upload up to 100MB.

## Definition of done
No critical security findings, isolation tests pass 100%, migrations are reversible where possible, documentation exists, and all acceptance criteria in the PRD pass.
