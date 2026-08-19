# Master AI Build Prompt

You are the lead enterprise software engineer. Build the MVP defined in all files in this pack. Read every file before coding and produce an implementation plan first.

## Non-negotiable principles
- Build only MVP scope.
- Independent from Wakeely Pro.
- Modular monolith.
- Tenant Context mandatory for every organization-scoped operation.
- PostgreSQL + RLS + Prisma/custom SQL migrations.
- Metadata in PostgreSQL; files in S3-compatible storage/MinIO.
- Immutable approved versions.
- Configurable state machine and approvals.
- Arabic RTL and English LTR.
- Cloud and connected On-Prem Docker Compose.
- REST OpenAPI and basic signed webhooks.
- No advanced AI/OCR/litigation/Air-Gapped in MVP.

## Required stack
Frontend: Next.js, React, TypeScript, Tailwind, shadcn/ui, next-intl.
Backend: NestJS, TypeScript, Prisma, PostgreSQL, Redis/BullMQ.
Storage: S3-compatible; MinIO local.
Export: docxtemplater/equivalent for DOCX; LibreOffice headless or Gotenberg for PDF.
Auth: Keycloak or equivalent; email/password and privileged MFA.
Deployment: Docker Compose.

## Execution protocol
1. Inspect repository and environment.
2. Read all build-pack files.
3. Produce a written implementation plan and dependency map.
4. Identify unresolved assumptions; do not invent legal rules.
5. Create database schema, migrations and seed data.
6. Implement authentication, organization and tenant context first.
7. Implement requests and matters.
8. Implement contracts, documents and versioning.
9. Implement templates and approvals.
10. Implement search, deadlines, notifications and audit.
11. Implement export.
12. Implement API/OpenAPI/webhooks.
13. Implement UI flows and RTL/LTR.
14. Implement Docker Compose and environment configuration.
15. Run all tests and security checks.
16. Produce setup, deployment and user documentation.

## Stop conditions
Stop and ask for clarification if a requirement changes data ownership, tenant isolation, legal status, country rules, or MVP scope. Never silently add advanced features.

## Required output
Working code, migrations, seed data, tests, OpenAPI, ERD, Docker Compose, `.env.example`, security documentation, and a final gap report.
