import type { Database } from '@autoserver/database';
import { createRiotDataDragonAdapter } from './providers/riot-data-dragon.ts';
import { createGitHubReleasesAdapter } from './providers/github-releases.ts';
import { createDiscordStatusAdapter } from './providers/discord-status.ts';
import { createSteamNewsAdapter } from './providers/steam-news.ts';

export interface IntegrationCapabilities { identity?: boolean; stats?: boolean; rank?: boolean; news?: boolean; status?: boolean; webhooks?: boolean; content?: boolean; assets?: boolean; gameCatalog?: boolean; releases?: boolean; }

export interface IntegrationConfigField { key:string; label:string; type:'text'|'select'|'boolean'; required?:boolean; maxLength?:number; options?:readonly string[]; }
export interface IntegrationAdapterContext { config:Readonly<Record<string,unknown>>; locale?:string; }
export interface IntegrationSyncResult { contentType:string; externalVersion?:string; itemCount:number; payload:Record<string,unknown>; detail:string; }
export interface IntegrationConfigDefinition { fields:readonly IntegrationConfigField[]; validate(input:Readonly<Record<string,unknown>>):Record<string,unknown>; }

export interface IntegrationWebhookEvent {
  eventType: string;
  payload: Record<string, unknown>;
  dedupKey?: string;
  aggregateKey?: string;
  sequence?: number;
}

export interface IntegrationWebhookBinding {
  signatureHeader: string;
  deliveryIdHeader: string;
  timestampHeader?: string;
  maxAgeSeconds?: number;
  verify(input: { rawBody: Uint8Array; signature: string; secret: string; timestamp?: string; headers: Readonly<Record<string, string | undefined>> }): boolean | Promise<boolean>;
  transform(input: { rawBody: Uint8Array; headers: Readonly<Record<string, string | undefined>> }): readonly IntegrationWebhookEvent[] | Promise<readonly IntegrationWebhookEvent[]>;
}

export interface IntegrationAdapter {
  key: string;
  capabilities: IntegrationCapabilities;
  config?: IntegrationConfigDefinition;
  health(context?: IntegrationAdapterContext): Promise<{ healthy: boolean; detail?: string }>;
  sync?(context: IntegrationAdapterContext): Promise<IntegrationSyncResult>;
  webhook?: IntegrationWebhookBinding;
}

export class IntegrationRegistry {
  private readonly adapters = new Map<string, IntegrationAdapter>();
  register(adapter: IntegrationAdapter): void {
    if (this.adapters.has(adapter.key)) throw new Error(`INTEGRATION_ALREADY_REGISTERED:${adapter.key}`);
    this.adapters.set(adapter.key, adapter);
  }
  get(key: string): IntegrationAdapter | undefined { return this.adapters.get(key); }
  list(): IntegrationAdapter[] { return [...this.adapters.values()]; }
}

export class ReplayGuard {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 5 * 60_000) {}
  accept(key: string, now = Date.now()): boolean {
    for (const [existing, expires] of this.seen) if (expires <= now) this.seen.delete(existing);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + this.ttlMs);
    return true;
  }
}

export type CircuitState='CLOSED'|'OPEN'|'HALF_OPEN';
export class CircuitBreaker{
  private failures=0; private openUntil=0; private probeInFlight=false;
  constructor(private readonly failureThreshold=5,private readonly openMs=30_000){}
  canAttempt(now=Date.now()):boolean{
    if(this.openUntil>now)return false;
    if(this.openUntil>0){if(this.probeInFlight)return false;this.openUntil=0;this.probeInFlight=true;return true;}
    return !this.probeInFlight;
  }
  success():void{this.reset();}
  failure(now=Date.now()):void{
    if(this.probeInFlight){this.failures=Math.max(this.failures,Math.max(1,this.failureThreshold));this.probeInFlight=false;this.openUntil=now+Math.max(1000,this.openMs);return;}
    this.failures+=1;if(this.failures>=Math.max(1,this.failureThreshold))this.openUntil=now+Math.max(1000,this.openMs);
  }
  snapshot(now=Date.now()):{state:CircuitState;failures:number;retryAt?:string}{
    if(this.openUntil>now)return {state:'OPEN',failures:this.failures,retryAt:new Date(this.openUntil).toISOString()};
    if(this.probeInFlight)return {state:'HALF_OPEN',failures:this.failures};
    return {state:'CLOSED',failures:this.failures};
  }
  private reset(){this.failures=0;this.openUntil=0;this.probeInFlight=false;}
}

import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface IntegrationEgressPolicy {
  allowedHosts: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowPrivateNetwork?: boolean;
}

function privateIp(address: string): boolean {
  if (address === '::1' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address);
  if (!m) return false;
  const a=Number(m[1]), b=Number(m[2]);
  return a===10 || a===127 || a===0 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===100&&b>=64&&b<=127);
}

async function assertSafeHost(hostname:string, policy:IntegrationEgressPolicy):Promise<void>{
  const normalized=hostname.toLowerCase().replace(/\.$/,'');
  const allowed=policy.allowedHosts.some((host)=>{const candidate=host.toLowerCase().replace(/^\*\./,'').replace(/\.$/,''); return normalized===candidate || (host.startsWith('*.') && normalized.endsWith(`.${candidate}`));});
  if(!allowed) throw new Error('INTEGRATION_EGRESS_HOST_DENIED');
  if(policy.allowPrivateNetwork) return;
  if(isIP(normalized) && privateIp(normalized)) throw new Error('INTEGRATION_PRIVATE_NETWORK_DENIED');
  if(isIP(normalized)) return;
  const [v4,v6]=await Promise.all([resolve4(normalized).catch(()=>[]),resolve6(normalized).catch(()=>[])]);
  if(!v4.length&&!v6.length) throw new Error('INTEGRATION_DNS_UNRESOLVED');
  if([...v4,...v6].some(privateIp)) throw new Error('INTEGRATION_PRIVATE_NETWORK_DENIED');
}

export class SafeIntegrationHttpClient {
  private readonly circuits=new Map<string,CircuitBreaker>();
  constructor(private readonly policy:IntegrationEgressPolicy) {}
  async json<T=unknown>(url:string, init:RequestInit={}):Promise<T>{
    const target=new URL(url); if(target.protocol!=='https:') throw new Error('INTEGRATION_HTTPS_REQUIRED');
    if(target.username||target.password) throw new Error('INTEGRATION_URL_CREDENTIALS_FORBIDDEN');
    await assertSafeHost(target.hostname,this.policy);
    const circuit=this.circuits.get(target.hostname)??new CircuitBreaker();this.circuits.set(target.hostname,circuit);if(!circuit.canAttempt())throw new Error('INTEGRATION_CIRCUIT_OPEN');
    const timeout=Math.max(250,Math.min(30_000,this.policy.timeoutMs??6_000));
    const maxBytes=Math.max(1024,Math.min(10_485_760,this.policy.maxResponseBytes??1_048_576));
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(target,{...init,redirect:'error',signal:controller.signal,headers:{accept:'application/json',...(init.headers??{})}});
      if(!response.ok) throw new Error(`INTEGRATION_HTTP_${response.status}`);
      const reader=response.body?.getReader(); if(!reader){const decoded=await response.json() as T;circuit.success();return decoded;}
      const chunks:Uint8Array[]=[]; let total=0;
      while(true){const {done,value}=await reader.read(); if(done)break; if(value){total+=value.byteLength;if(total>maxBytes){controller.abort();throw new Error('INTEGRATION_RESPONSE_TOO_LARGE');}chunks.push(value);}}
      const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
      const decoded=JSON.parse(new TextDecoder().decode(merged)) as T;circuit.success();return decoded;
    } catch(error){circuit.failure();throw error;} finally { clearTimeout(timer); }
  }
}

export class HmacWebhookVerifier {
  constructor(private readonly secret:string,private readonly algorithm:'sha256'|'sha512'='sha256') { if(secret.length<24) throw new Error('WEBHOOK_SECRET_TOO_SHORT'); }
  verify(rawBody:Uint8Array|string,providedSignature:string,prefix?:string):boolean{
    const expectedPrefix=prefix??`${this.algorithm}=`;
    const clean=providedSignature.startsWith(expectedPrefix)?providedSignature.slice(expectedPrefix.length):providedSignature;
    const expected=createHmac(this.algorithm,this.secret).update(rawBody).digest('hex');
    const a=Buffer.from(clean,'utf8'),b=Buffer.from(expected,'utf8'); return a.length===b.length&&timingSafeEqual(a,b);
  }
}


export type IntegrationRuntimeStatus='DISABLED'|'CONFIGURED'|'HEALTHY'|'DEGRADED'|'UNAVAILABLE';
export function sanitizeIntegrationHealthDetail(input:string):string{
  return input
    .replace(/\b(authorization|bearer|token|secret|api[_ -]?key|password)\b\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]')
    .replace(/\b(?:sk|sb_secret|ghp|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/g,'[redacted]')
    .slice(0,1000);
}
export interface PersistedIntegration {
  guildId:string;
  integrationKey:string;
  enabled:boolean;
  status:string;
  capabilities:IntegrationCapabilities;
  lastHealthAt?:string;
  lastHealthDetail?:string;
  lastErrorCode?:string;
  configVersion:number;
  config:Record<string,unknown>;
  updatedBy?:string;
}

function persistedIntegration(row:any):PersistedIntegration{
  return {
    guildId:String(row.guild_id),integrationKey:String(row.integration_key),enabled:Boolean(row.enabled),status:String(row.status),capabilities:row.capabilities??{},
    lastHealthAt:row.last_health_at?new Date(row.last_health_at).toISOString():undefined,lastHealthDetail:row.last_health_detail??undefined,lastErrorCode:row.last_error_code??undefined,
    configVersion:Number(row.config_version??1),config:row.config&&typeof row.config==='object'&&!Array.isArray(row.config)?row.config:{},updatedBy:row.updated_by??undefined,
  };
}

export class IntegrationControlRepository {
  constructor(private readonly database:Database){}

  async get(guildId:string,integrationKey:string):Promise<PersistedIntegration|undefined>{
    const {rows}=await this.database.requirePool().query<any>(`select * from integrations where guild_id=$1 and integration_key=$2`,[guildId,integrationKey]);
    return rows[0]?persistedIntegration(rows[0]):undefined;
  }

  async ensureConfigured(input:{guildId:string;integrationKey:string;capabilities:IntegrationCapabilities;actorId:string}):Promise<PersistedIntegration>{
    const {rows}=await this.database.requirePool().query<any>(
      `insert into integrations(guild_id,integration_key,status,capabilities,config,enabled,config_version,updated_by) values($1,$2,'DISABLED',$3,'{}'::jsonb,false,1,$4)
       on conflict(guild_id,integration_key) do update set capabilities=excluded.capabilities,updated_by=excluded.updated_by,updated_at=now() returning *`,
      [input.guildId,input.integrationKey,input.capabilities,input.actorId],
    );
    return persistedIntegration(rows[0]);
  }

  async setPublicConfig(input:{guildId:string;integrationKey:string;config:Record<string,unknown>;actorId:string}):Promise<PersistedIntegration>{
    assertPublicIntegrationConfigSafe(input.config);
    return this.database.transaction(async(client)=>{
      const beforeRow=(await client.query<any>(`select * from integrations where guild_id=$1 and integration_key=$2 for update`,[input.guildId,input.integrationKey])).rows[0];
      if(!beforeRow)throw new Error('INTEGRATION_NOT_CONFIGURED');
      const before=persistedIntegration(beforeRow);
      const {rows}=await client.query<any>(`update integrations set config=$3,updated_by=$4,config_version=config_version+1,updated_at=now() where guild_id=$1 and integration_key=$2 returning *`,[input.guildId,input.integrationKey,input.config,input.actorId]);
      const after=persistedIntegration(rows[0]);
      await client.query(`insert into integration_events(event_id,guild_id,integration_key,actor_id,action,before_state,after_state,detail) values($1,$2,$3,$4,'CONFIG_UPDATE',$5,$6,$7)`,[randomUUID(),input.guildId,input.integrationKey,input.actorId,{configVersion:before.configVersion,config:before.config},{configVersion:after.configVersion,config:after.config},'Public integration configuration updated; secret-like keys are rejected']);
      return after;
    });
  }

  async setEnabled(input:{guildId:string;integrationKey:string;enabled:boolean;actorId:string}):Promise<PersistedIntegration>{
    return this.database.transaction(async(client)=>{
      const beforeRow=(await client.query<any>(`select * from integrations where guild_id=$1 and integration_key=$2 for update`,[input.guildId,input.integrationKey])).rows[0];
      if(!beforeRow)throw new Error('INTEGRATION_NOT_CONFIGURED');
      const before=persistedIntegration(beforeRow); const status=input.enabled?'CONFIGURED':'DISABLED';
      const {rows}=await client.query<any>(
        `update integrations set enabled=$3,status=$4,updated_by=$5,config_version=config_version+1,updated_at=now(),last_error_code=case when $3 then null else last_error_code end where guild_id=$1 and integration_key=$2 returning *`,
        [input.guildId,input.integrationKey,input.enabled,status,input.actorId],
      );
      const after=persistedIntegration(rows[0]);
      await client.query(`insert into integration_events(event_id,guild_id,integration_key,actor_id,action,before_state,after_state) values($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),input.guildId,input.integrationKey,input.actorId,input.enabled?'ENABLE':'DISABLE',{enabled:before.enabled,status:before.status,configVersion:before.configVersion},{enabled:after.enabled,status:after.status,configVersion:after.configVersion}]);
      return after;
    });
  }

  async recordHealth(input:{guildId:string;integrationKey:string;healthy:boolean;detail?:string;errorCode?:string;actorId:string}):Promise<PersistedIntegration>{
    return this.database.transaction(async(client)=>{
      const beforeRow=(await client.query<any>(`select * from integrations where guild_id=$1 and integration_key=$2 for update`,[input.guildId,input.integrationKey])).rows[0];
      if(!beforeRow)throw new Error('INTEGRATION_NOT_CONFIGURED');
      const before=persistedIntegration(beforeRow); const status:IntegrationRuntimeStatus=input.healthy?'HEALTHY':input.errorCode==='ADAPTER_NOT_REGISTERED'?'UNAVAILABLE':'DEGRADED';
      const detail=sanitizeIntegrationHealthDetail(input.detail??(input.healthy?'Health check passed':'Health check failed'));
      const {rows}=await client.query<any>(
        `update integrations set status=$3,last_health_at=now(),last_health_detail=$4,last_error_code=$5,updated_by=$6,updated_at=now() where guild_id=$1 and integration_key=$2 returning *`,
        [input.guildId,input.integrationKey,status,detail,input.errorCode??null,input.actorId],
      );
      const after=persistedIntegration(rows[0]);
      await client.query(`insert into integration_events(event_id,guild_id,integration_key,actor_id,action,before_state,after_state,detail) values($1,$2,$3,$4,'HEALTH_CHECK',$5,$6,$7)`,[randomUUID(),input.guildId,input.integrationKey,input.actorId,{status:before.status,enabled:before.enabled},{status:after.status,enabled:after.enabled,errorCode:after.lastErrorCode??null},detail]);
      return after;
    });
  }

  async recordSync(input:{guildId:string;integrationKey:string;detail:string;snapshotId:string;contentType:string;itemCount:number;actorId:string}):Promise<PersistedIntegration>{
    return this.database.transaction(async(client)=>{
      const beforeRow=(await client.query<any>(`select * from integrations where guild_id=$1 and integration_key=$2 for update`,[input.guildId,input.integrationKey])).rows[0];
      if(!beforeRow)throw new Error('INTEGRATION_NOT_CONFIGURED');
      const before=persistedIntegration(beforeRow);const detail=sanitizeIntegrationHealthDetail(input.detail);
      const {rows}=await client.query<any>(`update integrations set status='HEALTHY',last_health_at=now(),last_health_detail=$3,last_error_code=null,updated_by=$4,updated_at=now() where guild_id=$1 and integration_key=$2 returning *`,[input.guildId,input.integrationKey,detail,input.actorId]);
      const after=persistedIntegration(rows[0]);
      await client.query(`insert into integration_events(event_id,guild_id,integration_key,actor_id,action,before_state,after_state,detail) values($1,$2,$3,$4,'SYNC',$5,$6,$7)`,[randomUUID(),input.guildId,input.integrationKey,input.actorId,{status:before.status},{status:after.status,snapshotId:input.snapshotId,contentType:input.contentType,itemCount:Math.max(0,Math.floor(input.itemCount))},detail]);
      return after;
    });
  }

  async recordWebhookEvent(input:{guildId:string;integrationKey:string;action:'WEBHOOK_ACCEPTED'|'WEBHOOK_REJECTED';detail:string;deliveryId?:string}):Promise<void>{
    await this.database.requirePool().query(
      `insert into integration_events(event_id,guild_id,integration_key,actor_id,action,before_state,after_state,detail) values($1,$2,$3,null,$4,'{}'::jsonb,$5,$6)`,
      [randomUUID(),input.guildId,input.integrationKey,input.action,{deliveryId:input.deliveryId??null},sanitizeIntegrationHealthDetail(input.detail)],
    );
  }
}

const SECRET_LIKE_CONFIG_KEY=/(secret|token|password|passphrase|credential|authorization|api[_-]?key|private[_-]?key|cookie|session)/i;
export function assertPublicIntegrationConfigSafe(value:unknown,depth=0):void{
  if(depth>6)throw new Error('INTEGRATION_CONFIG_TOO_DEEP');
  if(value===null||['string','number','boolean'].includes(typeof value))return;
  if(Array.isArray(value)){if(value.length>100)throw new Error('INTEGRATION_CONFIG_TOO_LARGE');for(const item of value)assertPublicIntegrationConfigSafe(item,depth+1);return;}
  if(!value||typeof value!=='object')throw new Error('INTEGRATION_CONFIG_VALUE_INVALID');
  const entries=Object.entries(value as Record<string,unknown>);if(entries.length>100)throw new Error('INTEGRATION_CONFIG_TOO_LARGE');
  for(const [key,item] of entries){if(SECRET_LIKE_CONFIG_KEY.test(key))throw new Error(`INTEGRATION_CONFIG_SECRET_FIELD_FORBIDDEN:${key}`);assertPublicIntegrationConfigSafe(item,depth+1);}
}

export function normalizeWebhookHeaderName(value:string):string{
  const normalized=value.trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized))throw new Error('WEBHOOK_HEADER_NAME_INVALID');
  return normalized;
}

export function validateWebhookDeliveryId(value:string):string{
  const normalized=value.trim();
  if(!normalized||normalized.length>200||/[\r\n\0]/.test(normalized))throw new Error('WEBHOOK_DELIVERY_ID_INVALID');
  return normalized;
}

export function validateWebhookTimestamp(value:string|undefined,maxAgeSeconds=300,now=Date.now()):void{
  if(value===undefined)return;
  const raw=value.trim();
  const numeric=Number(raw);
  const parsed=Number.isFinite(numeric)&&numeric>0 ? (numeric>10_000_000_000?numeric:numeric*1000) : Date.parse(raw);
  if(!Number.isFinite(parsed))throw new Error('WEBHOOK_TIMESTAMP_INVALID');
  const skew=Math.abs(now-parsed);
  if(skew>Math.max(30,Math.min(3600,maxAgeSeconds))*1000)throw new Error('WEBHOOK_TIMESTAMP_STALE');
}

export function validateIntegrationSecretRef(integrationKey:string,secretRef:string):string{
  const key=integrationKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const expected=`env:INTEGRATION_${key}_WEBHOOK_SECRET`;
  if(secretRef!==expected)throw new Error(`INTEGRATION_SECRET_REF_INVALID:${expected}`);
  return secretRef;
}

export function resolveIntegrationSecretRef(secretRef:string,env:NodeJS.ProcessEnv=process.env):string{
  if(!secretRef.startsWith('env:'))throw new Error('INTEGRATION_SECRET_REF_UNSUPPORTED');
  const name=secretRef.slice(4);
  if(!/^INTEGRATION_[A-Z0-9_]+_WEBHOOK_SECRET$/.test(name))throw new Error('INTEGRATION_SECRET_ENV_NAME_INVALID');
  const value=env[name];
  if(!value||value.length<24)throw new Error('INTEGRATION_WEBHOOK_SECRET_UNAVAILABLE');
  return value;
}

export function webhookDigest(value:Uint8Array|string):string{return createHash('sha256').update(value).digest('hex');}

export interface IntegrationInboundConfig { enabled:boolean; secretRef?:string; configVersion:number; }
export interface WebhookDeliveryRecord { deliveryId:string; guildId:string; integrationKey:string; externalDeliveryId:string; state:string; correlationId:string; receivedAt:string; processedAt?:string; eventCount:number; lastErrorCode?:string; }

export class WebhookDeliveryRepository{
  constructor(private readonly database:Database){}

  async inboundConfig(guildId:string,integrationKey:string):Promise<IntegrationInboundConfig|undefined>{
    const {rows}=await this.database.requirePool().query<any>(`select enabled,secret_ref,config_version from integrations where guild_id=$1 and integration_key=$2`,[guildId,integrationKey]);
    return rows[0]?{enabled:Boolean(rows[0].enabled),secretRef:rows[0].secret_ref??undefined,configVersion:Number(rows[0].config_version??1)}:undefined;
  }

  async configureSecretRef(input:{guildId:string;integrationKey:string;secretRef:string;actorId:string}):Promise<void>{
    await this.database.transaction(async(client)=>{
      const current=(await client.query<any>(`select enabled,secret_ref,config_version from integrations where guild_id=$1 and integration_key=$2 for update`,[input.guildId,input.integrationKey])).rows[0];
      if(!current)throw new Error('INTEGRATION_NOT_CONFIGURED');
      await client.query(`update integrations set secret_ref=$3,config_version=config_version+1,updated_by=$4,updated_at=now() where guild_id=$1 and integration_key=$2`,[input.guildId,input.integrationKey,input.secretRef,input.actorId]);
      await client.query(`insert into integration_events(event_id,guild_id,integration_key,actor_id,action,before_state,after_state,detail) values($1,$2,$3,$4,'WEBHOOK_CONFIG',$5,$6,$7)`,[randomUUID(),input.guildId,input.integrationKey,input.actorId,{configured:Boolean(current.secret_ref),configVersion:Number(current.config_version??1)},{configured:true,configVersion:Number(current.config_version??1)+1},'Webhook secret reference updated; secret value is not stored in database']);
    });
  }

  async reserve(input:{guildId:string;integrationKey:string;externalDeliveryId:string;correlationId:string;bodyHash:string;signatureHash:string}):Promise<{accepted:boolean;deliveryId:string}>{
    const deliveryId=randomUUID();
    const {rows}=await this.database.requirePool().query<{delivery_id:string}>(
      `insert into webhook_deliveries(delivery_id,guild_id,integration_key,external_delivery_id,correlation_id,body_hash,signature_hash,state,expires_at)
       values($1,$2,$3,$4,$5,$6,$7,'RECEIVED',now()+interval '7 days') on conflict do nothing returning delivery_id`,
      [deliveryId,input.guildId,input.integrationKey,input.externalDeliveryId,input.correlationId,input.bodyHash,input.signatureHash],
    );
    return rows[0]?{accepted:true,deliveryId:String(rows[0].delivery_id)}:{accepted:false,deliveryId};
  }

  async processed(deliveryId:string,eventCount:number):Promise<void>{
    await this.database.requirePool().query(`update webhook_deliveries set state='PROCESSED',event_count=$2,processed_at=now(),result='SUCCEEDED',last_error_code=null where delivery_id=$1`,[deliveryId,Math.max(0,eventCount)]);
  }
  async failed(deliveryId:string,errorCode:string):Promise<void>{
    await this.database.requirePool().query(`update webhook_deliveries set state='FAILED',processed_at=now(),result='FAILED',last_error_code=$2 where delivery_id=$1`,[deliveryId,errorCode.slice(0,120)]);
  }
  async pruneExpired(limit=500):Promise<number>{
    const bounded=Math.max(1,Math.min(5000,Math.floor(limit)));
    const {rowCount}=await this.database.requirePool().query(`delete from webhook_deliveries where delivery_id in (select delivery_id from webhook_deliveries where expires_at is not null and expires_at<=now() order by expires_at asc limit $1)`,[bounded]);
    return rowCount??0;
  }
}

export const BUILTIN_INTEGRATIONS: readonly Array<{key:string;capabilities:IntegrationCapabilities}> = [
  {key:'generic-inbound',capabilities:{webhooks:true}},
  {key:'riot-data-dragon',capabilities:{content:true,assets:true,gameCatalog:true}},
  {key:'github-releases',capabilities:{news:true,content:true,releases:true}},
  {key:'discord-status',capabilities:{status:true,content:true}},
  {key:'steam-news',capabilities:{news:true,content:true}},
];

function genericWebhookEvents(rawBody:Uint8Array):readonly IntegrationWebhookEvent[]{
  let decoded:unknown;try{decoded=JSON.parse(new TextDecoder().decode(rawBody));}catch{throw new Error('GENERIC_WEBHOOK_JSON_INVALID');}
  const root=decoded as {eventType?:unknown;payload?:unknown;aggregateKey?:unknown;sequence?:unknown;events?:unknown};
  const source=Array.isArray(root?.events)?root.events:[root];if(source.length<1||source.length>100)throw new Error('GENERIC_WEBHOOK_EVENT_COUNT_INVALID');
  return source.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`GENERIC_WEBHOOK_EVENT_INVALID:${index}`);
    const event=item as Record<string,unknown>;const type=String(event.eventType??'').trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9_.-]{0,79}$/.test(type))throw new Error(`GENERIC_WEBHOOK_EVENT_TYPE_INVALID:${index}`);
    const payload=event.payload;if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error(`GENERIC_WEBHOOK_PAYLOAD_INVALID:${index}`);
    const aggregateKey=event.aggregateKey==null?undefined:String(event.aggregateKey).trim().slice(0,120);const sequence=event.sequence==null?undefined:Number(event.sequence);
    if(sequence!==undefined&&(!Number.isSafeInteger(sequence)||sequence<0))throw new Error(`GENERIC_WEBHOOK_SEQUENCE_INVALID:${index}`);
    return {eventType:`integration.generic.${type}`,payload:payload as Record<string,unknown>,aggregateKey:aggregateKey||undefined,sequence};
  });
}

export function createGenericInboundAdapter():IntegrationAdapter{
  return {
    key:'generic-inbound',capabilities:{webhooks:true},
    async health(){return {healthy:true,detail:'Built-in signed inbound adapter is registered. Guild enablement and env secret configuration are verified separately.'};},
    webhook:{
      signatureHeader:'x-autoserver-signature',deliveryIdHeader:'x-autoserver-delivery',timestampHeader:'x-autoserver-timestamp',maxAgeSeconds:300,
      verify({rawBody,signature,secret,timestamp}){
        if(!timestamp)return false;const clean=signature.startsWith('sha256=')?signature.slice(7):signature;
        const expected=createHmac('sha256',secret).update(timestamp).update('.').update(rawBody).digest('hex');const a=Buffer.from(clean,'utf8'),b=Buffer.from(expected,'utf8');return a.length===b.length&&timingSafeEqual(a,b);
      },
      transform({rawBody}){return genericWebhookEvents(rawBody);},
    },
  };
}

export function createDefaultIntegrationRegistry():IntegrationRegistry{
  const registry=new IntegrationRegistry();
  registry.register(createGenericInboundAdapter());
  registry.register(createRiotDataDragonAdapter(new SafeIntegrationHttpClient({allowedHosts:['ddragon.leagueoflegends.com'],timeoutMs:8_000,maxResponseBytes:4_000_000})));
  registry.register(createGitHubReleasesAdapter(new SafeIntegrationHttpClient({allowedHosts:['api.github.com'],timeoutMs:8_000,maxResponseBytes:2_000_000})));
  registry.register(createDiscordStatusAdapter(new SafeIntegrationHttpClient({allowedHosts:['discordstatus.com'],timeoutMs:8_000,maxResponseBytes:2_000_000})));
  registry.register(createSteamNewsAdapter(new SafeIntegrationHttpClient({allowedHosts:['api.steampowered.com'],timeoutMs:8_000,maxResponseBytes:2_000_000})));
  return registry;
}

export { IntegrationSyncRepository, integrationPayloadHash, type IntegrationSyncSnapshot } from './sync.ts';
export { createRiotDataDragonAdapter } from './providers/riot-data-dragon.ts';
export { createGitHubReleasesAdapter } from './providers/github-releases.ts';
export { createDiscordStatusAdapter } from './providers/discord-status.ts';
export { createSteamNewsAdapter } from './providers/steam-news.ts';
