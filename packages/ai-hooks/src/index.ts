import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type AiCapability='AUDIT_SUMMARY'|'ERROR_EXPLANATION'|'TICKET_SUMMARY'|'TEMPLATE_RECOMMENDATION'|'PERMISSION_FIX_SUGGESTION'|'ANALYTICS_SUMMARY';
export type AiDataClass='PUBLIC'|'OPERATIONAL'|'ANALYTICS'|'USER_CONTENT'|'AUDIT'|'SECURITY'|'SECRET';
export interface AiHookRequest {guildId:string;actorId?:string;capability:AiCapability;input:Record<string,unknown>;inputClasses:AiDataClass[];correlationId:string;}
export interface AiHookResponse {summary:string;structured?:Record<string,unknown>;warnings?:string[];}
export interface AiProvider {key:string;capabilities:readonly AiCapability[];freeByDefault:boolean;egress?:'LOCAL'|'EXTERNAL';execute(request:AiHookRequest,signal:AbortSignal):Promise<AiHookResponse>;}

const secretKeyPattern=/(token|secret|password|credential|authorization|cookie|private[_-]?key|service[_-]?role)/i;
export function containsSecretLikeData(value:unknown,path='root'):string|undefined{
  if(!value||typeof value!=='object')return undefined;
  if(Array.isArray(value)){for(let i=0;i<value.length;i++){const found=containsSecretLikeData(value[i],`${path}[${i}]`);if(found)return found;}return undefined;}
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){if(secretKeyPattern.test(key))return `${path}.${key}`;const found=containsSecretLikeData(item,`${path}.${key}`);if(found)return found;}
  return undefined;
}
export function validateAiHookRequest(request:AiHookRequest):void{
  if(request.inputClasses.includes('SECRET'))throw new Error('AI_SECRET_DATA_FORBIDDEN');
  if(request.capability==='TICKET_SUMMARY'&&!request.inputClasses.includes('USER_CONTENT'))throw new Error('AI_TICKET_CONTENT_CLASS_REQUIRED');
  const secretPath=containsSecretLikeData(request.input);if(secretPath)throw new Error(`AI_SECRET_LIKE_FIELD_FORBIDDEN:${secretPath}`);
  const bytes=Buffer.byteLength(JSON.stringify(request.input));if(bytes>64*1024)throw new Error('AI_INPUT_TOO_LARGE');
}

export class AiProviderRegistry{
  private readonly providers=new Map<string,AiProvider>();
  register(provider:AiProvider){if(this.providers.has(provider.key))throw new Error('AI_PROVIDER_DUPLICATE');this.providers.set(provider.key,provider);}
  get(key:string){return this.providers.get(key);}
  list(){return [...this.providers.values()].map((provider)=>({key:provider.key,capabilities:[...provider.capabilities],freeByDefault:provider.freeByDefault,egress:provider.egress??'LOCAL'}));}
}

export class AiHookService{
  constructor(private readonly database:Database,private readonly registry:AiProviderRegistry,private readonly enabledProviders:ReadonlySet<string>,private readonly timeoutMs=8_000){}
  async run(input:Omit<AiHookRequest,'correlationId'> & {correlationId:string;providerKey:string}):Promise<AiHookResponse>{
    const request:AiHookRequest={guildId:input.guildId,actorId:input.actorId,capability:input.capability,input:input.input,inputClasses:input.inputClasses,correlationId:input.correlationId};validateAiHookRequest(request);
    if(!this.enabledProviders.has(input.providerKey))throw new Error('AI_PROVIDER_DISABLED');const provider=this.registry.get(input.providerKey);if(!provider)throw new Error('AI_PROVIDER_NOT_REGISTERED');if(!provider.capabilities.includes(input.capability))throw new Error('AI_CAPABILITY_UNSUPPORTED');if(provider.egress==='EXTERNAL'&&!input.actorId)throw new Error('AI_EXTERNAL_ACTOR_REQUIRED');
    const runId=randomUUID();const inputHash=createHash('sha256').update(JSON.stringify({capability:input.capability,input:input.input})).digest('hex');
    await this.database.requirePool().query(`insert into ai_hook_runs(run_id,guild_id,capability,provider_key,state,input_hash,input_classes,actor_id,correlation_id) values($1,$2,$3,$4,'RUNNING',$5,$6,$7,$8)`,[runId,input.guildId,input.capability,input.providerKey,inputHash,input.inputClasses,input.actorId??null,input.correlationId]);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1000,Math.min(30_000,this.timeoutMs)));const started=performance.now();
    try{const response=await provider.execute(request,controller.signal);const outputHash=createHash('sha256').update(JSON.stringify(response)).digest('hex');const duration=Math.round(performance.now()-started);await this.database.requirePool().query(`update ai_hook_runs set state='SUCCEEDED',output_hash=$2,duration_ms=$3,finished_at=now() where run_id=$1`,[runId,outputHash,duration]);return response;}
    catch(error){const aborted=controller.signal.aborted;const state=aborted?'TIMED_OUT':'FAILED';await this.database.requirePool().query(`update ai_hook_runs set state=$2,duration_ms=$3,error_code=$4,finished_at=now() where run_id=$1`,[runId,state,Math.round(performance.now()-started),aborted?'AI_PROVIDER_TIMEOUT':error instanceof Error?error.name:'AI_PROVIDER_ERROR']).catch(()=>undefined);throw error;}
    finally{clearTimeout(timer);}
  }
}

export function createRuleBasedAdvisorProvider():AiProvider{
  return {key:'local-rules',egress:'LOCAL',capabilities:['AUDIT_SUMMARY','ERROR_EXPLANATION','TEMPLATE_RECOMMENDATION','PERMISSION_FIX_SUGGESTION','ANALYTICS_SUMMARY'],freeByDefault:true,async execute(request){const facts=Object.entries(request.input).slice(0,12).map(([key,value])=>`${key}: ${typeof value==='object'?JSON.stringify(value):String(value)}`);return {summary:`${request.capability.replaceAll('_',' ')} · deterministic local advisor\n${facts.join('\n')}`.slice(0,4000),warnings:['This provider is a deterministic rules/formatting adapter, not a generative model.']};}};
}


export interface ExternalAiPolicy {
  allowedCapabilities: readonly AiCapability[];
  allowedDataClasses: readonly AiDataClass[];
  maxInputBytes: number;
  requireActorId: boolean;
}

export interface OpenAiResponsesProviderOptions {
  apiKey: string;
  model: string;
  allowedCapabilities: readonly AiCapability[];
  allowedDataClasses: readonly AiDataClass[];
  maxInputBytes?: number;
  fetchImpl?: typeof fetch;
}

const allCapabilities: readonly AiCapability[]=['AUDIT_SUMMARY','ERROR_EXPLANATION','TICKET_SUMMARY','TEMPLATE_RECOMMENDATION','PERMISSION_FIX_SUGGESTION','ANALYTICS_SUMMARY'];
const allDataClasses: readonly AiDataClass[]=['PUBLIC','OPERATIONAL','ANALYTICS','USER_CONTENT','AUDIT','SECURITY','SECRET'];

export function parseAiCapabilityAllowlist(value:string):AiCapability[]{
  const values=[...new Set(value.split(',').map((item)=>item.trim().toUpperCase()).filter(Boolean))];
  if(!values.length)throw new Error('AI_CAPABILITY_ALLOWLIST_REQUIRED');
  for(const item of values)if(!allCapabilities.includes(item as AiCapability))throw new Error(`AI_CAPABILITY_ALLOWLIST_INVALID:${item}`);
  return values as AiCapability[];
}

export function parseAiDataClassAllowlist(value:string):AiDataClass[]{
  const values=[...new Set(value.split(',').map((item)=>item.trim().toUpperCase()).filter(Boolean))];
  if(!values.length)throw new Error('AI_DATA_CLASS_ALLOWLIST_REQUIRED');
  for(const item of values)if(!allDataClasses.includes(item as AiDataClass))throw new Error(`AI_DATA_CLASS_ALLOWLIST_INVALID:${item}`);
  if(values.includes('SECRET'))throw new Error('AI_SECRET_DATA_CLASS_CANNOT_BE_ALLOWED');
  return values as AiDataClass[];
}

export function validateExternalAiRequest(request:AiHookRequest,policy:ExternalAiPolicy):void{
  if(policy.requireActorId&&!request.actorId)throw new Error('AI_EXTERNAL_ACTOR_REQUIRED');
  if(!policy.allowedCapabilities.includes(request.capability))throw new Error('AI_EXTERNAL_CAPABILITY_NOT_ALLOWED');
  for(const dataClass of request.inputClasses)if(!policy.allowedDataClasses.includes(dataClass))throw new Error(`AI_EXTERNAL_DATA_CLASS_NOT_ALLOWED:${dataClass}`);
  const bytes=Buffer.byteLength(JSON.stringify(request.input));
  if(bytes>policy.maxInputBytes)throw new Error('AI_EXTERNAL_INPUT_TOO_LARGE');
}

function validateProviderOptions(options:OpenAiResponsesProviderOptions):ExternalAiPolicy{
  if(!options.apiKey.trim())throw new Error('OPENAI_API_KEY_REQUIRED');
  if(!/^[A-Za-z0-9._:-]{1,160}$/.test(options.model))throw new Error('OPENAI_MODEL_INVALID');
  if(!options.allowedCapabilities.length)throw new Error('AI_CAPABILITY_ALLOWLIST_REQUIRED');
  if(!options.allowedDataClasses.length)throw new Error('AI_DATA_CLASS_ALLOWLIST_REQUIRED');
  if(options.allowedDataClasses.includes('SECRET'))throw new Error('AI_SECRET_DATA_CLASS_CANNOT_BE_ALLOWED');
  const maxInputBytes=options.maxInputBytes??16*1024;
  if(!Number.isInteger(maxInputBytes)||maxInputBytes<1024||maxInputBytes>64*1024)throw new Error('AI_EXTERNAL_MAX_INPUT_BYTES_INVALID');
  return {allowedCapabilities:[...new Set(options.allowedCapabilities)],allowedDataClasses:[...new Set(options.allowedDataClasses)],maxInputBytes,requireActorId:true};
}

function responseText(payload:unknown):string{
  const data=payload as {output?:Array<{content?:Array<{type?:string;text?:string}>}>};
  const parts=(data.output??[]).flatMap((item)=>item.content??[]).filter((part)=>part.type==='output_text'&&typeof part.text==='string').map((part)=>part.text!.trim()).filter(Boolean);
  return parts.join('\n').trim();
}

export function createOpenAiResponsesProvider(options:OpenAiResponsesProviderOptions):AiProvider{
  const policy=validateProviderOptions(options);const fetchImpl=options.fetchImpl??fetch;
  return {
    key:'openai-responses',
    capabilities:[...policy.allowedCapabilities],
    freeByDefault:false,
    egress:'EXTERNAL',
    async execute(request:AiHookRequest,signal:AbortSignal):Promise<AiHookResponse>{
      validateExternalAiRequest(request,policy);
      const prompt=JSON.stringify({capability:request.capability,input:request.input});
      const response=await fetchImpl('https://api.openai.com/v1/responses',{
        method:'POST',signal,
        headers:{'authorization':`Bearer ${options.apiKey}`,'content-type':'application/json'},
        body:JSON.stringify({model:options.model,store:false,input:[{role:'user',content:[{type:'input_text',text:`Analyze this authorized Discord platform operational payload and return concise guidance. Do not claim an action was executed.\n${prompt}`}]}]}),
      });
      if(!response.ok){const requestId=response.headers.get('x-request-id');throw new Error(`OPENAI_RESPONSES_HTTP_${response.status}${requestId?':REQUEST_ID_PRESENT':''}`);}
      const payload=await response.json();const text=responseText(payload);
      if(!text)throw new Error('OPENAI_RESPONSES_EMPTY_OUTPUT');
      return {summary:text.slice(0,4000),warnings:['External AI provider: authorized request data leaves the local platform boundary.']};
    },
  };
}
