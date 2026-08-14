# Phase 16 - Backup / Restore Evidence Integrity

Status: SOURCE / STATIC TESTING. Migration 050 is authored and has not been executed in this workspace.

## Why this phase exists

A checksum proves that bytes/content match a recorded digest. It does **not** prove that a backup can be restored successfully. Earlier source labelled newly captured snapshots `VERIFIED` immediately after checksum creation, which overstated the available recovery evidence and conflicted with the project rule that restore capability must be verified before claiming backup/recovery verification.

## Lifecycle

New backup snapshots use these evidence states:

- `CAPTURED` - snapshot row and payload were written, but storage round-trip integrity has not completed.
- `INTEGRITY_CHECKED` - the payload was read back from durable storage and its canonical SHA-256 digest matched the stored content hash. This is checksum/storage integrity only.
- `RESTORE_VERIFIED` - an approved restore run reached `SUCCEEDED`, post-apply resource/detail/config verification passed, and durable restore-verification evidence was appended.
- `INVALID` - storage integrity validation failed.
- `LEGACY_UNPROVEN` - a pre-Phase-16 snapshot that was historically labelled `VERIFIED` without restore proof. It is not eligible for governed restore until an explicit future migration/revalidation policy is approved.

No capture path may directly create `RESTORE_VERIFIED`.

## Hashing

Schema-version 3 backups use `sha256-canonical-json-v1`. Object keys are recursively sorted before serialization, so a PostgreSQL JSONB round trip cannot invalidate the digest merely by reordering object keys.

The previous `sha256-json-stringify-v0` identifier is retained only as explicit legacy provenance. Migration 050 downgrades historical checksum-only `VERIFIED` rows to `LEGACY_UNPROVEN`; it does not fabricate new proof for them.

## Approval binding

Restore approval binds:

- guild ID;
- backup ID;
- backup content hash;
- backup hash algorithm;
- canonical restore plan hash;
- versioned restore-policy revision inside the plan hash.

The worker re-loads the restore run, approval and backup, re-computes the current restore plan after acquiring the guild restore lock, and fails closed if the plan or backup hash no longer matches the approved evidence.

## Durable evidence

Migration `050_backup_restore_evidence.sql` adds:

- backup hash-algorithm provenance;
- distinct integrity-check and restore-verification timestamps;
- last successful restore-run linkage;
- append-only `backup_verification_evidence` rows for integrity and restore verification.

`BackupSnapshotRepository.markRestoreVerified()` requires the linked restore run to be `SUCCEEDED` and to reference the same backup before it can promote the snapshot.

## Operator truth

Discord and Dashboard copy distinguish `INTEGRITY_CHECKED` from `RESTORE_VERIFIED`. “Backup created” or “checksum passed” must never be presented as restore proof.

## Verification available in this checkpoint

- `npm run test:backup-restore-evidence` - dependency-free source/pure contract gate.
- authored Vitest coverage in `tests/phase16-backup-restore-evidence.test.ts`.
- authored live DB probe in `scripts/live-db-gate.ts` for canonical round-trip, lifecycle promotion, evidence append-only behavior and guild cleanup.

## Still required before VERIFIED / production maturity

- execute migration 050 on an explicitly approved disposable PostgreSQL/Supabase target;
- run the live DB probe and inspect RLS/grants/indexes/trigger behavior;
- perform a real Discord backup -> governed restore -> post-apply verification drill;
- inject restore failures and process restarts to confirm compensation/recovery evidence;
- measure backup capture and restore verification latency/size at representative guild scale;
- run dependency-backed typecheck/Vitest/build after a reviewed lockfile exists.

This phase improves evidence semantics; it does not claim that disaster recovery has been proven in production.
