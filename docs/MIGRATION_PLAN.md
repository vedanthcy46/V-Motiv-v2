# Controlled V1 to V2 migration

V1 remains at its original paths. No repositories were renamed and no real user data has been migrated.
V2 uses its own PostgreSQL cluster and fresh development/test databases.

## Identity linking
V2's stable local User.id has a unique firebaseUid. Email is not unique and is never used as an automatic account merge key.
A matching Google email alone must not link to a V1 customer, staff account, vehicle, payout or document.
Before importing real data, approve an explicit linking workflow with proof, a reviewed mapping ledger, duplicate handling, backups and rollback rehearsal.
Retain V1 entity IDs or build deterministic, reviewed ID mappings for every foreign key.
Never import OTP secrets or old authentication sessions.

## Business migration
Audit and test vehicle, inspection, acquisition, stock, sales and finance invariants before extracting individual modules.
Map all business relations to the new local identity deliberately. Preserve historical actors, report revisions, approvals and policy provenance.
Rehearse migrations only on isolated synthetic or approved sanitized datasets. Compare row counts, constraints and business totals.
No writable production database is configured here. Do not deploy over V1 without a separate release decision.

## Current isolation
Native local cluster: .postgres-data in V2, loopback port 5440.
Database names: vmotiv_v2_dev, vmotiv_v2_test.
Runtime configuration rejects remote/non-V2 development database URLs.
V2 migration deploy commands still require the operator to select the correct DATABASE_URL.
V1 working-state fingerprint recorded during setup:
5389567ac5544842056225f7abae67ae023324d8fe2857dba84110d6a14f5600
This hashes Git status and tracked diff; it is not a full backup of ignored files.

