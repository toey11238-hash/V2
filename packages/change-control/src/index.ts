import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import { SetupPlanner, analyzeSetupImpact, type ExecutionPlan, type GuildSnapshot, type ServerBlueprint, type SetupImpactReport } from '@autoserver/setup';

export type ChangeMode = 'TEMPLATE_MIGRATION' | 'SAFE_REBUILD' | 'PARTIAL_REBUILD';
export type ChangeRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ChangeRunState = 'PREVIEWED' | 'WAITING_APPROVAL' | 'APPROVED' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export interface RetirementReview {
  logicalKey: string;
  resourceKind: string;
  discordId: string;
  ownership: string;
  disposition: 'PRESERVE' | 'REVIEW_RETIRE';
  reason: string;
}

export interface SafeChangePlan {
  mode: ChangeMode;
  setupPlan: ExecutionPlan;
  retirements: RetirementReview[];
  risk: ChangeRisk;
  planHash: string;
  impact: SetupImpactReport;
  destructiveActions: 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>`${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function buildSafeChangePlan(input:{mode:ChangeMode;snapshot:GuildSnapshot;target:ServerBlueprint}):SafeChangePlan {
  const setupPlan = new SetupPlanner().plan(input.snapshot,input.target);
  const desiredKeys = new Set(input.target.resources.map((resource)=>resource.logicalKey));
  const retirements = input.snapshot.mappings
    .filter((mapping)=>!desiredKeys.has(mapping.logicalKey))
    .map((mapping):RetirementReview=>{
      const protectedResource = mapping.locked || mapping.ownership === 'LOCKED' || mapping.ownership === 'USER_OWNED';
      return {
        logicalKey:mapping.logicalKey,
        resourceKind:mapping.resourceKind,
        discordId:mapping.discordId,
        ownership:mapping.ownership,
        disposition:protectedResource?'PRESERVE':'REVIEW_RETIRE',
        reason:protectedResource?'Protected/user-owned resource is never retired automatically.':'No longer present in the target blueprint. Review/archive manually after migration verification; automatic deletion is forbidden.',
      };
    });
  const reviewCount=retirements.filter((item)=>item.disposition==='REVIEW_RETIRE').length;
  const impact=analyzeSetupImpact(setupPlan.actions);
  const risk:ChangeRisk = setupPlan.conflicts>0||impact.level==='CRITICAL'?'CRITICAL':impact.level==='HIGH'||reviewCount>0?'HIGH':impact.level==='MEDIUM'?'MEDIUM':'LOW';
  const body={mode:input.mode,guildId:input.snapshot.guildId,target:{key:input.target.key,version:input.target.version},setupActions:setupPlan.actions,retirements,risk,impact};
  return {...body,setupPlan,planHash:createHash('sha256').update(canonical(body)).digest('hex'),destructiveActions:0};
}

function validateKey(value:string,label:string,max=80):string {
  const normalized=value.trim();
  if(!new RegExp(`^[a-z][a-z0-9_-]{1,${Math.max(2,max-1)}}$`,'i').test(normalized)) throw new Error(`INVALID_${label}`);
  return normalized;
}

export function validateCustomBlueprint(candidate:unknown):ServerBlueprint {
  if(!candidate||typeof candidate!=='object') throw new Error('CUSTOM_BLUEPRINT_OBJECT_REQUIRED');
  const value=candidate as Partial<ServerBlueprint>;
  const key=`custom:${validateKey(String(value.key??'').replace(/^custom:/,''),'BLUEPRINT_KEY',60)}`;
  const version=Number(value.version??1);
  if(!Number.isInteger(version)||version<1||version>1_000_000) throw new Error('INVALID_BLUEPRINT_VERSION');
  const displayName=String(value.displayName??'').trim().slice(0,100); if(displayName.length<3) throw new Error('INVALID_BLUEPRINT_DISPLAY_NAME');
  const description=String(value.description??'').trim().slice(0,1000);
  const complexity=value.complexity;
  if(!['compact','standard','advanced','enterprise'].includes(String(complexity))) throw new Error('INVALID_BLUEPRINT_COMPLEXITY');
  const enabledModules=Array.isArray(value.enabledModules)?[...new Set(value.enabledModules.filter((item):item is string=>typeof item==='string').map((item)=>validateKey(item,'MODULE_KEY',64)))].slice(0,100):[];
  if(!Array.isArray(value.resources)||value.resources.length<1||value.resources.length>400) throw new Error('INVALID_BLUEPRINT_RESOURCE_COUNT');
  const keys=new Set<string>();
  const resources=value.resources.map((resource)=>{
    if(!resource||typeof resource!=='object') throw new Error('INVALID_BLUEPRINT_RESOURCE');
    const logicalKey=String(resource.logicalKey??'').trim();
    if(!/^[A-Z][A-Z0-9_]{2,95}$/.test(logicalKey)||keys.has(logicalKey)) throw new Error('INVALID_OR_DUPLICATE_LOGICAL_KEY');
    keys.add(logicalKey);
    const kind=resource.kind;
    if(!['ROLE','CATEGORY','TEXT_CHANNEL','FORUM_CHANNEL','VOICE_CHANNEL'].includes(kind)) throw new Error('INVALID_RESOURCE_KIND');
    const name=String(resource.name??'').trim(); if(name.length<1||name.length>100) throw new Error('INVALID_RESOURCE_NAME');
    const ownership=resource.ownership;
    if(!['SYSTEM_OWNED','TEMPLATE_OWNED'].includes(ownership)) throw new Error('CUSTOM_BLUEPRINT_OWNERSHIP_MUST_BE_MANAGED');
    const module=validateKey(String(resource.module??''),'MODULE_KEY',64);
    return {...resource,logicalKey,kind,name,ownership,module,reason:String(resource.reason??'Custom blueprint resource').slice(0,500)};
  });
  for(const resource of resources){ if(resource.parentKey && !keys.has(resource.parentKey)) throw new Error(`UNKNOWN_PARENT_KEY:${resource.parentKey}`); }
  return {key,version,displayName,description,complexity:complexity as ServerBlueprint['complexity'],enabledModules,resources};
}

export function blueprintChecksum(blueprint:ServerBlueprint):string { return createHash('sha256').update(canonical(blueprint)).digest('hex'); }

export class CustomBlueprintRepository {
  constructor(private readonly database:Database){}
  async save(input:{guildId:string;blueprint:ServerBlueprint;createdBy:string;publish?:boolean}):Promise<{blueprintKey:string;checksum:string}> {
    const blueprint=validateCustomBlueprint(input.blueprint); const checksum=blueprintChecksum(blueprint);
    await this.database.requirePool().query(`insert into custom_blueprints(guild_id,blueprint_key,version,display_name,description,complexity,payload,checksum,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(guild_id,blueprint_key) do update set version=excluded.version,display_name=excluded.display_name,description=excluded.description,complexity=excluded.complexity,payload=excluded.payload,checksum=excluded.checksum,status=excluded.status,updated_at=now()`,[input.guildId,blueprint.key,blueprint.version,blueprint.displayName,blueprint.description,blueprint.complexity,blueprint,checksum,input.publish?'PUBLISHED':'DRAFT',input.createdBy]);
    return {blueprintKey:blueprint.key,checksum};
  }
  async get(guildId:string,blueprintKey:string,publishedOnly=true):Promise<ServerBlueprint|null>{
    const {rows}=await this.database.requirePool().query<any>(`select payload,checksum,status from custom_blueprints where guild_id=$1 and blueprint_key=$2${publishedOnly?" and status='PUBLISHED'":''}`,[guildId,blueprintKey]);
    if(!rows[0])return null; const blueprint=validateCustomBlueprint(rows[0].payload); if(blueprintChecksum(blueprint)!==rows[0].checksum)throw new Error('CUSTOM_BLUEPRINT_CHECKSUM_MISMATCH'); return blueprint;
  }
  async list(guildId:string):Promise<Array<{key:string;version:number;displayName:string;description:string;complexity:string;checksum:string;status:string}>>{
    const {rows}=await this.database.requirePool().query<any>(`select blueprint_key,version,display_name,description,complexity,checksum,status from custom_blueprints where guild_id=$1 and status<>'ARCHIVED' order by updated_at desc limit 100`,[guildId]);
    return rows.map((row)=>({key:row.blueprint_key,version:Number(row.version),displayName:row.display_name,description:row.description,complexity:row.complexity,checksum:row.checksum,status:row.status}));
  }
  async publish(guildId:string,blueprintKey:string):Promise<boolean>{const result=await this.database.requirePool().query(`update custom_blueprints set status='PUBLISHED',updated_at=now() where guild_id=$1 and blueprint_key=$2 and status='DRAFT'`,[guildId,blueprintKey]);return (result.rowCount??0)>0;}
}

export interface ChangeRunRecord {changeRunId:string;guildId:string;mode:ChangeMode;state:ChangeRunState;fromTemplate?:string;toTemplate:string;setupDraft:Record<string,unknown>;plan:Record<string,unknown>;planHash:string;risk:ChangeRisk;requestedBy:string;approvalId?:string;jobId?:string;correlationId:string;}
export class ChangeRunRepository {
  constructor(private readonly database:Database){}
  async create(input:Omit<ChangeRunRecord,'changeRunId'|'state'|'jobId'>):Promise<string>{const changeRunId=randomUUID();await this.database.requirePool().query(`insert into change_runs(change_run_id,guild_id,mode,state,from_template,to_template,setup_draft,plan,plan_hash,risk,requested_by,approval_id,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[changeRunId,input.guildId,input.mode,input.approvalId?'WAITING_APPROVAL':'PREVIEWED',input.fromTemplate??null,input.toTemplate,input.setupDraft,input.plan,input.planHash,input.risk,input.requestedBy,input.approvalId??null,input.correlationId]);return changeRunId;}
  async get(guildId:string,changeRunId:string):Promise<ChangeRunRecord|null>{const {rows}=await this.database.requirePool().query<any>(`select * from change_runs where guild_id=$1 and change_run_id=$2`,[guildId,changeRunId]);const row=rows[0];return row?{changeRunId:row.change_run_id,guildId:row.guild_id,mode:row.mode,state:row.state,fromTemplate:row.from_template??undefined,toTemplate:row.to_template,setupDraft:row.setup_draft,plan:row.plan,planHash:row.plan_hash,risk:row.risk,requestedBy:row.requested_by,approvalId:row.approval_id??undefined,jobId:row.job_id??undefined,correlationId:row.correlation_id}:null;}
  async attachJob(guildId:string,changeRunId:string,jobId:string):Promise<boolean>{const result=await this.database.requirePool().query(`update change_runs set state='QUEUED',job_id=$3,updated_at=now() where guild_id=$1 and change_run_id=$2 and state in ('APPROVED','WAITING_APPROVAL','PREVIEWED')`,[guildId,changeRunId,jobId]);return (result.rowCount??0)>0;}
  async setState(guildId:string,changeRunId:string,state:ChangeRunState,result?:unknown):Promise<void>{await this.database.requirePool().query(`update change_runs set state=$3,result=coalesce($4,result),updated_at=now() where guild_id=$1 and change_run_id=$2`,[guildId,changeRunId,state,result??null]);}
}
