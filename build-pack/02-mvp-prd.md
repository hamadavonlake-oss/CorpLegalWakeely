# MVP Product Requirements Document

## Goal
Replace fragmented email, shared folders and spreadsheets for legal requests and basic contract operations.

## Roles
Enterprise Owner; Group Legal Administrator; General Counsel/Legal Director; In-House Lawyer; Contract Manager; Business Requester; Finance Approver; Executive Approver; Auditor; Platform Administrator. External Counsel is out of scope.

## In scope
- Multi-entity organizations.
- Country/language/currency/timezone settings.
- Legal Request Portal.
- Matter Management.
- Basic Contract Lifecycle Management.
- Documents and immutable versions.
- Templates and clauses.
- Configurable sequential/parallel approvals.
- Basic conflict checks.
- PostgreSQL metadata/full-text search.
- PDF/DOCX export.
- Deadlines and notifications.
- Complete audit log.
- REST/OpenAPI and basic webhooks.
- Cloud multi-tenant.
- Connected On-Premise Docker Compose.
- Arabic RTL and English LTR.
- Full independence from Wakeely Pro.

## Out of scope
Advanced litigation, external counsel portal, legal spend/time billing, OCR/AI, real-time collaborative editing, Air-Gapped/full Offline, advanced SSO/SCIM, deep ERP/CRM/HRIS, advanced e-signature, executive analytics.

## Request-to-matter rule
A Legal Request may be closed without creating a Matter. Support one Request linked to multiple Matters and multiple Requests linked to one Matter through `legal_request_matter_links`.

## Signature rule
MVP has no embedded electronic-signature provider. Support manual signature status, signer, date/time, and upload of the signed immutable copy.

## Acceptance
- Create organization and configure country/language/currency without code.
- Submit and track a legal request.
- Convert request to matter.
- Perform basic conflict check.
- Create/upload contract and versions.
- Run configurable sequential/parallel approval.
- New version after changes to approved document.
- Export PDF/DOCX.
- Search metadata/full text with tenant filtering.
- Audit sensitive actions.
- Automated test proves tenant A cannot access tenant B.
- Cloud and Docker Compose On-Premise deployment.
- Full organization data export.
