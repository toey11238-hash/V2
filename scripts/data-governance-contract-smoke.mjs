import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalJson, privacyExportHash } from '../packages/governance/src/privacy.ts';
import { evaluateRetention, heldRetentionClasses, retentionPlanHash, retentionPolicyHash, validateRetentionHoldClass } from '../packages/governance/src/retention.ts';

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const throws = (fn, pattern, message) => { assert.throws(fn, pattern, message); assertions += 1; };

const now = new Date('2026-08-14T00:00:00.000Z');
equal(evaluateRetention({ dataClass: 'AUDIT', days: 30, legalHold: true }, now).reason, 'LEGAL_HOLD', 'caller-side legal hold must block preview');
equal(evaluateRetention({ dataClass: 'AUDIT', days: 3651 }, now).reason, 'INVALID_RETENTION', 'retention upper bound must fail closed');
equal(validateRetentionHoldClass(' user_content '), 'USER_CONTENT', 'legal-hold data class must normalize');
throws(() => validateRetentionHoldClass('SECRET'), /RETENTION_HOLD_DATA_CLASS_INVALID/, 'SECRET cannot be a retention hold class');

const planA = [
  { dataClass: 'AUDIT', table: 'audit_events', cutoff: '2026-07-01T00:00:00Z', candidateCount: 4 },
  { dataClass: 'ANALYTICS', table: 'analytics_daily', cutoff: '2026-06-01T00:00:00Z', candidateCount: 2 },
];
const planB = [...planA].reverse();
equal(retentionPlanHash(planA), retentionPlanHash(planB), 'plan hash must be independent of input ordering');
const policyA = [{ dataClass: 'AUDIT', table: 'audit_events', timestamp: 'created_at' }];
equal(retentionPolicyHash(policyA), retentionPolicyHash([...policyA].reverse()), 'retention policy hash must be deterministic');
check(retentionPolicyHash(policyA) !== retentionPolicyHash([{ ...policyA[0], predicate: 'result=\'OK\'' }]), 'retention policy hash must bind selector implementation');
check(retentionPlanHash(planA) !== retentionPlanHash([{ ...planA[0], candidateCount: 5 }, planA[1]]), 'plan hash must bind candidate counts');
throws(() => retentionPlanHash([{ ...planA[0], candidateCount: Number.MAX_SAFE_INTEGER + 1 }]), /RETENTION_PLAN_COUNT_INVALID/, 'unsafe candidate counts must fail closed');
throws(() => retentionPlanHash([planA[0], { ...planA[0], cutoff: '2026-05-01T00:00:00Z' }]), /RETENTION_PLAN_DUPLICATE_TARGET/, 'duplicate destructive targets must fail closed');
equal(heldRetentionClasses(planA, ['ALL']).join(','), 'ANALYTICS,AUDIT', 'ALL hold must block every class in a plan');
equal(heldRetentionClasses(planA, ['AUDIT']).join(','), 'AUDIT', 'specific hold must block only matching plan classes');

const canonicalA = { z: 2, a: { y: 4, x: 3 }, d: new Date('2026-08-14T01:02:03Z') };
const canonicalB = { d: '2026-08-14T01:02:03.000Z', a: { x: 3, y: 4 }, z: 2 };
equal(canonicalJson(canonicalA), canonicalJson(canonicalB), 'canonical JSON must normalize key order and dates');
equal(privacyExportHash(canonicalA), privacyExportHash(canonicalB), 'privacy export hash must survive JSONB key reordering');

const governance = await readFile(new URL('../packages/governance/src/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../packages/database/migrations/048_data_governance_holds.sql', import.meta.url), 'utf8');
const operatorActions = await readFile(new URL('../apps/platform/src/discord/operator-actions.ts', import.meta.url), 'utf8');
const panels = await readFile(new URL('../packages/panels/src/index.ts', import.meta.url), 'utf8');
const scheduledWorker = await readFile(new URL('../apps/platform/src/runtime/scheduled-worker.ts', import.meta.url), 'utf8');
const scheduler = await readFile(new URL('../packages/scheduler/src/index.ts', import.meta.url), 'utf8');

check(migration.includes('CREATE TABLE IF NOT EXISTS data_governance_state'), 'migration must create durable governance revision state');
check(migration.includes('CREATE TABLE IF NOT EXISTS retention_legal_holds'), 'migration must create durable legal holds');
check(migration.includes('ALTER TABLE retention_legal_holds ENABLE ROW LEVEL SECURITY'), 'legal holds must participate in RLS posture');
check(migration.includes('release_approval_id uuid UNIQUE') && migration.includes('release_approval_id IS NOT NULL'), 'released holds must retain a unique approval linkage');
check(migration.includes('retention_runs_plan_hash_format') && migration.includes('retention_runs_policy_hash_format') && migration.includes('retention_runs_error_code_bound'), 'retention run integrity evidence must have database-level format bounds');
check(migration.includes('ON DELETE RESTRICT'), 'destructive approval provenance must not be silently nullified by approval deletion');
check(governance.includes('pg_advisory_xact_lock'), 'retention mutations must serialize with a transaction-scoped advisory lock');
check(governance.includes("'LEGAL_HOLD_RELEASE','CRITICAL','PENDING'"), 'hold release approval must be CRITICAL');
check(governance.includes("$3,2,'{}'"), 'hold release must require two approvals');
check(governance.includes('RETENTION_GOVERNANCE_REVISION_CHANGED'), 'retention execution must invalidate stale governance revisions');
check(governance.includes('RETENTION_PLAN_HASH_MISMATCH'), 'retention execution must validate approved plan hash');
check(governance.includes('RETENTION_POLICY_CHANGED') && governance.includes('{plan,planHash,policyHash,governanceRevision}'), 'retention approvals must bind the active selector policy hash');
check(governance.includes('RETENTION_PLAN_EXPANDED:'), 'retention execution must fail if destructive candidate scope expands');
check(governance.includes('!Number.isSafeInteger(destructive)'), 'aggregate destructive scope must remain a safe integer');
check(governance.includes('!Number.isSafeInteger(examined)||examined<0'), 'current retention count must be safe before scope comparison');
check(governance.includes("state='ACTIVE' for share"), 'retention execution must recheck durable holds while transaction is locked');
check(governance.includes("update retention_runs set status='FAILED'"), 'retention failures must become durable terminal evidence');
check(governance.includes("select application_id,application_type,status,answers,created_at"), 'privacy export must use a bounded application projection');
check(!governance.includes('select application_id,application_type,status,answers,decision_reason'), 'privacy export must exclude application decision notes');
check(!governance.includes('select suggestion_id,status,content,staff_reason'), 'privacy export must exclude suggestion staff notes');
check(governance.includes('privacyExportHash(payload)'), 'privacy artifacts must use canonical integrity hashing');
check(governance.includes('repeatable read read only') && governance.includes('PRIVACY_EXPORT_ROW_LIMIT'), 'privacy export must read a repeatable bounded snapshot');
check(governance.includes('PRIVACY_EXPORT_TTL_INVALID') && governance.includes('PRIVACY_EXPORT_SCOPE_MISMATCH'), 'privacy export TTL and artifact scope must fail closed');
check(!governance.includes('.catch(()=>({rows:[]} as any))'), 'privacy export must not silently omit a failed source table');
check(operatorActions.includes("['RETENTION_DELETE','LEGAL_HOLD_RELEASE'].includes(before.operationKey)"), 'privacy approval UI must reject unrelated operation keys');
check(operatorActions.includes("approval.operationKey==='LEGAL_HOLD_RELEASE'"), 'privacy execution UI must explicitly dispatch hold release');
check(panels.includes("actionKey: 'privacy:holds'"), 'privacy panel must expose legal-hold evidence');
check(panels.includes("actionKey: 'privacy:hold'"), 'privacy panel must expose legal-hold creation');
check(panels.includes("actionKey: 'privacy:release-hold'"), 'privacy panel must expose controlled hold release request');
check(scheduledWorker.includes("taskType:'PRIVACY_EXPORT_EXPIRE'") && scheduledWorker.includes('from data_export_artifacts a join data_export_requests r'), 'scheduler reconciliation must recover missing privacy-export expiry tasks');
check(scheduledWorker.includes('ensureScheduledRecoverable') && scheduler.includes("state in ('FAILED','CANCELLED')") && scheduler.includes('attempts=0'), 'privacy expiry reconciliation must revive terminal failed/cancelled expiry tasks with a fresh bounded retry cycle');
check(scheduledWorker.includes('scheduler.privacy_export_expiry.reconciled'), 'privacy expiry recovery must emit non-payload reconciliation evidence');
check(scheduledWorker.includes("r.status='RUNNING'") && scheduledWorker.includes("interval '15 minutes'") && scheduledWorker.includes("status='FAILED'"), 'stale privacy export requests must not remain RUNNING forever');
check(operatorActions.includes('planHash:result.planHash') && operatorActions.includes('policyHash:result.policyHash') && operatorActions.includes('governanceRevision:result.governanceRevision'), 'retention request audit must expose the integrity bindings used for approval');
check(governance.includes('RETENTION_RUN_NOT_EXECUTABLE') && governance.includes('select status,approval_id from retention_runs'), 'retention execution must recheck its own run state after governance lock acquisition');
check(scheduledWorker.includes("interval '30 minutes'") && scheduledWorker.includes("status='RUNNING'") && scheduledWorker.includes('RETENTION_RUN_STALE_RECONCILED'), 'stale RUNNING retention evidence must converge to FAILED');
check(scheduledWorker.includes('pg_try_advisory_xact_lock(hashtext($1))') && scheduledWorker.includes('autoserver:retention:'), 'stale retention reconciliation must use the same guild governance advisory-lock namespace');
check(scheduledWorker.includes('scheduler.retention_runs.reconciled') && scheduledWorker.includes('staleRunsFailed:failed'), 'stale retention reconciliation must emit count-only evidence');

console.log(`data-governance-contract-smoke PASS ${assertions}`);
