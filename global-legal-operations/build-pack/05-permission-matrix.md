# MVP Permission Matrix

Use RBAC plus basic ABAC. Every permission is checked server-side and constrained by organization/entity/country/classification.

| Capability | Owner | Legal Admin | GC/Director | Lawyer | Contract Manager | Requester | Finance | Executive | Auditor | Platform Admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Manage organization | Full | Full | View | No | No | No | No | No | No | Technical only |
| Manage users/roles | Full | Full | Limited | No | No | No | No | No | No | Technical only |
| Create request | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| View own requests | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| View all matters | Yes | Yes | Yes | Assigned/scope | Scope | No | No | Summary | Audit scope | No content by default |
| Create/edit matter | Yes | Yes | Yes | Assigned/scope | Assigned | No | No | No | No | No |
| Create/edit contract | Yes | Yes | Yes | Assigned/scope | Yes | Request only | No | No | No | No |
| Approve contract | Yes | Policy | Policy | Policy | Policy | No | Value policy | Value policy | No | No |
| Export documents | Yes | Yes | Yes | Scope | Scope | Shared only | Approved only | Approved only | No | No content by default |
| View audit log | Full | Full | Scope | Scope | Scope | Own actions | Scope | Summary | Full read | Technical events |
| Configure templates/rules | Yes | Yes | Policy | No | Limited | No | No | No | No | No |
| Export organization data | Yes | Yes | No | No | No | No | No | No | No | No |

ABAC examples: user must belong to organization; entity scope must match; confidential documents require explicit permission; approval role and value/risk rule must match; external links are disabled by default.
