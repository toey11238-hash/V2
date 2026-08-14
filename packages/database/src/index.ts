import { decideEventSequence } from '@autoserver/core';
import { AUDIT_INTEGRITY_ALGORITHM, AUDIT_INTEGRITY_ZERO_HASH, auditIntegrityEventHash, auditIntegrityPayloadHash, auditIntegrityScopeKey } from '@autoserver/audit-log/pure';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import type { AppConfig } from '@autoserver/config';

const { Pool } = pg;

export interface DatabaseHealth {
  configured: boolean;
  healthy: boolean;
  latencyMs?: number;
  detail: string;
  pool?: { total: number; idle: number; waiting: number; max: number };
}

export class Database {
  readonly pool: pg.Pool | null;

  constructor(private readonly config: AppConfig) {
    this.pool = config.DATABASE_URL
      ? new Pool({
          connectionString: config.DATABASE_URL,
          ssl: config.DATABASE_SSL ? { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED } : undefined,
          max: config.DATABASE_POOL_MAX,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: config.DATABASE_CONNECT_TIMEOUT_MS,
          statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
          query_timeout: config.DATABASE_QUERY_TIMEOUT_MS,
        })
      : null;
  }

  get configured(): boolean {
    return this.pool !== null;
  }

  requirePool(): pg.Pool {
    if (!this.pool) throw new Error('DATABASE_URL is required for durable operations');
    return this.pool;
  }

  async transaction<T>(operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      await client.query('begin');
      const value = await operation(client);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<DatabaseHealth> {
    if (!this.pool) return { configured: false, healthy: false, detail: 'DATABASE_URL not configured' };
    const started = performance.now();
    try {
      await this.pool.query('select 1 as ok');
      return { configured: true, healthy: true, latencyMs: Math.round(performance.now() - started), detail: 'PostgreSQL reachable', pool:{total:this.pool.totalCount,idle:this.pool.idleCount,waiting:this.pool.waitingCount,max:this.config.DATABASE_POOL_MAX} };
    } catch (error) {
      return { configured: true, healthy: false, latencyMs: Math.round(performance.now() - started), detail: 'Database health check failed', pool:{total:this.pool.totalCount,idle:this.pool.idleCount,waiting:this.pool.waitingCount,max:this.config.DATABASE_POOL_MAX} };
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

export async function runMigrations(database: Database, migrationsDir = resolve('packages/database/migrations')): Promise<string[]> {
  const pool = database.requirePool();
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const appliedRows = await pool.query<{ version: string }>('select version from schema_migrations');
  const applied = new Set(appliedRows.rows.map((row) => row.version));
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const rawSql = await readFile(resolve(migrationsDir, file), 'utf8');
    const sql = rawSql
      .replace(/^\s*BEGIN;\s*/i, '')
      .replace(/\s*COMMIT;\s*$/i, '');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations(version) values($1)', [file]);
      await client.query('commit');
      ran.push(file);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return ran;
}

export interface ResourceMapping {
  guildId: string;
  logicalKey: string;
  resourceKind: string;
  discordId: string;
  ownership: 'SYSTEM_OWNED' | 'TEMPLATE_OWNED' | 'USER_OWNED' | 'LOCKED';
  nameSnapshot?: string;
  locked: boolean;
}

export class ResourceMappingRepository {
  constructor(private readonly db: Database) {}

  async list(guildId: string): Promise<ResourceMapping[]> {
    const { rows } = await this.db.requirePool().query<{
      guild_id: string; logical_key: string; resource_kind: string; discord_id: string; ownership: ResourceMapping['ownership']; name_snapshot: string | null; locked: boolean;
    }>(`select guild_id, logical_key, resource_kind, discord_id, ownership, name_snapshot, locked from resource_mappings where guild_id=$1`, [guildId]);
    return rows.map((row) => ({ guildId: row.guild_id, logicalKey: row.logical_key, resourceKind: row.resource_kind, discordId: row.discord_id, ownership: row.ownership, nameSnapshot: row.name_snapshot ?? undefined, locked: row.locked }));
  }

  async upsert(mapping: ResourceMapping): Promise<void> {
    await this.db.requirePool().query(
      `insert into resource_mappings(guild_id, logical_key, resource_kind, discord_id, ownership, name_snapshot, locked)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict (guild_id, logical_key) do update set
         resource_kind=excluded.resource_kind,
         discord_id=excluded.discord_id,
         ownership=excluded.ownership,
         name_snapshot=excluded.name_snapshot,
         locked=excluded.locked,
         updated_at=now()`,
      [mapping.guildId, mapping.logicalKey, mapping.resourceKind, mapping.discordId, mapping.ownership, mapping.nameSnapshot ?? null, mapping.locked],
    );
  }


  async get(guildId: string, logicalKey: string): Promise<ResourceMapping | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `select guild_id,logical_key,resource_kind,discord_id,ownership,name_snapshot,locked from resource_mappings where guild_id=$1 and logical_key=$2`,
      [guildId, logicalKey],
    );
    const row = rows[0];
    return row ? { guildId: row.guild_id, logicalKey: row.logical_key, resourceKind: row.resource_kind, discordId: row.discord_id,
      ownership: row.ownership, nameSnapshot: row.name_snapshot ?? undefined, locked: row.locked } : null;
  }

  async setLocked(guildId: string, logicalKey: string, locked: boolean): Promise<boolean> {
    const result = await this.db.requirePool().query(
      "update resource_mappings set locked=$3, ownership=case when $3 then 'LOCKED' else case when ownership='LOCKED' then 'SYSTEM_OWNED' else ownership end end, updated_at=now() where guild_id=$1 and logical_key=$2",
      [guildId, logicalKey, locked],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteIfMatches(guildId: string, logicalKey: string, discordId: string): Promise<boolean> {
    const result = await this.db.requirePool().query(
      'delete from resource_mappings where guild_id=$1 and logical_key=$2 and discord_id=$3',
      [guildId, logicalKey, discordId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export async function ensureGuild(database: Database, guild: { id: string; name?: string; ownerId?: string }): Promise<void> {
  await database.requirePool().query(
    `insert into guilds(guild_id, name_snapshot, owner_id, joined_at, last_seen_at)
     values($1,$2,$3,now(),now())
     on conflict (guild_id) do update set name_snapshot=excluded.name_snapshot, owner_id=coalesce(excluded.owner_id,guilds.owner_id), last_seen_at=now(), updated_at=now()`,
    [guild.id, guild.name ?? null, guild.ownerId ?? null],
  );
}

export class GuildLockRepository {
  constructor(private readonly db: Database) {}

  async acquire(input: { guildId: string; lockKey: string; ownerId: string; correlationId: string; ttlSeconds: number }): Promise<boolean> {
    const { rowCount } = await this.db.requirePool().query(
      `insert into guild_locks(guild_id,lock_key,owner_id,correlation_id,expires_at)
       values($1,$2,$3,$4,now()+make_interval(secs => $5))
       on conflict (guild_id,lock_key) do update set
         owner_id=excluded.owner_id,
         correlation_id=excluded.correlation_id,
         expires_at=excluded.expires_at,
         created_at=now()
       where guild_locks.expires_at < now()`,
      [input.guildId, input.lockKey, input.ownerId, input.correlationId, input.ttlSeconds],
    );
    return (rowCount ?? 0) > 0;
  }

  async renew(guildId: string, lockKey: string, ownerId: string, ttlSeconds: number): Promise<boolean> {
    const { rowCount } = await this.db.requirePool().query(
      `update guild_locks set expires_at=now()+make_interval(secs => $4) where guild_id=$1 and lock_key=$2 and owner_id=$3 and expires_at > now()`,
      [guildId, lockKey, ownerId, ttlSeconds],
    );
    return (rowCount ?? 0) > 0;
  }

  async release(guildId: string, lockKey: string, ownerId: string): Promise<void> {
    await this.db.requirePool().query('delete from guild_locks where guild_id=$1 and lock_key=$2 and owner_id=$3', [guildId, lockKey, ownerId]);
  }
}

export interface GuildConfigRecord {
  guildId: string;
  version: number;
  schemaVersion: number;
  templateKey: string;
  templateVersion: number;
  language: string;
  timezone: string;
  themeKey: string;
  sizeProfile: string;
  enabledModules: Record<string, boolean>;
  automationPolicy: Record<string, unknown>;
  permissionPolicy: Record<string, unknown>;
  retentionPolicy: Record<string, unknown>;
  setupProfile: Record<string, unknown>;
  gamingConfig: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  migrationStatus?: string;
  lastAppliedVersion?: number;
  lastVerifiedVersion?: number;
}

export class GuildConfigRepository {
  constructor(private readonly db: Database) {}

  async get(guildId: string): Promise<GuildConfigRecord | null> {
    const { rows } = await this.db.requirePool().query<any>('select * from guild_configs where guild_id=$1', [guildId]);
    const row = rows[0];
    if (!row) return null;
    return {
      guildId: row.guild_id, version: row.version, schemaVersion: row.schema_version, templateKey: row.template_key,
      templateVersion: row.template_version, language: row.language, timezone: row.timezone, themeKey: row.theme_key,
      sizeProfile: row.size_profile, enabledModules: row.enabled_modules ?? {},
      automationPolicy: row.automation_policy ?? {}, permissionPolicy: row.permission_policy ?? {}, retentionPolicy: row.retention_policy ?? {},
      setupProfile: row.setup_profile ?? {}, gamingConfig: row.gaming_config ?? {}, approvalPolicy: row.approval_policy ?? {},
      migrationStatus: row.migration_status ?? undefined,
      lastAppliedVersion: row.last_applied_version ?? undefined, lastVerifiedVersion: row.last_verified_version ?? undefined,
    };
  }

  async applyBlueprint(input: {
    guildId: string; actorId?: string; templateKey: string; templateVersion: number; sizeProfile: string; enabledModules: readonly string[]; verified: boolean;
    language?: string; timezone?: string; themeKey?: string; automationPolicy?: Record<string, unknown>; permissionPolicy?: Record<string, unknown>; retentionPolicy?: Record<string, unknown>;
    setupProfile?: Record<string, unknown>; gamingConfig?: Record<string, unknown>; approvalPolicy?: Record<string, unknown>;
  }): Promise<number> {
    const enabledModules = Object.fromEntries(input.enabledModules.map((key) => [key, true]));
    const { rows } = await this.db.requirePool().query<{ version: number }>(
      `insert into guild_configs(guild_id,version,schema_version,template_key,template_version,size_profile,enabled_modules,language,timezone,theme_key,automation_policy,permission_policy,retention_policy,setup_profile,gaming_config,approval_policy,last_applied_version,last_verified_version,updated_by)
       values($1,1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,$15,$16)
       on conflict (guild_id) do update set
         version=guild_configs.version+1,
         template_key=excluded.template_key,
         template_version=excluded.template_version,
         size_profile=excluded.size_profile,
         enabled_modules=excluded.enabled_modules,
         language=excluded.language,
         timezone=excluded.timezone,
         theme_key=excluded.theme_key,
         automation_policy=excluded.automation_policy,
         permission_policy=excluded.permission_policy,
         retention_policy=excluded.retention_policy,
         setup_profile=excluded.setup_profile,
         gaming_config=excluded.gaming_config,
         approval_policy=excluded.approval_policy,
         last_applied_version=guild_configs.version+1,
         last_verified_version=case when $15 is not null then guild_configs.version+1 else guild_configs.last_verified_version end,
         updated_by=excluded.updated_by,
         migration_status='CURRENT',
         updated_at=now()
       returning version`,
      [input.guildId, input.templateKey, input.templateVersion, input.sizeProfile, enabledModules, input.language ?? 'th', input.timezone ?? 'Asia/Bangkok', input.themeKey ?? 'command-bridge',
       input.automationPolicy ?? {}, input.permissionPolicy ?? {}, input.retentionPolicy ?? {}, input.setupProfile ?? {}, input.gamingConfig ?? {}, input.approvalPolicy ?? {}, input.verified ? 1 : null, input.actorId ?? null],
    );
    return rows[0]!.version;
  }
}

export interface AuditWriteResult { sequence: string; eventHash: string; payloadHash: string; algorithm: string; createdAt: string; }

export class AuditRepository {
  constructor(private readonly db: Database) {}
  async record(input: { auditId: string; guildId?: string; actorId?: string; action: string; resourceType?: string; resourceId?: string; beforeState?: unknown; afterState?: unknown; result: string; errorCode?: string; correlationId: string }): Promise<AuditWriteResult> {
    const createdAt=new Date().toISOString();
    const scopeKey=auditIntegrityScopeKey(input.guildId);
    const payloadHash=auditIntegrityPayloadHash({...input,createdAt});
    return this.db.transaction(async(client)=>{
      await client.query(
        `insert into audit_integrity_heads(scope_key,guild_id,next_sequence,head_hash,algorithm)
         values($1,$2,1,$3,$4) on conflict(scope_key) do nothing`,
        [scopeKey,input.guildId??null,AUDIT_INTEGRITY_ZERO_HASH,AUDIT_INTEGRITY_ALGORITHM],
      );
      const headResult=await client.query<{next_sequence:string;head_hash:string;algorithm:string}>(
        `select next_sequence::text,head_hash,algorithm from audit_integrity_heads where scope_key=$1 for update`,[scopeKey],
      );
      const head=headResult.rows[0];
      if(!head)throw new Error('AUDIT_INTEGRITY_HEAD_MISSING');
      if(head.algorithm!==AUDIT_INTEGRITY_ALGORITHM)throw new Error('AUDIT_INTEGRITY_ALGORITHM_MISMATCH');
      const sequence=BigInt(head.next_sequence);
      if(sequence<1n)throw new Error('AUDIT_INTEGRITY_SEQUENCE_INVALID');
      const eventHash=auditIntegrityEventHash({scopeKey,sequence,previousHash:head.head_hash,payloadHash,algorithm:head.algorithm});
      await client.query(
        `insert into audit_events(audit_id,guild_id,actor_id,action,resource_type,resource_id,before_state,after_state,result,error_code,correlation_id,created_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [input.auditId,input.guildId??null,input.actorId??null,input.action,input.resourceType??null,input.resourceId??null,input.beforeState??null,input.afterState??null,input.result,input.errorCode??null,input.correlationId,createdAt],
      );
      await client.query(
        `insert into audit_integrity_entries(audit_id,scope_key,guild_id,sequence,previous_hash,payload_hash,event_hash,algorithm,event_created_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.auditId,scopeKey,input.guildId??null,sequence.toString(),head.head_hash,payloadHash,eventHash,head.algorithm,createdAt],
      );
      await client.query(
        `update audit_integrity_heads set next_sequence=$2,head_hash=$3,updated_at=now() where scope_key=$1`,
        [scopeKey,(sequence+1n).toString(),eventHash],
      );
      return {sequence:sequence.toString(),eventHash,payloadHash,algorithm:head.algorithm,createdAt};
    });
  }
}

export interface SetupSessionRecord<T = Record<string, unknown>> {
  sessionId: string;
  guildId: string;
  actorId: string;
  state: string;
  config: T;
  configVersion: number;
  correlationId: string;
  expiresAt: string;
}

export class SetupSessionRepository {
  constructor(private readonly db: Database) {}

  async start<T extends Record<string, unknown>>(input: { sessionId: string; guildId: string; actorId: string; correlationId: string; config: T; ttlMinutes?: number }): Promise<SetupSessionRecord<T>> {
    const ttl = Math.max(5, Math.min(180, input.ttlMinutes ?? 45));
    const { rows } = await this.db.requirePool().query<any>(
      `insert into setup_sessions(session_id,guild_id,actor_id,state,config,config_version,correlation_id,expires_at)
       values($1,$2,$3,'CONFIGURING',$4,1,$5,now()+make_interval(mins => $6))
       returning *`,
      [input.sessionId, input.guildId, input.actorId, input.config, input.correlationId, ttl],
    );
    return this.map(rows[0]);
  }

  async get<T extends Record<string, unknown>>(sessionId: string, guildId?: string): Promise<SetupSessionRecord<T> | null> {
    const values: unknown[] = [sessionId];
    let sql = 'select * from setup_sessions where session_id=$1 and expires_at > now()';
    if (guildId) { values.push(guildId); sql += ' and guild_id=$2'; }
    const { rows } = await this.db.requirePool().query<any>(sql, values);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async patch<T extends Record<string, unknown>>(input: { sessionId: string; guildId: string; actorId: string; expectedVersion: number; config: T }): Promise<SetupSessionRecord<T>> {
    const { rows } = await this.db.requirePool().query<any>(
      `update setup_sessions set config=$5, config_version=config_version+1, updated_at=now()
       where session_id=$1 and guild_id=$2 and actor_id=$3 and config_version=$4 and expires_at > now()
       returning *`,
      [input.sessionId, input.guildId, input.actorId, input.expectedVersion, input.config],
    );
    if (!rows[0]) throw new Error('Setup session changed or expired; reopen /setup to continue safely.');
    return this.map(rows[0]);
  }

  async setState(sessionId: string, guildId: string, state: string): Promise<void> {
    await this.db.requirePool().query('update setup_sessions set state=$3, updated_at=now() where session_id=$1 and guild_id=$2', [sessionId, guildId, state]);
  }

  private map<T extends Record<string, unknown>>(row: any): SetupSessionRecord<T> {
    return {
      sessionId: row.session_id,
      guildId: row.guild_id,
      actorId: row.actor_id,
      state: row.state,
      config: row.config as T,
      configVersion: row.config_version,
      correlationId: row.correlation_id,
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    };
  }
}

export interface PanelRegistryRecord {
  guildId: string;
  panelId: string;
  schemaVersion: number;
  contentVersion: number;
  contentHash: string;
  targetChannelKey: string;
  targetChannelId?: string;
  messageId?: string;
  lifecycleState: string;
  ownership: string;
  repairPolicy: string;
  config: Record<string, unknown>;
}

export class PanelRegistryRepository {
  constructor(private readonly db: Database) {}

  async list(guildId: string): Promise<PanelRegistryRecord[]> {
    const { rows } = await this.db.requirePool().query<any>('select * from panel_registry where guild_id=$1 order by panel_id', [guildId]);
    return rows.map((row) => ({
      guildId: row.guild_id, panelId: row.panel_id, schemaVersion: row.schema_version, contentVersion: row.content_version,
      contentHash: row.content_hash, targetChannelKey: row.target_channel_key, targetChannelId: row.target_channel_id ?? undefined,
      messageId: row.message_id ?? undefined, lifecycleState: row.lifecycle_state, ownership: row.ownership,
      repairPolicy: row.repair_policy, config: row.config ?? {},
    }));
  }

  async findByMessage(guildId: string, messageId: string): Promise<PanelRegistryRecord | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `select * from panel_registry where guild_id=$1 and message_id=$2 limit 1`, [guildId, messageId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      guildId: row.guild_id, panelId: row.panel_id, schemaVersion: row.schema_version, contentVersion: row.content_version,
      contentHash: row.content_hash, targetChannelKey: row.target_channel_key, targetChannelId: row.target_channel_id ?? undefined,
      messageId: row.message_id ?? undefined, lifecycleState: row.lifecycle_state, ownership: row.ownership,
      repairPolicy: row.repair_policy, config: row.config ?? {},
    };
  }

  async get(guildId: string, panelId: string): Promise<PanelRegistryRecord | null> {
    const { rows } = await this.db.requirePool().query<any>('select * from panel_registry where guild_id=$1 and panel_id=$2', [guildId, panelId]);
    const row = rows[0];
    if (!row) return null;
    return {
      guildId: row.guild_id, panelId: row.panel_id, schemaVersion: row.schema_version, contentVersion: row.content_version,
      contentHash: row.content_hash, targetChannelKey: row.target_channel_key, targetChannelId: row.target_channel_id ?? undefined,
      messageId: row.message_id ?? undefined, lifecycleState: row.lifecycle_state, ownership: row.ownership,
      repairPolicy: row.repair_policy, config: row.config ?? {},
    };
  }

  async upsert(input: PanelRegistryRecord): Promise<void> {
    await this.db.requirePool().query(
      `insert into panel_registry(guild_id,panel_id,schema_version,content_version,content_hash,target_channel_key,target_channel_id,message_id,lifecycle_state,ownership,repair_policy,config,last_synced_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       on conflict (guild_id,panel_id) do update set
         schema_version=excluded.schema_version, content_version=excluded.content_version, content_hash=excluded.content_hash,
         target_channel_key=excluded.target_channel_key, target_channel_id=excluded.target_channel_id, message_id=excluded.message_id,
         lifecycle_state=excluded.lifecycle_state, ownership=excluded.ownership, repair_policy=excluded.repair_policy,
         config=excluded.config, last_synced_at=now(), updated_at=now()`,
      [input.guildId, input.panelId, input.schemaVersion, input.contentVersion, input.contentHash, input.targetChannelKey, input.targetChannelId ?? null,
       input.messageId ?? null, input.lifecycleState, input.ownership, input.repairPolicy, input.config],
    );
  }

  async setLifecycle(guildId: string, panelId: string, lifecycleState: string): Promise<void> {
    const allowed = new Set(['REGISTERED','CREATING','PUBLISHED','ACTIVE','UPDATING','STALE','MISSING','REPAIRING','FAILED','DISABLED','ARCHIVED']);
    if (!allowed.has(lifecycleState)) throw new Error('INVALID_PANEL_LIFECYCLE');
    const result = await this.db.requirePool().query(
      `update panel_registry set lifecycle_state=$3,updated_at=now() where guild_id=$1 and panel_id=$2`,
      [guildId,panelId,lifecycleState],
    );
    if (!result.rowCount) throw new Error('PANEL_NOT_FOUND');
  }

  async recordVersion(input: { guildId: string; panelId: string; contentVersion: number; contentHash: string; config: Record<string, unknown>; assetKeys: string[]; createdBy?: string }): Promise<void> {
    await this.db.requirePool().query(
      `insert into panel_versions(guild_id,panel_id,content_version,content_hash,config,asset_keys,created_by)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict (guild_id,panel_id,content_version) do update set
         content_hash=excluded.content_hash, config=excluded.config, asset_keys=excluded.asset_keys`,
      [input.guildId, input.panelId, input.contentVersion, input.contentHash, input.config, input.assetKeys, input.createdBy ?? null],
    );
  }

  async getVersion(guildId: string, panelId: string, contentVersion: number): Promise<{ contentVersion: number; contentHash: string; config: Record<string, unknown>; assetKeys: string[] } | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `select content_version,content_hash,config,asset_keys from panel_versions where guild_id=$1 and panel_id=$2 and content_version=$3`,
      [guildId, panelId, contentVersion],
    );
    const row = rows[0];
    return row ? { contentVersion: row.content_version, contentHash: row.content_hash, config: row.config ?? {}, assetKeys: Array.isArray(row.asset_keys) ? row.asset_keys : [] } : null;
  }

  async listVersions(guildId: string, panelId: string): Promise<Array<{ contentVersion: number; contentHash: string; createdAt: string }>> {
    const { rows } = await this.db.requirePool().query<any>(
      `select content_version,content_hash,created_at from panel_versions where guild_id=$1 and panel_id=$2 order by content_version desc`,
      [guildId, panelId],
    );
    return rows.map((row) => ({ contentVersion: row.content_version, contentHash: row.content_hash, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) }));
  }
}

export interface DashboardGuildAccess {
  guildId: string;
  name: string;
  icon: string | null;
  permissions: string;
  owner: boolean;
}

export interface DashboardSessionRecord {
  sessionId: string;
  userId: string;
  userProfile: Record<string, unknown>;
  guildAccess: DashboardGuildAccess[];
  csrfToken: string;
  expiresAt: string;
  lastSeenAt: string;
}

export class DashboardSessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    sessionId: string;
    userId: string;
    userProfile: Record<string, unknown>;
    guildAccess: DashboardGuildAccess[];
    csrfToken: string;
    ttlHours?: number;
  }): Promise<DashboardSessionRecord> {
    const ttlHours = Math.max(1, Math.min(24, input.ttlHours ?? 8));
    const { rows } = await this.db.requirePool().query<any>(
      `insert into dashboard_sessions(session_id,user_id,user_profile,guild_access,csrf_token,expires_at)
       values($1,$2,$3,$4,$5,now()+make_interval(hours => $6))
       returning *`,
      [input.sessionId, input.userId, input.userProfile, input.guildAccess, input.csrfToken, ttlHours],
    );
    return this.map(rows[0]);
  }

  async get(sessionId: string): Promise<DashboardSessionRecord | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `update dashboard_sessions set last_seen_at=now()
       where session_id=$1 and expires_at > now()
       returning *`,
      [sessionId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.requirePool().query('delete from dashboard_sessions where session_id=$1', [sessionId]);
  }

  async pruneExpired(): Promise<number> {
    const result = await this.db.requirePool().query('delete from dashboard_sessions where expires_at <= now()');
    return result.rowCount ?? 0;
  }

  private map(row: any): DashboardSessionRecord {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      userProfile: row.user_profile ?? {},
      guildAccess: Array.isArray(row.guild_access) ? row.guild_access : [],
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
      lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    };
  }
}

export type MutationJournalState = 'PREPARED' | 'APPLIED' | 'COMPENSATING' | 'COMPENSATED' | 'SKIPPED' | 'FAILED';

export interface MutationJournalRecord {
  mutationId: string;
  jobId: string;
  guildId: string;
  sequenceNo: number;
  action: string;
  resourceKind: string;
  logicalKey: string;
  discordId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  compensator?: Record<string, unknown>;
  state: MutationJournalState;
  errorCode?: string;
  correlationId: string;
}

export class MutationJournalRepository {
  constructor(private readonly db: Database) {}

  async prepare(input: Omit<MutationJournalRecord, 'state'>): Promise<void> {
    await this.db.requirePool().query(
      `insert into mutation_journal(mutation_id,job_id,guild_id,sequence_no,action,resource_kind,logical_key,discord_id,before_state,after_state,compensator,state,correlation_id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PREPARED',$12)
       on conflict (job_id,sequence_no) do nothing`,
      [input.mutationId, input.jobId, input.guildId, input.sequenceNo, input.action, input.resourceKind, input.logicalKey,
       input.discordId ?? null, input.beforeState ?? null, input.afterState ?? null, input.compensator ?? null, input.correlationId],
    );
  }

  async markApplied(mutationId: string, discordId?: string, afterState?: Record<string, unknown>): Promise<void> {
    await this.db.requirePool().query(
      `update mutation_journal set state='APPLIED', discord_id=coalesce($2,discord_id), after_state=coalesce($3,after_state), applied_at=now()
       where mutation_id=$1 and state in ('PREPARED','APPLIED')`,
      [mutationId, discordId ?? null, afterState ?? null],
    );
  }

  async markState(mutationId: string, state: MutationJournalState, errorCode?: string): Promise<void> {
    await this.db.requirePool().query(
      `update mutation_journal set state=$2, error_code=$3, compensated_at=case when $2='COMPENSATED' then now() else compensated_at end
       where mutation_id=$1`,
      [mutationId, state, errorCode ?? null],
    );
  }

  async listAppliedReverse(jobId: string): Promise<MutationJournalRecord[]> {
    const { rows } = await this.db.requirePool().query<any>(
      `select * from mutation_journal where job_id=$1 and state='APPLIED' order by sequence_no desc`,
      [jobId],
    );
    return rows.map((row) => this.map(row));
  }

  async list(jobId: string): Promise<MutationJournalRecord[]> {
    const { rows } = await this.db.requirePool().query<any>(
      'select * from mutation_journal where job_id=$1 order by sequence_no',
      [jobId],
    );
    return rows.map((row) => this.map(row));
  }

  private map(row: any): MutationJournalRecord {
    return {
      mutationId: row.mutation_id,
      jobId: row.job_id,
      guildId: row.guild_id,
      sequenceNo: row.sequence_no,
      action: row.action,
      resourceKind: row.resource_kind,
      logicalKey: row.logical_key,
      discordId: row.discord_id ?? undefined,
      beforeState: row.before_state ?? undefined,
      afterState: row.after_state ?? undefined,
      compensator: row.compensator ?? undefined,
      state: row.state,
      errorCode: row.error_code ?? undefined,
      correlationId: row.correlation_id,
    };
  }
}

export interface DurableEventRecord {
  eventId: string;
  guildId?: string;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  correlationId: string;
  source?: string;
  aggregateKey?: string;
  sequence?: number;
  attempts: number;
}

export class EventInboxRepository {
  constructor(private readonly db: Database) {}

  async receive(input: DurableEventRecord & { dedupKey?: string }): Promise<boolean> {
    const { rowCount } = await this.db.requirePool().query(
      `insert into event_inbox(event_id,guild_id,event_type,dedup_key,schema_version,payload,correlation_id,source,aggregate_key,sequence_no,state)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RECEIVED')
       on conflict do nothing`,
      [input.eventId, input.guildId ?? null, input.eventType, input.dedupKey ?? null, input.schemaVersion, input.payload, input.correlationId, input.source ?? null, input.aggregateKey ?? null, input.sequence ?? null],
    );
    return (rowCount ?? 0) > 0;
  }

  async claim(workerId: string, leaseSeconds = 30): Promise<DurableEventRecord | null> {
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<any>(
        `select * from event_inbox
         where processed_at is null and state in ('RECEIVED','RETRYING') and available_at <= now()
           and (lease_expires_at is null or lease_expires_at < now())
         order by received_at asc
         for update skip locked limit 1`,
      );
      const row = rows[0];
      if (!row) return null;
      await client.query(
        `update event_inbox set state='PROCESSING', attempts=attempts+1, lease_owner=$2,
         lease_expires_at=now()+make_interval(secs => $3) where event_id=$1`,
        [row.event_id, workerId, leaseSeconds],
      );
      return this.map({ ...row, attempts: Number(row.attempts ?? 0) + 1 });
    });
  }

  async complete(eventId: string, workerId: string): Promise<void> {
    await this.db.requirePool().query(
      `update event_inbox set state='PROCESSED', processed_at=now(), lease_owner=null, lease_expires_at=null
       where event_id=$1 and lease_owner=$2`, [eventId, workerId],
    );
  }

  async retry(eventId: string, workerId: string, errorCode: string, delaySeconds: number): Promise<void> {
    await this.db.requirePool().query(
      `update event_inbox set state='RETRYING', last_error_code=$3, available_at=now()+make_interval(secs => $4),
       lease_owner=null, lease_expires_at=null where event_id=$1 and lease_owner=$2`,
      [eventId, workerId, errorCode, delaySeconds],
    );
  }

  private map(row: any): DurableEventRecord {
    return { eventId: row.event_id, guildId: row.guild_id ?? undefined, eventType: row.event_type, schemaVersion: row.schema_version,
      payload: row.payload ?? {}, correlationId: row.correlation_id, source: row.source ?? undefined, aggregateKey: row.aggregate_key ?? undefined, sequence: row.sequence_no === null || row.sequence_no === undefined ? undefined : Number(row.sequence_no), attempts: Number(row.attempts ?? 0) };
  }
}

export class EventOutboxRepository {
  constructor(private readonly db: Database) {}

  async enqueue(input: Omit<DurableEventRecord, 'attempts'>): Promise<void> {
    await this.db.requirePool().query(
      `insert into event_outbox(event_id,guild_id,event_type,schema_version,payload,correlation_id,source,aggregate_key,sequence_no)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (event_id) do nothing`,
      [input.eventId, input.guildId ?? null, input.eventType, input.schemaVersion, input.payload, input.correlationId, input.source ?? null, input.aggregateKey ?? null, input.sequence ?? null],
    );
  }

  async claim(workerId: string, leaseSeconds = 30): Promise<DurableEventRecord | null> {
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<any>(
        `select * from event_outbox where published_at is null and available_at <= now()
           and (lease_expires_at is null or lease_expires_at < now())
         order by created_at asc for update skip locked limit 1`,
      );
      const row = rows[0];
      if (!row) return null;
      await client.query(
        `update event_outbox set attempts=attempts+1, lease_owner=$2, lease_expires_at=now()+make_interval(secs => $3)
         where event_id=$1`, [row.event_id, workerId, leaseSeconds],
      );
      return this.map({ ...row, attempts: Number(row.attempts ?? 0) + 1 });
    });
  }

  async published(eventId: string, workerId: string): Promise<void> {
    await this.db.requirePool().query(
      `update event_outbox set published_at=now(), lease_owner=null, lease_expires_at=null
       where event_id=$1 and lease_owner=$2`, [eventId, workerId],
    );
  }

  async markPublishedDirect(eventId: string): Promise<void> {
    await this.db.requirePool().query(
      `update event_outbox set published_at=coalesce(published_at,now()), lease_owner=null, lease_expires_at=null where event_id=$1`,
      [eventId],
    );
  }

  async retry(eventId: string, workerId: string, errorCode: string, delaySeconds: number): Promise<void> {
    await this.db.requirePool().query(
      `update event_outbox set last_error_code=$3, available_at=now()+make_interval(secs => $4),
       lease_owner=null, lease_expires_at=null where event_id=$1 and lease_owner=$2`,
      [eventId, workerId, errorCode, delaySeconds],
    );
  }

  private map(row: any): DurableEventRecord {
    return { eventId: row.event_id, guildId: row.guild_id ?? undefined, eventType: row.event_type, schemaVersion: row.schema_version,
      payload: row.payload ?? {}, correlationId: row.correlation_id, source: row.source ?? undefined, aggregateKey: row.aggregate_key ?? undefined, sequence: row.sequence_no === null || row.sequence_no === undefined ? undefined : Number(row.sequence_no), attempts: Number(row.attempts ?? 0) };
  }
}

export type BackupVerificationStatus = 'CAPTURED' | 'INTEGRITY_CHECKED' | 'RESTORE_VERIFIED' | 'INVALID' | 'LEGACY_UNPROVEN';
export interface BackupSnapshotRecord {
  backupId: string;
  guildId: string;
  kind: 'MANUAL' | 'SCHEDULED' | 'PRE_MIGRATION' | 'PRE_RESTORE';
  schemaVersion: number;
  contentHash: string;
  hashAlgorithm: string;
  status: BackupVerificationStatus;
  payload?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  integrityCheckedAt?: string;
  restoreVerifiedAt?: string;
  lastRestoreRunId?: string;
  createdAt: string;
}

export class BackupSnapshotRepository {
  constructor(private readonly db: Database) {}

  async create(input: Omit<BackupSnapshotRecord, 'createdAt' | 'integrityCheckedAt' | 'restoreVerifiedAt' | 'lastRestoreRunId'> & { createdBy?: string; storageProvider?: string; storagePath?: string }): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `insert into backup_snapshots(backup_id,guild_id,kind,schema_version,content_hash,hash_algorithm,storage_provider,storage_path,status,metadata,created_by,verified_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null)`,
        [input.backupId, input.guildId, input.kind, input.schemaVersion, input.contentHash, input.hashAlgorithm, input.storageProvider ?? 'database', input.storagePath ?? `db://${input.backupId}`, input.status, input.metadata, input.createdBy ?? null],
      );
      if (input.payload) {
        await client.query(
          `insert into backup_payloads(backup_id,guild_id,payload,payload_hash,hash_algorithm,encrypted) values($1,$2,$3,$4,$5,false)`,
          [input.backupId, input.guildId, input.payload, input.contentHash, input.hashAlgorithm],
        );
      }
    });
  }

  async recordIntegrityCheck(input: { guildId:string; backupId:string; outcome:'PASS'|'FAIL'; contentHash:string; hashAlgorithm:string; report?:Record<string,unknown>; correlationId?:string }): Promise<boolean> {
    return this.db.transaction(async(client)=>{
      const row=(await client.query<any>(`select status,content_hash,hash_algorithm from backup_snapshots where guild_id=$1 and backup_id=$2 for update`,[input.guildId,input.backupId])).rows[0];
      if(!row) throw new Error('BACKUP_NOT_FOUND');
      const pass=input.outcome==='PASS' && row.content_hash===input.contentHash && row.hash_algorithm===input.hashAlgorithm;
      await client.query(
        `update backup_snapshots set status=case when $3 then 'INTEGRITY_CHECKED' else 'INVALID' end,integrity_checked_at=case when $3 then now() else integrity_checked_at end where guild_id=$1 and backup_id=$2`,
        [input.guildId,input.backupId,pass],
      );
      await client.query(
        `insert into backup_verification_evidence(evidence_id,guild_id,backup_id,evidence_type,outcome,content_hash,hash_algorithm,report,correlation_id)
         values($1,$2,$3,'INTEGRITY_CHECK',$4,$5,$6,$7,$8)`,
        [randomUUID(),input.guildId,input.backupId,pass?'PASS':'FAIL',input.contentHash,input.hashAlgorithm,input.report ?? {},input.correlationId ?? null],
      );
      return pass;
    });
  }

  async markRestoreVerified(input: { guildId:string; backupId:string; restoreRunId:string; contentHash:string; hashAlgorithm:string; correlationId?:string; report?:Record<string,unknown> }): Promise<void> {
    await this.db.transaction(async(client)=>{
      const row=(await client.query<any>(`select s.status,s.content_hash,s.hash_algorithm,r.state as restore_state,r.backup_id as restore_backup_id from backup_snapshots s join restore_runs r on r.restore_run_id=$3 and r.guild_id=s.guild_id where s.guild_id=$1 and s.backup_id=$2 for update of s`,[input.guildId,input.backupId,input.restoreRunId])).rows[0];
      if(!row) throw new Error('BACKUP_OR_RESTORE_RUN_NOT_FOUND');
      if(row.restore_state!=='SUCCEEDED'||row.restore_backup_id!==input.backupId) throw new Error(`RESTORE_RUN_NOT_VERIFIED:${row.restore_state}`);
      if(!['INTEGRITY_CHECKED','RESTORE_VERIFIED'].includes(row.status)) throw new Error(`BACKUP_NOT_RESTORE_VERIFIABLE:${row.status}`);
      if(row.content_hash!==input.contentHash || row.hash_algorithm!==input.hashAlgorithm) throw new Error('BACKUP_RESTORE_VERIFICATION_HASH_MISMATCH');
      await client.query(
        `update backup_snapshots set status='RESTORE_VERIFIED',restore_verified_at=now(),verified_at=now(),last_restore_run_id=$3 where guild_id=$1 and backup_id=$2`,
        [input.guildId,input.backupId,input.restoreRunId],
      );
      await client.query(
        `insert into backup_verification_evidence(evidence_id,guild_id,backup_id,evidence_type,outcome,restore_run_id,content_hash,hash_algorithm,report,correlation_id)
         values($1,$2,$3,'RESTORE_VERIFY','PASS',$4,$5,$6,$7,$8)
         on conflict (backup_id,restore_run_id,evidence_type) where restore_run_id is not null do nothing`,
        [randomUUID(),input.guildId,input.backupId,input.restoreRunId,input.contentHash,input.hashAlgorithm,input.report ?? {},input.correlationId ?? null],
      );
    });
  }

  async get(guildId: string, backupId: string): Promise<BackupSnapshotRecord | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `select s.*,p.payload from backup_snapshots s left join backup_payloads p using(backup_id)
       where s.guild_id=$1 and s.backup_id=$2`, [guildId, backupId],
    );
    const row = rows[0];
    if (!row) return null;
    return { backupId: row.backup_id, guildId: row.guild_id, kind: row.kind, schemaVersion: row.schema_version,
      contentHash: row.content_hash, hashAlgorithm: row.hash_algorithm, status: row.status, payload: row.payload ?? undefined, metadata: row.metadata ?? {},
      integrityCheckedAt: row.integrity_checked_at ? (row.integrity_checked_at instanceof Date ? row.integrity_checked_at.toISOString() : String(row.integrity_checked_at)) : undefined,
      restoreVerifiedAt: row.restore_verified_at ? (row.restore_verified_at instanceof Date ? row.restore_verified_at.toISOString() : String(row.restore_verified_at)) : undefined,
      lastRestoreRunId: row.last_restore_run_id ?? undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) };
  }

  async list(guildId: string, limit = 25): Promise<BackupSnapshotRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const { rows } = await this.db.requirePool().query<any>(
      `select s.*,p.payload from backup_snapshots s left join backup_payloads p using(backup_id)
       where s.guild_id=$1 order by s.created_at desc limit $2`, [guildId, safeLimit],
    );
    return rows.map((row) => ({ backupId: row.backup_id, guildId: row.guild_id, kind: row.kind, schemaVersion: row.schema_version,
      contentHash: row.content_hash, hashAlgorithm: row.hash_algorithm, status: row.status, payload: row.payload ?? undefined, metadata: row.metadata ?? {},
      integrityCheckedAt: row.integrity_checked_at ? (row.integrity_checked_at instanceof Date ? row.integrity_checked_at.toISOString() : String(row.integrity_checked_at)) : undefined,
      restoreVerifiedAt: row.restore_verified_at ? (row.restore_verified_at instanceof Date ? row.restore_verified_at.toISOString() : String(row.restore_verified_at)) : undefined,
      lastRestoreRunId: row.last_restore_run_id ?? undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) }));
  }

  async pruneScheduled(guildId: string, keep: number): Promise<number> {
    const safeKeep = Math.max(1, Math.min(100, Math.trunc(keep)));
    const result = await this.db.requirePool().query(
      `delete from backup_snapshots
       where backup_id in (
         select backup_id from backup_snapshots
         where guild_id=$1 and kind='SCHEDULED'
         order by created_at desc
         offset $2
       )`,
      [guildId, safeKeep],
    );
    return result.rowCount ?? 0;
  }
}
export interface RestoreRunRecord {
  restoreRunId: string;
  guildId: string;
  backupId: string;
  state: 'PLANNED' | 'WAITING_APPROVAL' | 'RUNNING' | 'VERIFYING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK';
  plan: Record<string, unknown>;
  result?: Record<string, unknown>;
  requestedBy: string;
  approvalRequestId?: string;
  correlationId: string;
  createdAt: string;
}

export class RestoreRunRepository {
  constructor(private readonly db: Database) {}

  async create(input: Omit<RestoreRunRecord, 'createdAt' | 'result'>): Promise<RestoreRunRecord> {
    const { rows } = await this.db.requirePool().query<any>(
      `insert into restore_runs(restore_run_id,guild_id,backup_id,state,plan,requested_by,approval_request_id,correlation_id)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       returning *`,
      [input.restoreRunId,input.guildId,input.backupId,input.state,input.plan,input.requestedBy,input.approvalRequestId ?? null,input.correlationId],
    );
    return this.map(rows[0]);
  }

  async get(guildId: string, restoreRunId: string): Promise<RestoreRunRecord | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `select * from restore_runs where guild_id=$1 and restore_run_id=$2`, [guildId, restoreRunId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async setApproval(guildId: string, restoreRunId: string, approvalRequestId: string): Promise<void> {
    const result = await this.db.requirePool().query(
      `update restore_runs set approval_request_id=$3,state='WAITING_APPROVAL',updated_at=now() where guild_id=$1 and restore_run_id=$2 and state='PLANNED'`,
      [guildId,restoreRunId,approvalRequestId],
    );
    if (!result.rowCount) throw new Error('RESTORE_RUN_NOT_PLANNED');
  }

  async setState(guildId: string, restoreRunId: string, state: RestoreRunRecord['state'], result?: Record<string, unknown>): Promise<void> {
    const updated = await this.db.requirePool().query(
      `update restore_runs set state=$3,result=coalesce($4,result),updated_at=now() where guild_id=$1 and restore_run_id=$2`,
      [guildId,restoreRunId,state,result ?? null],
    );
    if (!updated.rowCount) throw new Error('RESTORE_RUN_NOT_FOUND');
  }

  private map(row: any): RestoreRunRecord {
    return {
      restoreRunId: row.restore_run_id,
      guildId: row.guild_id,
      backupId: row.backup_id,
      state: row.state,
      plan: row.plan ?? {},
      result: row.result ?? undefined,
      requestedBy: row.requested_by,
      approvalRequestId: row.approval_request_id ?? undefined,
      correlationId: row.correlation_id,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}


export interface ApprovalRecord {
  approvalId: string;
  guildId: string;
  operationKey: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  state: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED';
  requestedBy: string;
  requiredApprovals: number;
  approvedBy: string[];
  payload: Record<string, unknown>;
  correlationId: string;
  expiresAt?: Date;
}

export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  async create(input: Omit<ApprovalRecord, 'state' | 'approvedBy'> & { state?: ApprovalRecord['state'] }): Promise<ApprovalRecord> {
    await this.db.requirePool().query(
      `insert into approval_requests(approval_id,guild_id,operation_key,risk,state,requested_by,required_approvals,approved_by,payload,correlation_id,expires_at)
       values($1,$2,$3,$4,$5,$6,$7,'{}',$8,$9,$10)`,
      [input.approvalId,input.guildId,input.operationKey,input.risk,input.state ?? 'PENDING',input.requestedBy,input.requiredApprovals,input.payload,input.correlationId,input.expiresAt ?? null],
    );
    return { ...input, state: input.state ?? 'PENDING', approvedBy: [] };
  }

  async get(guildId: string, approvalId: string): Promise<ApprovalRecord | null> {
    const row=(await this.db.requirePool().query<any>(`select * from approval_requests where guild_id=$1 and approval_id=$2`,[guildId,approvalId])).rows[0];
    return row ? this.map(row) : null;
  }

  async approve(guildId: string, approvalId: string, actorId: string): Promise<ApprovalRecord> {
    return this.db.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from approval_requests where guild_id=$1 and approval_id=$2 for update`,[guildId,approvalId])).rows[0];
      if(!row) throw new Error('APPROVAL_NOT_FOUND');
      if(row.expires_at && new Date(row.expires_at).getTime()<=Date.now()) {
        await client.query(`update approval_requests set state='EXPIRED',updated_at=now() where approval_id=$1`,[approvalId]);
        throw new Error('APPROVAL_EXPIRED');
      }
      if(!['DRAFT','PENDING'].includes(row.state)) throw new Error(`APPROVAL_NOT_PENDING:${row.state}`);
      if(['HIGH','CRITICAL'].includes(row.risk) && row.requested_by===actorId) throw new Error('SECOND_OPERATOR_REQUIRED');
      const approvedBy=[...new Set([...(row.approved_by ?? []),actorId])];
      const state=approvedBy.length>=Number(row.required_approvals) ? 'APPROVED':'PENDING';
      await client.query(`update approval_requests set approved_by=$2,state=$3,updated_at=now() where approval_id=$1`,[approvalId,approvedBy,state]);
      return this.map({...row,approved_by:approvedBy,state});
    });
  }

  async markExecuted(guildId: string, approvalId: string): Promise<void> {
    const result=await this.db.requirePool().query(`update approval_requests set state='EXECUTED',updated_at=now() where guild_id=$1 and approval_id=$2 and state='APPROVED'`,[guildId,approvalId]);
    if(!result.rowCount) throw new Error('APPROVAL_NOT_EXECUTABLE');
  }

  private map(row:any): ApprovalRecord {
    return { approvalId:row.approval_id,guildId:row.guild_id,operationKey:row.operation_key,risk:row.risk,state:row.state,requestedBy:row.requested_by,requiredApprovals:Number(row.required_approvals),approvedBy:row.approved_by ?? [],payload:row.payload ?? {},correlationId:row.correlation_id,expiresAt:row.expires_at ? new Date(row.expires_at):undefined };
  }
}

export interface PluginInstallationRecord {
  guildId: string;
  pluginKey: string;
  version: string;
  state: string;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  installedBy?: string;
  executionMode: 'IN_PROCESS' | 'EXTERNAL_PROCESS';
  trustLevel: 'BUILTIN' | 'TRUSTED_EXTERNAL' | 'THIRD_PARTY';
  entrypointPath?: string;
  enabled: boolean;
  updatedAt: string;
}

export class PluginInstallationRepository {
  constructor(private readonly db: Database) {}

  async list(guildId: string): Promise<PluginInstallationRecord[]> {
    const { rows } = await this.db.requirePool().query<any>(
      `select guild_id,plugin_key,version,state,manifest,config,installed_by,execution_mode,trust_level,entrypoint_path,enabled,updated_at
       from plugin_installations where guild_id=$1 order by plugin_key`, [guildId],
    );
    return rows.map((row) => ({ guildId:row.guild_id, pluginKey:row.plugin_key, version:row.version, state:row.state, manifest:row.manifest ?? {}, config:row.config ?? {}, installedBy:row.installed_by ?? undefined,
      executionMode:row.execution_mode, trustLevel:row.trust_level, entrypointPath:row.entrypoint_path ?? undefined, enabled:Boolean(row.enabled), updatedAt:new Date(row.updated_at).toISOString() }));
  }

  async get(guildId: string, pluginKey: string): Promise<PluginInstallationRecord | null> {
    const items = await this.list(guildId);
    return items.find((item) => item.pluginKey === pluginKey) ?? null;
  }

  async upsert(input: Omit<PluginInstallationRecord,'updatedAt'>): Promise<void> {
    await this.db.requirePool().query(
      `insert into plugin_installations(guild_id,plugin_key,version,state,manifest,config,installed_by,execution_mode,trust_level,entrypoint_path,enabled)
       values($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
       on conflict(guild_id,plugin_key) do update set version=excluded.version,state=excluded.state,manifest=excluded.manifest,config=excluded.config,
       installed_by=coalesce(excluded.installed_by,plugin_installations.installed_by),execution_mode=excluded.execution_mode,trust_level=excluded.trust_level,
       entrypoint_path=excluded.entrypoint_path,enabled=excluded.enabled,updated_at=now()`,
      [input.guildId,input.pluginKey,input.version,input.state,JSON.stringify(input.manifest),JSON.stringify(input.config),input.installedBy ?? null,input.executionMode,input.trustLevel,input.entrypointPath ?? null,input.enabled],
    );
  }

  async setState(guildId: string, pluginKey: string, state: string): Promise<boolean> {
    const result = await this.db.requirePool().query('update plugin_installations set state=$3,updated_at=now() where guild_id=$1 and plugin_key=$2',[guildId,pluginKey,state]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PluginExecutionRunRepository {
  constructor(private readonly db: Database) {}
  async start(input:{runId:string;guildId:string;pluginKey:string;action:string;requestId:string;correlationId:string}):Promise<void>{
    await this.db.requirePool().query(`insert into plugin_execution_runs(run_id,guild_id,plugin_key,action,request_id,status,correlation_id) values($1,$2,$3,$4,$5,'RUNNING',$6)`,[input.runId,input.guildId,input.pluginKey,input.action,input.requestId,input.correlationId]);
  }
  async finish(input:{runId:string;status:'SUCCEEDED'|'FAILED'|'TIMED_OUT'|'REJECTED';durationMs:number;errorCode?:string;errorMessage?:string;isolationProfile?:'TRUSTED_NODE_PERMISSION'|'LINUX_NS_SECCOMP_V1'}):Promise<void>{
    await this.db.requirePool().query('update plugin_execution_runs set status=$2,duration_ms=$3,error_code=$4,error_message=$5,isolation_profile=$6,finished_at=now() where run_id=$1',[input.runId,input.status,input.durationMs,input.errorCode??null,input.errorMessage?.slice(0,500)??null,input.isolationProfile??null]);
  }
}

export interface OrderedEventIdentity {
  guildId?: string;
  source: string;
  aggregateKey: string;
  sequence: number;
  eventId: string;
}
export interface OrderedEventDecision { accepted: boolean; duplicate: boolean; stale: boolean; previousSequence?: number; }
export class EventOrderingRepository {
  constructor(private readonly db: Database) {}
  async accept(input: OrderedEventIdentity): Promise<OrderedEventDecision> {
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) throw new Error('EVENT_SEQUENCE_INVALID');
    return this.db.transaction(async (client) => {
      const guildId=input.guildId ?? '';
      const row=(await client.query<any>(`select last_sequence,last_event_id from event_stream_heads where guild_id=$1 and source=$2 and aggregate_key=$3 for update`,[guildId,input.source,input.aggregateKey])).rows[0];
      if (row) {
        const decision=decideEventSequence({sequence:Number(row.last_sequence),eventId:String(row.last_event_id)},{sequence:input.sequence,eventId:input.eventId});
        if (!decision.accepted) return decision;
        await client.query(`update event_stream_heads set last_sequence=$4,last_event_id=$5,updated_at=now() where guild_id=$1 and source=$2 and aggregate_key=$3`,[guildId,input.source,input.aggregateKey,input.sequence,input.eventId]);
        return decision;
      }
      const decision=decideEventSequence(null,{sequence:input.sequence,eventId:input.eventId});
      await client.query(`insert into event_stream_heads(guild_id,source,aggregate_key,last_sequence,last_event_id) values($1,$2,$3,$4,$5)`,[guildId,input.source,input.aggregateKey,input.sequence,input.eventId]);
      return decision;
    });
  }
}

export interface MaintenanceWindowRecord {
  maintenanceId: string;
  guildId: string;
  state: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  reason?: string;
  startsAt: Date;
  endsAt?: Date;
  automationPolicy: Record<string, unknown>;
  createdBy: string;
  correlationId: string;
}
export class MaintenanceWindowRepository {
  constructor(private readonly db: Database) {}
  async create(input: MaintenanceWindowRecord): Promise<void> {
    await this.db.transaction(async(client)=>{
      await client.query(`insert into maintenance_windows(maintenance_id,guild_id,state,reason,starts_at,ends_at,automation_policy,created_by,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[input.maintenanceId,input.guildId,input.state,input.reason??null,input.startsAt,input.endsAt??null,input.automationPolicy,input.createdBy,input.correlationId]);
      await client.query(`insert into maintenance_events(maintenance_event_id,maintenance_id,guild_id,event_type,actor_id,payload,correlation_id) values($1,$2,$3,'CREATED',$4,$5,$6)`,[randomUUID(),input.maintenanceId,input.guildId,input.createdBy,{state:input.state,startsAt:input.startsAt.toISOString(),endsAt:input.endsAt?.toISOString(),reason:input.reason},input.correlationId]);
    });
  }
  async get(guildId:string,maintenanceId:string):Promise<MaintenanceWindowRecord|null>{const row=(await this.db.requirePool().query<any>(`select * from maintenance_windows where guild_id=$1 and maintenance_id=$2`,[guildId,maintenanceId])).rows[0];return row?this.map(row):null;}
  async current(guildId:string,at=new Date()):Promise<MaintenanceWindowRecord|null>{
    const row=(await this.db.requirePool().query<any>(`select * from maintenance_windows where guild_id=$1 and state in ('SCHEDULED','ACTIVE') and starts_at<=$2 and (ends_at is null or ends_at>$2) order by starts_at desc limit 1`,[guildId,at])).rows[0];
    return row?this.map(row):null;
  }
  async list(guildId:string,limit=25):Promise<MaintenanceWindowRecord[]>{const {rows}=await this.db.requirePool().query<any>(`select * from maintenance_windows where guild_id=$1 order by starts_at desc limit $2`,[guildId,Math.max(1,Math.min(100,limit))]);return rows.map((row)=>this.map(row));}
  async transition(guildId:string,maintenanceId:string,state:'ACTIVE'|'COMPLETED'|'CANCELLED',actorId:string,correlationId:string):Promise<MaintenanceWindowRecord>{
    return this.db.transaction(async(client)=>{const row=(await client.query<any>(`select * from maintenance_windows where guild_id=$1 and maintenance_id=$2 for update`,[guildId,maintenanceId])).rows[0];if(!row)throw new Error('MAINTENANCE_NOT_FOUND');
      const allowed:Record<string,string[]>={SCHEDULED:['ACTIVE','CANCELLED'],ACTIVE:['COMPLETED','CANCELLED'],COMPLETED:[],CANCELLED:[]}; if(!(allowed[String(row.state)]??[]).includes(state))throw new Error(`MAINTENANCE_TRANSITION_INVALID:${row.state}->${state}`);
      const updated=(await client.query<any>(`update maintenance_windows set state=$3,updated_at=now() where guild_id=$1 and maintenance_id=$2 returning *`,[guildId,maintenanceId,state])).rows[0];
      await client.query(`insert into maintenance_events(maintenance_event_id,maintenance_id,guild_id,event_type,actor_id,payload,correlation_id) values($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),maintenanceId,guildId,state==='ACTIVE'?'ACTIVATED':state,actorId,{from:row.state,to:state},correlationId]);return this.map(updated);});
  }
  private map(row:any):MaintenanceWindowRecord{return{maintenanceId:String(row.maintenance_id),guildId:String(row.guild_id),state:row.state,reason:row.reason??undefined,startsAt:new Date(row.starts_at),endsAt:row.ends_at?new Date(row.ends_at):undefined,automationPolicy:row.automation_policy??{},createdBy:String(row.created_by),correlationId:String(row.correlation_id)}}
}

export class GeneratedDocumentRepository {
  constructor(private readonly db: Database) {}
  async store(input:{documentId:string;guildId?:string;documentType:string;contentHash:string;content:string;generatedBy?:string;metadata?:Record<string,unknown>}):Promise<void>{await this.db.requirePool().query(`insert into generated_document_snapshots(document_id,guild_id,document_type,content_hash,content,generated_by,metadata) values($1,$2,$3,$4,$5,$6,$7)`,[input.documentId,input.guildId??null,input.documentType,input.contentHash,input.content,input.generatedBy??null,input.metadata??{}]);}
}

export class GrowthAssessmentRepository {
  constructor(private readonly db: Database) {}
  async store(input:{assessmentId:string;guildId:string;mode:'SMALL'|'STANDARD'|'LARGE'|'ENTERPRISE';score:number;signals:Record<string,unknown>;recommendations:string[]}):Promise<void>{await this.db.requirePool().query(`insert into growth_assessments(assessment_id,guild_id,mode,score,signals,recommendations) values($1,$2,$3,$4,$5,$6)`,[input.assessmentId,input.guildId,input.mode,input.score,input.signals,input.recommendations]);}
  async latest(guildId:string):Promise<Record<string,unknown>|null>{return (await this.db.requirePool().query<any>(`select assessment_id,mode,score,signals,recommendations,created_at from growth_assessments where guild_id=$1 order by created_at desc limit 1`,[guildId])).rows[0]??null;}
}

export type PanelLiveState = 'IDLE'|'ACTIVE'|'READY'|'LIVE'|'SUCCESS'|'WATCH'|'DEGRADED'|'INCIDENT'|'MAINTENANCE'|'SYNCING'|'RECOVERY';
export interface PanelLiveStateRecord {
  guildId:string;
  panelId:string;
  state:PanelLiveState;
  stateHash:string;
  reason:string;
  lastEventId?:string;
  lastEventType?:string;
  revision:number;
  changedAt:Date;
  expiresAt?:Date;
  lastRenderedAt?:Date;
  minUpdateAfter?:Date;
  metadata:Record<string,unknown>;
}
export interface PanelLiveStateTransition {
  guildId:string;
  panelId:string;
  eventId:string;
  eventType:string;
  correlationId?:string;
  state:PanelLiveState;
  stateHash:string;
  reason:string;
  expiresAt?:Date;
  metadata?:Record<string,unknown>;
}
export class PanelLiveStateRepository {
  constructor(private readonly db:Database){}
  async get(guildId:string,panelId:string):Promise<PanelLiveStateRecord|null>{
    const row=(await this.db.requirePool().query<any>(`select * from panel_live_states where guild_id=$1 and panel_id=$2`,[guildId,panelId])).rows[0];
    return row?this.map(row):null;
  }
  async list(guildId:string):Promise<PanelLiveStateRecord[]>{
    const {rows}=await this.db.requirePool().query<any>(`select * from panel_live_states where guild_id=$1 order by panel_id`,[guildId]);
    return rows.map((row)=>this.map(row));
  }
  async listPending(limit=500):Promise<PanelLiveStateRecord[]>{
    const {rows}=await this.db.requirePool().query<any>(`select * from panel_live_states where state<>'IDLE' or expires_at is not null order by changed_at desc limit $1`,[Math.max(1,Math.min(2000,limit))]);
    return rows.map((row)=>this.map(row));
  }
  async applyTransition(input:PanelLiveStateTransition):Promise<{applied:boolean;record:PanelLiveStateRecord}>{
    return this.db.transaction(async(client)=>{
      const inserted=await client.query(`insert into panel_live_state_events(guild_id,panel_id,event_id,event_type,target_state,reason,correlation_id,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(guild_id,panel_id,event_id) do nothing returning event_id`,[input.guildId,input.panelId,input.eventId,input.eventType,input.state,input.reason,input.correlationId??null,input.metadata??{}]);
      if(!inserted.rowCount){
        const existing=(await client.query<any>(`select * from panel_live_states where guild_id=$1 and panel_id=$2`,[input.guildId,input.panelId])).rows[0];
        if(!existing) throw new Error('PANEL_LIVE_STATE_DEDUP_WITHOUT_STATE');
        return{applied:false,record:this.map(existing)};
      }
      const row=(await client.query<any>(`insert into panel_live_states(guild_id,panel_id,state,state_hash,reason,last_event_id,last_event_type,revision,changed_at,expires_at,metadata)
        values($1,$2,$3,$4,$5,$6,$7,1,now(),$8,$9)
        on conflict(guild_id,panel_id) do update set state=excluded.state,state_hash=excluded.state_hash,reason=excluded.reason,last_event_id=excluded.last_event_id,last_event_type=excluded.last_event_type,revision=panel_live_states.revision+1,changed_at=now(),expires_at=excluded.expires_at,metadata=excluded.metadata
        returning *`,[input.guildId,input.panelId,input.state,input.stateHash,input.reason,input.eventId,input.eventType,input.expiresAt??null,input.metadata??{}])).rows[0];
      return{applied:true,record:this.map(row)};
    });
  }
  async expire(guildId:string,panelId:string,stateHash:string,at=new Date()):Promise<PanelLiveStateRecord|null>{
    if(!/^[a-f0-9]{64}$/i.test(stateHash)) throw new Error('PANEL_LIVE_STATE_HASH_INVALID');
    const {rows}=await this.db.requirePool().query<any>(`update panel_live_states set state='IDLE',reason='Event state expired',state_hash=$4,revision=revision+1,changed_at=$3,expires_at=null,min_update_after=null where guild_id=$1 and panel_id=$2 and expires_at is not null and expires_at<=$3 returning *`,[guildId,panelId,at,stateHash]);
    return rows[0]?this.map(rows[0]):null;
  }
  async markRendered(guildId:string,panelId:string,renderedAt=new Date(),minimumIntervalMs=15_000):Promise<void>{
    await this.db.requirePool().query(`update panel_live_states set last_rendered_at=$3,min_update_after=$3 + ($4::text || ' milliseconds')::interval where guild_id=$1 and panel_id=$2`,[guildId,panelId,renderedAt,Math.max(1000,Math.min(300000,Math.round(minimumIntervalMs)))]);
  }
  private map(row:any):PanelLiveStateRecord{return{guildId:String(row.guild_id),panelId:String(row.panel_id),state:row.state,stateHash:String(row.state_hash),reason:String(row.reason),lastEventId:row.last_event_id??undefined,lastEventType:row.last_event_type??undefined,revision:Number(row.revision),changedAt:new Date(row.changed_at),expiresAt:row.expires_at?new Date(row.expires_at):undefined,lastRenderedAt:row.last_rendered_at?new Date(row.last_rendered_at):undefined,minUpdateAfter:row.min_update_after?new Date(row.min_update_after):undefined,metadata:row.metadata??{}}}
}
