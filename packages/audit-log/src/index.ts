import type { Database } from '@autoserver/database';
import {
  AUDIT_INTEGRITY_ALGORITHM,
  AUDIT_INTEGRITY_ZERO_HASH,
  auditIntegrityEventHash,
  auditIntegrityPayloadHash,
  auditIntegrityScopeKey,
} from './pure.ts';

export interface AuditQuery {
  guildId: string;
  action?: string;
  result?: string;
  resourceType?: string;
  correlationId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditRecord {
  auditId: string;
  guildId: string;
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  result: string;
  errorCode?: string;
  correlationId: string;
  createdAt: string;
  integrity: {
    state: 'CHAINED' | 'LEGACY_UNCHAINED';
    sequence?: string;
    eventHash?: string;
    algorithm?: string;
  };
}

export interface AuditPage {
  items: AuditRecord[];
  nextCursor?: string;
  redacted: true;
}

export interface AuditIntegrityReport {
  state: 'HEALTHY' | 'DEGRADED' | 'UNINITIALIZED';
  scopeKey: string;
  algorithm: string;
  coverage: 'NONE' | 'FULL' | 'TAIL';
  headSequence: string;
  headHash: string;
  firstCheckedSequence?: string;
  lastCheckedSequence?: string;
  checkedEntries: number;
  recomputedEntries: number;
  hashOnlyEntries: number;
  legacyUnchainedEntries: number;
  legacyUnchainedCapped: boolean;
  unchainedAfterStart: number;
  unchainedAfterStartCapped: boolean;
  mismatchCount: number;
  mismatches: string[];
  evidenceClass: 'database-tamper-evident-not-external-notarization';
}

const SENSITIVE_KEY = /(authorization|bearer|token|secret|password|passphrase|api[_-]?key|service[_-]?role|client[_-]?secret|cookie|session)/i;
const SENSITIVE_VALUE = /\b(?:sk|sb_secret|ghp|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/g;

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[depth-limit]';
  if (typeof value === 'string') return value.replace(SENSITIVE_VALUE, '[redacted]').slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactAuditValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactAuditValue(nested, depth + 1);
    }
    return out;
  }
  return value;
}

interface CursorPayload { createdAt: string; auditId: string; }
export function encodeAuditCursor(input: CursorPayload): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}
export function decodeAuditCursor(cursor?: string): CursorPayload | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>;
    if (!parsed.createdAt || !parsed.auditId || !/^\d{4}-\d{2}-\d{2}T/.test(parsed.createdAt) || !/^[0-9a-f-]{36}$/i.test(parsed.auditId)) throw new Error('invalid');
    return { createdAt: parsed.createdAt, auditId: parsed.auditId };
  } catch { throw new Error('AUDIT_CURSOR_INVALID'); }
}

function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }

export class AuditLogService {
  constructor(private readonly database: Database) {}

  async list(query: AuditQuery): Promise<AuditPage> {
    const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 50)));
    const cursor = decodeAuditCursor(query.cursor);
    const search = query.search?.trim().slice(0, 80) || undefined;
    const values: unknown[] = [query.guildId];
    const where = ['a.guild_id=$1'];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
    if (query.action) add('a.action=?', query.action.slice(0, 120));
    if (query.result) add('a.result=?', query.result.slice(0, 80));
    if (query.resourceType) add('a.resource_type=?', query.resourceType.slice(0, 120));
    if (query.correlationId) add('a.correlation_id=?::uuid', query.correlationId);
    if (search) {
      values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      const p = `$${values.length}`;
      where.push(`(a.action ilike ${p} escape '\\' or coalesce(a.resource_type,'') ilike ${p} escape '\\' or coalesce(a.resource_id,'') ilike ${p} escape '\\' or coalesce(a.error_code,'') ilike ${p} escape '\\')`);
    }
    if (cursor) {
      values.push(cursor.createdAt, cursor.auditId);
      where.push(`(a.created_at,a.audit_id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    }
    values.push(limit + 1);
    const { rows } = await this.database.requirePool().query<any>(
      `select a.audit_id,a.guild_id,a.actor_id,a.action,a.resource_type,a.resource_id,a.before_state,a.after_state,a.result,a.error_code,a.correlation_id,a.created_at,
              i.sequence::text as integrity_sequence,i.event_hash as integrity_event_hash,i.algorithm as integrity_algorithm
       from audit_events a
       left join audit_integrity_entries i on i.audit_id=a.audit_id and i.guild_id=a.guild_id
       where ${where.join(' and ')} order by a.created_at desc,a.audit_id desc limit $${values.length}`,
      values,
    );
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row: any): AuditRecord => ({
      auditId: String(row.audit_id), guildId: String(row.guild_id), actorId: row.actor_id ?? undefined,
      action: String(row.action), resourceType: row.resource_type ?? undefined, resourceId: row.resource_id ?? undefined,
      beforeState: row.before_state == null ? undefined : redactAuditValue(row.before_state), afterState: row.after_state == null ? undefined : redactAuditValue(row.after_state),
      result: String(row.result), errorCode: row.error_code ?? undefined, correlationId: String(row.correlation_id),
      createdAt: iso(row.created_at),
      integrity: row.integrity_sequence == null
        ? { state: 'LEGACY_UNCHAINED' }
        : { state: 'CHAINED', sequence: String(row.integrity_sequence), eventHash: String(row.integrity_event_hash), algorithm: String(row.integrity_algorithm) },
    }));
    const last = selected.at(-1);
    return { items, nextCursor: hasMore && last ? encodeAuditCursor({ createdAt: iso(last.created_at), auditId: String(last.audit_id) }) : undefined, redacted: true };
  }

  async verifyIntegrityTail(guildId: string, requestedLimit = 500): Promise<AuditIntegrityReport> {
    const limit=Math.max(10,Math.min(2000,Math.floor(requestedLimit)));
    const pool=this.database.requirePool();
    const scopeKey=auditIntegrityScopeKey(guildId);
    const headResult=await pool.query<{next_sequence:string;head_hash:string;algorithm:string}>(
      `select next_sequence::text,head_hash,algorithm from audit_integrity_heads where scope_key=$1`,[scopeKey],
    );
    const head=headResult.rows[0];
    if(!head){
      const legacy=await pool.query<{count:string}>(`select count(*)::text as count from (select 1 from audit_events where guild_id=$1 limit 1001) bounded`,[guildId]);
      const observed=Number(legacy.rows[0]?.count??0);
      return {state:'UNINITIALIZED',scopeKey,algorithm:AUDIT_INTEGRITY_ALGORITHM,coverage:'NONE',headSequence:'0',headHash:AUDIT_INTEGRITY_ZERO_HASH,checkedEntries:0,recomputedEntries:0,hashOnlyEntries:0,legacyUnchainedEntries:Math.min(1000,observed),legacyUnchainedCapped:observed>1000,unchainedAfterStart:0,unchainedAfterStartCapped:false,mismatchCount:0,mismatches:[],evidenceClass:'database-tamper-evident-not-external-notarization'};
    }
    const entryResult=await pool.query<any>(
      `select i.audit_id,i.sequence::text,i.previous_hash,i.payload_hash,i.event_hash,i.algorithm,i.event_created_at,
              a.actor_id,a.action,a.resource_type,a.resource_id,a.before_state,a.after_state,a.result,a.error_code,a.correlation_id,a.created_at as audit_created_at
       from audit_integrity_entries i
       left join audit_events a on a.audit_id=i.audit_id and a.guild_id=i.guild_id
       where i.scope_key=$1 order by i.sequence desc limit $2`,[scopeKey,limit],
    );
    const entries=[...entryResult.rows].reverse();
    const mismatches:string[]=[]; let mismatchCount=0;let recomputedEntries=0;let hashOnlyEntries=0;
    const pushMismatch=(value:string)=>{mismatchCount+=1;if(mismatches.length<50)mismatches.push(value);};
    if(head.algorithm!==AUDIT_INTEGRITY_ALGORITHM)pushMismatch('HEAD_ALGORITHM_MISMATCH');
    if(!entries.length){pushMismatch('HEAD_WITHOUT_ENTRIES');}
    if(entries.length){
      const first=entries[0];
      if(BigInt(first.sequence)===1n){if(first.previous_hash!==AUDIT_INTEGRITY_ZERO_HASH)pushMismatch('GENESIS_PREVIOUS_HASH_MISMATCH');}
      else{
        const anchor=await pool.query<{event_hash:string}>(`select event_hash from audit_integrity_entries where scope_key=$1 and sequence=$2`,[scopeKey,(BigInt(first.sequence)-1n).toString()]);
        if(!anchor.rows[0]||anchor.rows[0].event_hash!==first.previous_hash)pushMismatch(`ANCHOR_MISMATCH:${first.sequence}`);
      }
      for(let index=0;index<entries.length;index+=1){
        const entry=entries[index]!;
        if(entry.algorithm!==AUDIT_INTEGRITY_ALGORITHM)pushMismatch(`ALGORITHM_MISMATCH:${entry.sequence}`);
        if(index>0){const previous=entries[index-1]!;if(BigInt(entry.sequence)!==BigInt(previous.sequence)+1n)pushMismatch(`SEQUENCE_GAP:${previous.sequence}->${entry.sequence}`);if(entry.previous_hash!==previous.event_hash)pushMismatch(`CHAIN_LINK_MISMATCH:${entry.sequence}`);}
        let eventHashPayload=String(entry.payload_hash);
        if(entry.audit_created_at==null){
          hashOnlyEntries+=1;
        }else{
          recomputedEntries+=1;
          const createdAt=iso(entry.audit_created_at); const chainCreatedAt=iso(entry.event_created_at);
          if(createdAt!==chainCreatedAt)pushMismatch(`EVENT_TIME_MISMATCH:${entry.sequence}`);
          const payloadHash=auditIntegrityPayloadHash({auditId:String(entry.audit_id),guildId,actorId:entry.actor_id??undefined,action:String(entry.action),resourceType:entry.resource_type??undefined,resourceId:entry.resource_id??undefined,beforeState:entry.before_state??undefined,afterState:entry.after_state??undefined,result:String(entry.result),errorCode:entry.error_code??undefined,correlationId:String(entry.correlation_id),createdAt});
          if(payloadHash!==entry.payload_hash)pushMismatch(`PAYLOAD_HASH_MISMATCH:${entry.sequence}`);
          eventHashPayload=payloadHash;
        }
        try{
          const eventHash=auditIntegrityEventHash({scopeKey,sequence:entry.sequence,previousHash:String(entry.previous_hash),payloadHash:eventHashPayload,algorithm:String(entry.algorithm)});
          if(eventHash!==entry.event_hash)pushMismatch(`EVENT_HASH_MISMATCH:${entry.sequence}`);
        }catch{
          pushMismatch(`EVENT_HASH_INPUT_INVALID:${entry.sequence}`);
        }
      }
      const last=entries.at(-1)!; const expectedHeadSequence=BigInt(head.next_sequence)-1n;
      if(BigInt(last.sequence)!==expectedHeadSequence)pushMismatch(`HEAD_SEQUENCE_MISMATCH:${last.sequence}->${expectedHeadSequence.toString()}`);
      if(last.event_hash!==head.head_hash)pushMismatch('HEAD_HASH_MISMATCH');
    }
    const chainStart=await pool.query<{started_at:Date|string|null}>(`select event_created_at as started_at from audit_integrity_entries where scope_key=$1 and sequence=1`,[scopeKey]);
    const startedAt=chainStart.rows[0]?.started_at;
    const [legacyCount,postStartCount]=await Promise.all([
      pool.query<{count:string}>(
        `select count(*)::text as count from (select 1 from audit_events a left join audit_integrity_entries i on i.audit_id=a.audit_id and i.guild_id=a.guild_id where a.guild_id=$1 and i.audit_id is null and ($2::timestamptz is null or a.created_at < $2::timestamptz) limit 1001) bounded`,
        [guildId,startedAt??null],
      ),
      pool.query<{count:string}>(
        `select count(*)::text as count from (select 1 from audit_events a left join audit_integrity_entries i on i.audit_id=a.audit_id and i.guild_id=a.guild_id where a.guild_id=$1 and i.audit_id is null and $2::timestamptz is not null and a.created_at >= $2::timestamptz limit 101) bounded`,
        [guildId,startedAt??null],
      ),
    ]);
    const legacyObserved=Number(legacyCount.rows[0]?.count??0);const postStartObserved=Number(postStartCount.rows[0]?.count??0);
    const legacyUnchainedEntries=Math.min(1000,legacyObserved);const legacyUnchainedCapped=legacyObserved>1000;
    const unchainedAfterStart=Math.min(100,postStartObserved);const unchainedAfterStartCapped=postStartObserved>100;
    if(unchainedAfterStart>0)pushMismatch(`UNCHAINED_EVENTS_AFTER_START:${unchainedAfterStart}${unchainedAfterStartCapped?'+':''}`);
    return {state:mismatchCount?'DEGRADED':'HEALTHY',scopeKey,algorithm:head.algorithm,coverage:entries.length&&BigInt(entries[0]!.sequence)===1n?'FULL':'TAIL',headSequence:(BigInt(head.next_sequence)-1n).toString(),headHash:head.head_hash,firstCheckedSequence:entries[0]?.sequence,lastCheckedSequence:entries.at(-1)?.sequence,checkedEntries:entries.length,recomputedEntries,hashOnlyEntries,legacyUnchainedEntries,legacyUnchainedCapped,unchainedAfterStart,unchainedAfterStartCapped,mismatchCount,mismatches,evidenceClass:'database-tamper-evident-not-external-notarization'};
  }
}
