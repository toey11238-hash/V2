import type { Database } from '@autoserver/database';

export interface CacheEntry<T = unknown> {
  scopeKey: string;
  cacheKey: string;
  value: T;
  version: number;
  expiresAt: string;
  updatedAt: string;
}

export interface CacheBackend {
  get<T = unknown>(scopeKey: string, cacheKey: string): Promise<CacheEntry<T> | null>;
  set<T = unknown>(input: { scopeKey: string; cacheKey: string; value: T; ttlMs: number; version?: number }): Promise<CacheEntry<T>>;
  delete(scopeKey: string, cacheKey: string): Promise<void>;
  invalidatePrefix(scopeKey: string, prefix: string): Promise<number>;
}

export class InProcessTtlCache implements CacheBackend {
  private readonly entries = new Map<string, CacheEntry>();
  private evictions = 0;
  constructor(private readonly maxEntries = 5_000) { if(!Number.isInteger(maxEntries)||maxEntries<10||maxEntries>100_000) throw new Error('CACHE_MAX_ENTRIES_INVALID'); }
  private key(scopeKey: string, cacheKey: string): string { return `${scopeKey}\u0000${cacheKey}`; }
  private pruneExpired(now=Date.now()):void{ for(const [key,value] of this.entries){if(Date.parse(value.expiresAt)<=now)this.entries.delete(key);} }
  private enforceBound():void{ while(this.entries.size>this.maxEntries){const oldest=this.entries.keys().next().value as string|undefined;if(!oldest)break;this.entries.delete(oldest);this.evictions+=1;} }
  async get<T = unknown>(scopeKey: string, cacheKey: string): Promise<CacheEntry<T> | null> {
    const key = this.key(scopeKey, cacheKey); const found = this.entries.get(key);
    if (!found) return null;
    if (Date.parse(found.expiresAt) <= Date.now()) { this.entries.delete(key); return null; }
    this.entries.delete(key);this.entries.set(key,found);
    return found as CacheEntry<T>;
  }
  async set<T = unknown>(input: { scopeKey: string; cacheKey: string; value: T; ttlMs: number; version?: number }): Promise<CacheEntry<T>> {
    const now = new Date(); const ttlMs=Math.max(1,Math.min(86_400_000,input.ttlMs));
    const entry: CacheEntry<T> = { scopeKey: input.scopeKey, cacheKey: input.cacheKey, value: input.value, version: input.version ?? 1, expiresAt: new Date(now.getTime() + ttlMs).toISOString(), updatedAt: now.toISOString() };
    const key=this.key(input.scopeKey,input.cacheKey);this.entries.delete(key);this.entries.set(key,entry as CacheEntry);this.pruneExpired(now.getTime());this.enforceBound();return entry;
  }
  async delete(scopeKey: string, cacheKey: string): Promise<void> { this.entries.delete(this.key(scopeKey, cacheKey)); }
  async invalidatePrefix(scopeKey: string, prefix: string): Promise<number> { let count = 0; for (const [key, value] of this.entries) if (value.scopeKey === scopeKey && value.cacheKey.startsWith(prefix)) { this.entries.delete(key); count += 1; } return count; }
  stats(){this.pruneExpired();return {entries:this.entries.size,maxEntries:this.maxEntries,evictions:this.evictions};}
}

export class SharedDatabaseCache implements CacheBackend {
  constructor(private readonly database: Database) {}
  async get<T = unknown>(scopeKey: string, cacheKey: string): Promise<CacheEntry<T> | null> {
    const { rows } = await this.database.requirePool().query<any>(`select scope_key,cache_key,value,version,expires_at,updated_at from platform_cache_entries where scope_key=$1 and cache_key=$2 and expires_at>now()`, [scopeKey, cacheKey]);
    const row = rows[0]; if (!row) return null;
    return { scopeKey: row.scope_key, cacheKey: row.cache_key, value: row.value as T, version: Number(row.version), expiresAt: new Date(row.expires_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
  }
  async set<T = unknown>(input: { scopeKey: string; cacheKey: string; value: T; ttlMs: number; version?: number }): Promise<CacheEntry<T>> {
    const ttlMs = Math.max(1, Math.min(86_400_000, input.ttlMs));
    const { rows } = await this.database.requirePool().query<any>(`insert into platform_cache_entries(scope_key,cache_key,value,version,expires_at) values($1,$2,$3,$4,now()+($5::text||' milliseconds')::interval) on conflict(scope_key,cache_key) do update set value=excluded.value,version=excluded.version,expires_at=excluded.expires_at,updated_at=now() returning *`, [input.scopeKey, input.cacheKey, input.value, input.version ?? 1, ttlMs]);
    const row = rows[0]; return { scopeKey: row.scope_key, cacheKey: row.cache_key, value: row.value as T, version: Number(row.version), expiresAt: new Date(row.expires_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
  }
  async delete(scopeKey: string, cacheKey: string): Promise<void> { await this.database.requirePool().query(`delete from platform_cache_entries where scope_key=$1 and cache_key=$2`, [scopeKey, cacheKey]); }
  async invalidatePrefix(scopeKey: string, prefix: string): Promise<number> { const result = await this.database.requirePool().query(`delete from platform_cache_entries where scope_key=$1 and cache_key like $2 escape '\\'`, [scopeKey, `${prefix.replace(/[\\%_]/g, (value) => `\\${value}`)}%`]); return result.rowCount ?? 0; }
  async prune(limit = 1000): Promise<number> { const result = await this.database.requirePool().query(`delete from platform_cache_entries where ctid in (select ctid from platform_cache_entries where expires_at<=now() limit $1)`, [Math.max(1, Math.min(10_000, limit))]); return result.rowCount ?? 0; }
}

export class LayeredCache {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  constructor(private readonly l1: CacheBackend, private readonly l2?: CacheBackend, private readonly maxInFlight=1_000) { if(!Number.isInteger(maxInFlight)||maxInFlight<1||maxInFlight>10_000)throw new Error('CACHE_MAX_INFLIGHT_INVALID'); }
  async get<T>(scopeKey: string, cacheKey: string): Promise<T | null> {
    const local = await this.l1.get<T>(scopeKey, cacheKey); if (local) return local.value;
    const shared = await this.l2?.get<T>(scopeKey, cacheKey); if (!shared) return null;
    const ttlMs = Math.max(1, Date.parse(shared.expiresAt) - Date.now()); await this.l1.set({ scopeKey, cacheKey, value: shared.value, ttlMs, version: shared.version }); return shared.value;
  }
  async getOrLoad<T>(scopeKey: string, cacheKey: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(scopeKey, cacheKey); if (cached !== null) return cached;
    const flightKey = `${scopeKey}\u0000${cacheKey}`; const existing = this.inFlight.get(flightKey); if (existing) return existing as Promise<T>;
    if(this.inFlight.size>=this.maxInFlight)throw new Error('CACHE_INFLIGHT_LIMIT');
    const promise = (async () => { const value = await loader(); await this.l2?.set({ scopeKey, cacheKey, value, ttlMs }); await this.l1.set({ scopeKey, cacheKey, value, ttlMs }); return value; })().finally(() => this.inFlight.delete(flightKey));
    this.inFlight.set(flightKey, promise); return promise;
  }
  async invalidate(scopeKey: string, cacheKey: string): Promise<void> { await Promise.all([this.l1.delete(scopeKey, cacheKey), this.l2?.delete(scopeKey, cacheKey)]); }
  async invalidatePrefix(scopeKey: string, prefix: string): Promise<number> { const [local, shared] = await Promise.all([this.l1.invalidatePrefix(scopeKey, prefix), this.l2?.invalidatePrefix(scopeKey, prefix)]); return Math.max(local, shared ?? 0); }
  stats(){return {inFlight:this.inFlight.size,maxInFlight:this.maxInFlight};}
}
