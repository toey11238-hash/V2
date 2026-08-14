import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type FeatureFlagScope='GLOBAL'|'GUILD'|'ROLE'|'ENVIRONMENT';
export type FeatureFlagState='OFF'|'ON'|'CANARY';
export type FeatureRolloutHistoryAction='CREATE'|'UPDATE'|'ROLLBACK';
export interface FeatureRollout {
  rolloutId:string;
  featureKey:string;
  scope:FeatureFlagScope;
  guildId?:string;
  roleId?:string;
  environment?:string;
  state:FeatureFlagState;
  rolloutPercent:number;
  config:Record<string,unknown>;
  updatedBy?:string;
  revision:number;
}
export interface FeatureContext { guildId:string;userId?:string;roleIds?:readonly string[];environment:string; }
export interface FeatureEvaluation { enabled:boolean;matched?:FeatureRollout;reason:string;bucket?:number; }
export interface FeatureRolloutHistory {
  historyId:string;
  rolloutId:string;
  guildId?:string;
  featureKey:string;
  revision:number;
  action:FeatureRolloutHistoryAction;
  snapshot:FeatureRollout;
  changedBy?:string;
  reason?:string;
  createdAt:string;
}
export interface FeatureRolloutOutcome {
  outcomeId:string;
  observationId:string;
  guildId:string;
  featureKey:string;
  metricKey:string;
  value:number;
  recordedAt:string;
}
export interface FeatureRolloutOutcomeCohort { samples:number; average:number; sum:number; min:number; max:number; }
export interface FeatureRolloutOutcomeComparison {
  guildId:string; featureKey:string; metricKey:string; lookbackDays:number;
  enabled:FeatureRolloutOutcomeCohort; excluded:FeatureRolloutOutcomeCohort;
}
export type CanaryReviewAction='INSUFFICIENT_DATA'|'REVIEW_EXPAND'|'REVIEW_HOLD'|'REVIEW_ROLLBACK';
export interface CanaryOutcomeReview { action:CanaryReviewAction; relativeDelta?:number; reason:string; }

export function reviewCanaryOutcome(input:{comparison:FeatureRolloutOutcomeComparison;higherIsBetter?:boolean;minSamplesPerCohort?:number;minimumRelativeLift?:number}):CanaryOutcomeReview{
  const higher=input.higherIsBetter!==false;
  const minSamples=Math.max(5,Math.min(10_000,Math.trunc(input.minSamplesPerCohort??20)));
  const lift=Math.max(0.001,Math.min(1,input.minimumRelativeLift??0.05));
  const {enabled,excluded}=input.comparison;
  if(enabled.samples<minSamples||excluded.samples<minSamples)return {action:'INSUFFICIENT_DATA',reason:`ต้องมีอย่างน้อย ${minSamples} ตัวอย่างทั้งในกลุ่มเปิดใช้และกลุ่มไม่เปิดใช้`};
  const baseline=excluded.average;
  const relativeDelta=(enabled.average-baseline)/Math.max(Math.abs(baseline),1e-9);
  const signed=higher?relativeDelta:-relativeDelta;
  if(signed>=lift)return {action:'REVIEW_EXPAND',relativeDelta,reason:`ผลของกลุ่มเปิดใช้ดีขึ้น ${(signed*100).toFixed(2)}% ถึงเกณฑ์ทบทวนแล้ว แต่ยังต้องให้ผู้ปฏิบัติการตรวจสอบก่อน`};
  if(signed<=-lift)return {action:'REVIEW_ROLLBACK',relativeDelta,reason:`ผลของกลุ่มเปิดใช้ถดถอย ${(Math.abs(signed)*100).toFixed(2)}% ถึงเกณฑ์ทบทวนแล้ว การย้อนกลับยังต้องทำด้วยตนเองและมีบันทึกตรวจสอบ`};
  return {action:'REVIEW_HOLD',relativeDelta,reason:'ความแตกต่างที่พบยังอยู่ภายในเกณฑ์ทบทวนที่กำหนด'};
}

export interface FeatureRolloutObservation {
  observationId:string;
  guildId:string;
  featureKey:string;
  rolloutId?:string;
  rolloutRevision?:number;
  identityHash:string;
  roleContextHash?:string;
  environment:string;
  enabled:boolean;
  reason:string;
  bucket?:number;
  observedAt:string;
}

export function stableRolloutBucket(featureKey:string,identity:string):number{
  const hex=createHash('sha256').update(`${featureKey}:${identity}`).digest('hex').slice(0,8);
  return Number.parseInt(hex,16)%100;
}

export function rolloutIdentityHash(context:FeatureContext):string{
  const identity=context.userId??context.guildId;
  return createHash('sha256').update(`guild:${context.guildId}:identity:${identity}`).digest('hex');
}

export function rolloutRoleContextHash(context:FeatureContext):string|undefined{
  if(!context.roleIds?.length)return undefined;
  const roles=[...new Set(context.roleIds)].sort().join(',');
  return createHash('sha256').update(`guild:${context.guildId}:roles:${roles}`).digest('hex');
}

function matches(rule:FeatureRollout,context:FeatureContext):boolean{
  if(rule.scope==='GLOBAL')return true;
  if(rule.scope==='GUILD')return rule.guildId===context.guildId;
  if(rule.scope==='ENVIRONMENT')return rule.environment===context.environment;
  if(rule.scope==='ROLE')return Boolean(rule.guildId===context.guildId&&rule.roleId&&context.roleIds?.includes(rule.roleId));
  return false;
}

const specificity:Record<FeatureFlagScope,number>={GLOBAL:0,ENVIRONMENT:1,GUILD:2,ROLE:3};
export function evaluateFeatureRollouts(featureKey:string,rules:readonly FeatureRollout[],context:FeatureContext):FeatureEvaluation{
  const candidates=rules.filter((rule)=>rule.featureKey===featureKey&&matches(rule,context)).sort((a,b)=>specificity[b.scope]-specificity[a.scope]);
  const rule=candidates[0]; if(!rule)return {enabled:false,reason:'NO_MATCHING_ROLLOUT'};
  if(rule.state==='OFF')return {enabled:false,matched:rule,reason:`${rule.scope}_OFF`};
  if(rule.state==='ON')return {enabled:true,matched:rule,reason:`${rule.scope}_ON`};
  const identity=context.userId??context.guildId; const bucket=stableRolloutBucket(featureKey,identity); const enabled=bucket<rule.rolloutPercent;
  return {enabled,matched:rule,reason:enabled?'CANARY_INCLUDED':'CANARY_EXCLUDED',bucket};
}

function fromRow(row:any):FeatureRollout{
  return {
    rolloutId:String(row.rollout_id),featureKey:String(row.feature_key),scope:row.scope as FeatureFlagScope,
    guildId:row.guild_id??undefined,roleId:row.role_id??undefined,environment:row.environment??undefined,
    state:row.state as FeatureFlagState,rolloutPercent:Number(row.rollout_percent),config:row.config??{},updatedBy:row.updated_by??undefined,
    revision:Number(row.revision??1),
  };
}

function snapshot(input:FeatureRollout):Record<string,unknown>{
  return {
    rolloutId:input.rolloutId,featureKey:input.featureKey,scope:input.scope,guildId:input.guildId??null,roleId:input.roleId??null,
    environment:input.environment??null,state:input.state,rolloutPercent:input.rolloutPercent,config:input.config,updatedBy:input.updatedBy??null,revision:input.revision,
  };
}

function featureRolloutFromSnapshot(value:unknown):FeatureRollout{
  if(!value||typeof value!=='object')throw new Error('FEATURE_ROLLOUT_HISTORY_INVALID');
  const row=value as Record<string,unknown>;
  if(typeof row.rolloutId!=='string'||typeof row.featureKey!=='string'||!['GLOBAL','GUILD','ROLE','ENVIRONMENT'].includes(String(row.scope))||!['OFF','ON','CANARY'].includes(String(row.state)))throw new Error('FEATURE_ROLLOUT_HISTORY_INVALID');
  const rolloutPercent=Number(row.rolloutPercent);
  if(!Number.isInteger(rolloutPercent)||rolloutPercent<0||rolloutPercent>100)throw new Error('FEATURE_ROLLOUT_HISTORY_INVALID');
  return {
    rolloutId:row.rolloutId,featureKey:row.featureKey,scope:row.scope as FeatureFlagScope,guildId:typeof row.guildId==='string'?row.guildId:undefined,
    roleId:typeof row.roleId==='string'?row.roleId:undefined,environment:typeof row.environment==='string'?row.environment:undefined,
    state:row.state as FeatureFlagState,rolloutPercent,config:row.config&&typeof row.config==='object'&&!Array.isArray(row.config)?row.config as Record<string,unknown>:{},
    updatedBy:typeof row.updatedBy==='string'?row.updatedBy:undefined,revision:Number(row.revision??1),
  };
}

function validateInput(input:Omit<FeatureRollout,'rolloutId'|'revision'>):void{
  if(!/^[a-z][a-z0-9._-]{1,95}$/i.test(input.featureKey))throw new Error('INVALID_FEATURE_KEY');
  if(!Number.isInteger(input.rolloutPercent)||input.rolloutPercent<0||input.rolloutPercent>100)throw new Error('INVALID_ROLLOUT_PERCENT');
  if(input.scope==='GUILD'&&!input.guildId)throw new Error('GUILD_SCOPE_REQUIRES_GUILD');
  if(input.scope==='ROLE'&&(!input.guildId||!input.roleId))throw new Error('ROLE_SCOPE_REQUIRES_GUILD_AND_ROLE');
  if(input.scope==='ENVIRONMENT'&&!input.environment)throw new Error('ENV_SCOPE_REQUIRES_ENVIRONMENT');
}

export class FeatureRolloutRepository{
  constructor(private readonly database:Database){}

  async list(featureKey?:string,guildId?:string):Promise<FeatureRollout[]>{
    const where:string[]=[];const values:unknown[]=[];
    if(featureKey){values.push(featureKey);where.push(`feature_key=$${values.length}`);}
    if(guildId){values.push(guildId);where.push(`(guild_id=$${values.length} or guild_id is null)`);}
    const {rows}=await this.database.requirePool().query<any>(`select * from feature_rollouts${where.length?' where '+where.join(' and '):''} order by feature_key,case scope when 'ROLE' then 4 when 'GUILD' then 3 when 'ENVIRONMENT' then 2 else 1 end desc`,values);
    return rows.map(fromRow);
  }

  async getById(rolloutId:string):Promise<FeatureRollout|undefined>{
    const {rows}=await this.database.requirePool().query<any>(`select * from feature_rollouts where rollout_id=$1`,[rolloutId]);
    return rows[0]?fromRow(rows[0]):undefined;
  }

  async upsert(input:Omit<FeatureRollout,'rolloutId'|'revision'>, reason?:string):Promise<string>{
    validateInput(input);
    return this.database.transaction(async(client)=>{
      const proposedId=randomUUID();
      const {rows}=await client.query<any>(
        `insert into feature_rollouts(rollout_id,feature_key,scope,guild_id,role_id,environment,state,rollout_percent,config,updated_by,revision)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
         on conflict (feature_key,scope,(coalesce(guild_id,'')),(coalesce(role_id,'')),(coalesce(environment,'')))
         do update set state=excluded.state,rollout_percent=excluded.rollout_percent,config=excluded.config,updated_by=excluded.updated_by,revision=feature_rollouts.revision+1,updated_at=now()
         returning *`,
        [proposedId,input.featureKey,input.scope,input.guildId??null,input.roleId??null,input.environment??null,input.state,input.rolloutPercent,input.config,input.updatedBy??null],
      );
      const row=rows[0]; const current=fromRow(row); const action:FeatureRolloutHistoryAction=current.revision===1?'CREATE':'UPDATE';
      await client.query(
        `insert into feature_rollout_history(history_id,rollout_id,guild_id,feature_key,revision,action,snapshot,changed_by,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(),current.rolloutId,current.guildId??null,current.featureKey,current.revision,action,snapshot(current),input.updatedBy??null,reason??null],
      );
      return current.rolloutId;
    });
  }

  async listHistory(guildId:string,featureKey?:string,limit=100):Promise<FeatureRolloutHistory[]>{
    const safe=Math.max(1,Math.min(250,Math.trunc(limit))); const values:unknown[]=[guildId]; let featureClause='';
    if(featureKey){values.push(featureKey);featureClause=` and feature_key=$${values.length}`;} values.push(safe);
    const {rows}=await this.database.requirePool().query<any>(
      `select * from feature_rollout_history where (guild_id=$1 or guild_id is null)${featureClause} order by created_at desc limit $${values.length}`,
      values,
    );
    return rows.map((row)=>({historyId:String(row.history_id),rolloutId:String(row.rollout_id),guildId:row.guild_id??undefined,featureKey:String(row.feature_key),revision:Number(row.revision),action:row.action as FeatureRolloutHistoryAction,snapshot:featureRolloutFromSnapshot(row.snapshot),changedBy:row.changed_by??undefined,reason:row.reason??undefined,createdAt:new Date(row.created_at).toISOString()}));
  }

  async rollback(input:{guildId:string;rolloutId:string;historyId:string;actorId:string;reason?:string}):Promise<FeatureRollout>{
    return this.database.transaction(async(client)=>{
      const currentRow=(await client.query<any>(`select * from feature_rollouts where rollout_id=$1 for update`,[input.rolloutId])).rows[0];
      if(!currentRow)throw new Error('FEATURE_ROLLOUT_NOT_FOUND');
      const current=fromRow(currentRow);
      if(current.guildId&&current.guildId!==input.guildId)throw new Error('FEATURE_ROLLOUT_GUILD_MISMATCH');
      const historyRow=(await client.query<any>(`select * from feature_rollout_history where history_id=$1 and rollout_id=$2`,[input.historyId,input.rolloutId])).rows[0];
      if(!historyRow)throw new Error('FEATURE_ROLLOUT_HISTORY_NOT_FOUND');
      const target=featureRolloutFromSnapshot(historyRow.snapshot);
      if(target.featureKey!==current.featureKey||target.scope!==current.scope||target.guildId!==current.guildId||target.roleId!==current.roleId||target.environment!==current.environment)throw new Error('FEATURE_ROLLOUT_HISTORY_SCOPE_MISMATCH');
      const revision=current.revision+1;
      const {rows}=await client.query<any>(
        `update feature_rollouts set state=$2,rollout_percent=$3,config=$4,updated_by=$5,revision=$6,updated_at=now() where rollout_id=$1 returning *`,
        [input.rolloutId,target.state,target.rolloutPercent,target.config,input.actorId,revision],
      );
      const restored=fromRow(rows[0]);
      await client.query(
        `insert into feature_rollout_history(history_id,rollout_id,guild_id,feature_key,revision,action,snapshot,changed_by,reason) values($1,$2,$3,$4,$5,'ROLLBACK',$6,$7,$8)`,
        [randomUUID(),restored.rolloutId,restored.guildId??null,restored.featureKey,restored.revision,snapshot(restored),input.actorId,input.reason??`rollback:${input.historyId}`],
      );
      return restored;
    });
  }

  async evaluate(featureKey:string,context:FeatureContext):Promise<FeatureEvaluation>{
    return evaluateFeatureRollouts(featureKey,await this.list(featureKey,context.guildId),context);
  }

  async evaluateAndObserve(featureKey:string,context:FeatureContext):Promise<FeatureEvaluation & {observationId:string}>{
    const result=await this.evaluate(featureKey,context); const matched=result.matched; const observationId=randomUUID();
    await this.database.requirePool().query(
      `insert into feature_rollout_observations(observation_id,guild_id,feature_key,rollout_id,rollout_revision,identity_hash,role_context_hash,environment,enabled,reason,bucket)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [observationId,context.guildId,featureKey,matched?.rolloutId??null,matched?.revision??null,rolloutIdentityHash(context),rolloutRoleContextHash(context)??null,context.environment,result.enabled,result.reason,result.bucket??null],
    );
    return {...result,observationId};
  }

  async listObservations(guildId:string,featureKey?:string,limit=100):Promise<FeatureRolloutObservation[]>{
    const safe=Math.max(1,Math.min(500,Math.trunc(limit))); const values:unknown[]=[guildId]; let featureClause='';
    if(featureKey){values.push(featureKey);featureClause=` and feature_key=$${values.length}`;} values.push(safe);
    const {rows}=await this.database.requirePool().query<any>(
      `select * from feature_rollout_observations where guild_id=$1${featureClause} order by observed_at desc limit $${values.length}`,
      values,
    );
    return rows.map((row)=>({observationId:String(row.observation_id),guildId:String(row.guild_id),featureKey:String(row.feature_key),rolloutId:row.rollout_id??undefined,rolloutRevision:row.rollout_revision==null?undefined:Number(row.rollout_revision),identityHash:String(row.identity_hash),roleContextHash:row.role_context_hash??undefined,environment:String(row.environment),enabled:Boolean(row.enabled),reason:String(row.reason),bucket:row.bucket==null?undefined:Number(row.bucket),observedAt:new Date(row.observed_at).toISOString()}));
  }

  async recordOutcome(input:{observationId:string;guildId:string;featureKey:string;metricKey:string;value:number}):Promise<FeatureRolloutOutcome>{
    if(!/^[a-z][a-z0-9._-]{1,95}$/i.test(input.metricKey))throw new Error('FEATURE_OUTCOME_METRIC_INVALID');
    if(!Number.isFinite(input.value)||Math.abs(input.value)>1_000_000_000_000)throw new Error('FEATURE_OUTCOME_VALUE_INVALID');
    return this.database.transaction(async(client)=>{
      const observation=(await client.query<any>(`select observation_id,guild_id,feature_key from feature_rollout_observations where observation_id=$1 for share`,[input.observationId])).rows[0];
      if(!observation)throw new Error('FEATURE_ROLLOUT_OBSERVATION_NOT_FOUND');
      if(String(observation.guild_id)!==input.guildId||String(observation.feature_key)!==input.featureKey)throw new Error('FEATURE_OUTCOME_SCOPE_MISMATCH');
      const outcomeId=randomUUID();
      const inserted=(await client.query<any>(`insert into feature_rollout_outcomes(outcome_id,observation_id,guild_id,feature_key,metric_key,value) values($1,$2,$3,$4,$5,$6) on conflict(observation_id,metric_key) do nothing returning *`,[outcomeId,input.observationId,input.guildId,input.featureKey,input.metricKey,input.value])).rows[0];
      const row=inserted??(await client.query<any>(`select * from feature_rollout_outcomes where observation_id=$1 and metric_key=$2`,[input.observationId,input.metricKey])).rows[0];
      if(!row)throw new Error('FEATURE_OUTCOME_PERSISTENCE_FAILED');
      if(Number(row.value)!==input.value)throw new Error('FEATURE_OUTCOME_IDEMPOTENCY_CONFLICT');
      return {outcomeId:String(row.outcome_id),observationId:String(row.observation_id),guildId:String(row.guild_id),featureKey:String(row.feature_key),metricKey:String(row.metric_key),value:Number(row.value),recordedAt:new Date(row.recorded_at).toISOString()};
    });
  }

  async compareOutcomes(input:{guildId:string;featureKey:string;metricKey:string;lookbackDays?:number}):Promise<FeatureRolloutOutcomeComparison>{
    if(!/^[a-z][a-z0-9._-]{1,95}$/i.test(input.metricKey))throw new Error('FEATURE_OUTCOME_METRIC_INVALID');
    const lookbackDays=Math.max(1,Math.min(90,Math.trunc(input.lookbackDays??14)));
    const {rows}=await this.database.requirePool().query<any>(
      `select o.enabled,count(*)::int as samples,coalesce(avg(f.value),0)::float8 as average,coalesce(sum(f.value),0)::float8 as sum,coalesce(min(f.value),0)::float8 as min,coalesce(max(f.value),0)::float8 as max
       from feature_rollout_outcomes f join feature_rollout_observations o on o.observation_id=f.observation_id
       where f.guild_id=$1 and f.feature_key=$2 and f.metric_key=$3 and f.recorded_at>=now()-($4::int*interval '1 day')
       group by o.enabled`,[input.guildId,input.featureKey,input.metricKey,lookbackDays],
    );
    const empty:FeatureRolloutOutcomeCohort={samples:0,average:0,sum:0,min:0,max:0};
    const result:FeatureRolloutOutcomeComparison={guildId:input.guildId,featureKey:input.featureKey,metricKey:input.metricKey,lookbackDays,enabled:{...empty},excluded:{...empty}};
    for(const row of rows){const cohort={samples:Number(row.samples??0),average:Number(row.average??0),sum:Number(row.sum??0),min:Number(row.min??0),max:Number(row.max??0)};if(Boolean(row.enabled))result.enabled=cohort;else result.excluded=cohort;}
    return result;
  }

}
