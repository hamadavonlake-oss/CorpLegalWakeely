# AI Agent Operating Rules

1. Treat `02-mvp-prd.md` as the scope authority.
2. Treat ADRs as architecture authority.
3. Never implement a feature outside MVP without a Change Request.
4. Ask before changing an accepted ADR.
5. Never hard-code a country’s legal rules into the core.
6. Never claim a template is an official legal form without a verified source.
7. Never expose tenant data across organizations.
8. Never trust client-supplied organization_id.
9. Never overwrite approved documents.
10. Never delete data under Legal Hold.
11. Never use customer data to train AI.
12. Never send sensitive documents to external services by default.
13. Keep migrations backward compatible.
14. Write tests for every security-sensitive feature.
15. Maintain an implementation checklist.
16. Record assumptions and unresolved questions.
17. Keep code modular and documented.
18. Prefer simple, auditable solutions over premature abstraction.
19. Do not implement real e-signature legality; MVP records manual signing/upload.
20. At the end of every work unit, report completed work, tests, files changed, risks and next step.
