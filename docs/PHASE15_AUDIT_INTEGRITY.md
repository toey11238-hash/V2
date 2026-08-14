# Phase 15 - Tamper-Evident Audit Integrity

Status: `TESTING` source/static checkpoint. Migration 049 and all live PostgreSQL/Discord evidence remain unexecuted in this workspace.

## Purpose
Phase 15 adds a database-local evidence chain to the existing redacted audit explorer. It is designed to detect ordinary audit-history mutation, broken sequence/linkage and writes that bypass the normal repository after chain activation. It deliberately does **not** claim WORM storage, external notarization or protection from a privileged database administrator that can coherently rewrite both history and head.

## Data model
Migration `049_audit_integrity_chain.sql` authors two RLS-enabled tables:

- `audit_integrity_heads`: one `next_sequence`, `head_hash` and versioned algorithm per `global` or `guild:<guildId>` scope.
- `audit_integrity_entries`: minimal audit ID/scope/sequence/previous hash/payload hash/event hash/algorithm/event timestamp evidence with unique `(scope_key, sequence)`.

Integrity entries intentionally have no foreign key to `audit_events`; governed deletion of detailed audit content can therefore preserve hash-only chain continuity. Guild-scoped integrity metadata still cascades on intentional guild teardown.

## Atomic write path
`AuditRepository.record`:

1. fixes one event timestamp and computes canonical payload SHA-256;
2. creates the scope head if absent;
3. locks that scope head `FOR UPDATE`;
4. validates the versioned algorithm and sequence;
5. derives the event hash from scope, sequence, previous hash, payload hash and algorithm;
6. inserts detailed `audit_events` content;
7. inserts the integrity entry;
8. advances the head; and
9. commits all three writes together or rolls them all back.

The lock is per scope, so unrelated guilds do not share one platform-global audit serialization point.

## Canonical hash material
`packages/audit-log/src/pure.ts` normalizes JSON through JSON serialization and recursively sorts object keys before SHA-256. The payload hash binds audit ID, guild/actor IDs, action/resource identity, before/after state, result/error, correlation ID and normalized event timestamp. The event hash adds a domain separator, algorithm version, scope, monotonic sequence and previous hash.

## Verification semantics
`AuditLogService.verifyIntegrityTail` clamps requested verification to 10..2000 entries. It checks:

- genesis or selected-tail anchor;
- sequence continuity;
- previous-hash linkage;
- retained-content timestamp and canonical payload hash;
- event-hash self-consistency, including hash-only entries whose detailed content has been retained away;
- selected tail against current chain head; and
- post-chain direct unchained `audit_events` writes.

Mismatch samples are capped for response size while `mismatchCount` tracks every mismatch observed in the selected verification path. Legacy and bypass scans are bounded/capped, and chain-start evidence uses the indexed sequence-1 row rather than a full-scope minimum scan.

### Coverage labels
- `FULL`: selected verification includes sequence 1.
- `TAIL`: verification starts later and validates its preceding anchor.
- `NONE`: no chain head exists yet.
- Retained detailed content increments `recomputedEntries`.
- Deleted detailed content increments `hashOnlyEntries`; this is continuity evidence, not content reconstruction.
- Pre-chain rows remain `LEGACY_UNCHAINED`; no fake historical hashes are generated.

## Operator surfaces
- Dashboard Audit Explorer displays integrity state, coverage, selected head, checked/recomputed/hash-only counts, bounded legacy/bypass counts and mismatch evidence; it also exposes an explicit `Verify chain tail` action.
- Discord `status:audit-integrity` is read-only, requires Manage Server and returns ephemeral guild-scoped evidence.
- `GET /api/guilds/:guildId/audit/integrity` uses the same manageable-guild authorization boundary as audit exploration and performs no mutation.

## Retention boundary
Migration 049 rejects ordinary UPDATE of detailed `audit_events`; approved Phase 14 retention DELETE remains possible. Integrity entries are not an ordinary `AUDIT` retention target, so deletion of detailed rows leaves minimal hash/sequence/timestamp evidence. The verifier recomputes event-hash self-consistency from the retained payload hash even when detailed content is absent.

## Dependency-free evidence executed here
- `npm run test:audit-integrity` - PASS 45 assertions.
- `npm run test:domain-smoke` - PASS 93.
- `npm run test:fault-model` - PASS 39.
- `npm run canon:audit` - PASS with 49 contiguous migrations.
- `npm run test:project-truth` and `npm run test:traceability` - PASS.

## Authored but unexecuted evidence
- `tests/phase15-audit-integrity.test.ts` for dependency-backed pure tests.
- `scripts/live-db-gate.ts` expansion for chained write, detailed-audit UPDATE rejection, post-retention hash-only continuity, bypass degradation and tenant cleanup.

## Remaining proof
Before any `VERIFIED` or production claim:

1. execute migration 049 on an approved disposable PostgreSQL/Supabase target;
2. verify RLS/grants/triggers/indexes and migration rollback;
3. run concurrent same-guild writers and process-failure contention tests;
4. test governed audit-content retention and hash-only verification;
5. test direct bypass/tamper attempts against the live schema;
6. run Discord/Dashboard operator E2E; and
7. if stronger privileged-DB tamper resistance is required, separately approve and implement an external checkpoint/notarization design.
