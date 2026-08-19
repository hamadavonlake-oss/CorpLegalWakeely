# Global Legal Operations Platform — AI Build Pack

This package is the ordered source of truth for building the MVP.

## Build order
1. `01-product-vision.md`
2. `02-mvp-prd.md`
3. `03-architecture-decisions.md`
4. `04-data-model.md`
5. `05-permission-matrix.md`
6. `06-openapi.yaml`
7. `07-country-pack-spec.md`
8. `08-ui-ux-spec.md`
9. `09-security-qa.md`
10. `10-master-build-prompt.md`
11. `11-agent-operating-rules.md`

## MVP scope
Build only: organizations/entities, users/RBAC/basic ABAC, legal requests, matters, basic contracts, documents/versioning, templates/clauses, configurable approvals, search, PDF/DOCX export, deadlines/notifications, audit, REST API/webhooks, Cloud multi-tenant, Docker Compose On-Premise, Arabic RTL/English LTR.

Defer: AI/OCR, advanced litigation, external counsel portal, legal spend, Air-Gapped/offline full mode, advanced SSO/SCIM, deep ERP integrations, real e-signature integrations, collaborative editing.

## Completion rule
Do not begin implementation until the agent has read all files and produced an implementation plan. Do not silently expand scope. Every deviation requires a Change Request.
