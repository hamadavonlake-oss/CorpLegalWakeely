# Data Model and ERD Specification

## Conventions
UUID primary keys; UTC timestamps; organization_id on every sensitive table; entity_id/country_code where applicable; created_by/updated_by; created_at/updated_at; deleted_at/deleted_by; row_version; classification; retention_policy_id.

## Core tables
organizations, organization_settings, countries, locales, currencies, entities, departments, users, roles, permissions, user_roles, legal_requests, legal_request_matter_links, matters, matter_parties, conflict_checks, contracts, contract_parties, contract_versions, documents, document_versions, templates, template_fields, clauses, clause_versions, approvals, approval_rules, approval_steps, tasks, deadlines, notifications, status_history, retention_policies, legal_holds, legal_hold_objects, subscriptions, plans, subscription_events, licenses, audit_logs, api_clients, webhook_subscriptions.

## Required constraints
- unique (organization_id, matter_number)
- unique (organization_id, contract_number)
- all cross-entity relationships must belong to same organization
- approved document versions immutable
- legal hold blocks final deletion
- use soft delete
- optimistic locking with row_version
- storage_key/content_hash/mime_type/size_bytes/virus_scan_status for files

## Key relationships
Organization has entities, users, requests, matters, contracts, documents and policies. Request may link to zero/many matters. Matter has parties, conflict checks, documents, contracts, tasks and deadlines. Contract has parties, versions, approvals and documents. Document has versions, comments and audit events.

## Indexes
Index organization_id with status, entity_id, owner/responsible user, expiry_date, created_at, classification and deleted_at. Use GIN tsvector for searchable text with tenant filtering.

Produce conceptual and detailed ERDs in Mermaid/dbdiagram and export PNG/PDF.
