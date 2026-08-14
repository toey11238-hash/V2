import { createHash } from 'node:crypto';
import type { Database } from '@autoserver/database';

export interface RateLimitPolicy { limit:number; windowMs:number; routeClass:string; }
export interface RateLimitResult { allowed:boolean; limit:number; remaining:number; resetAt:Date; count:number; }

export function mutationRateLimitPolicy(url:string):RateLimitPolicy{
  const normalized=url.split('?')[0]??url;
  const highRisk=/\/(restore|repair|change|plugins|integrations|feature-flags)/.test(normalized);
  const routeClass=highRisk?'high-risk-mutation':'mutation';
  return {limit:highRisk?30:120,windowMs:60_000,routeClass};
}

export function rateLimitSubjectHash(input:{actorId?:string;guildId?:string;ip?:string;routeClass?:string}):string{
  const identity=input.actorId?`actor:${input.actorId}`:`ip:${input.ip??'unknown'}`;
  return createHash('sha256').update(`${input.guildId??'global'}|${input.routeClass??'mutation'}|${identity}`).digest('hex');
}

export function fixedWindowStart(now:number,windowMs:number):number{return Math.floor(now/windowMs)*windowMs;}
export function evaluateFixedWindow(input:{count:number;limit:number;windowStart:number;windowMs:number}):RateLimitResult{
  const resetAt=new Date(input.windowStart+input.windowMs);
  return {allowed:input.count<=input.limit,limit:input.limit,remaining:Math.max(0,input.limit-input.count),resetAt,count:input.count};
}

interface LocalWindow { count:number; windowStart:number; lastSeen:number; }
export class InProcessMutationRateLimiter{
  private readonly windows=new Map<string,LocalWindow>();
  constructor(private readonly maxSubjects=20_000){}
  consume(subjectHash:string,policy:RateLimitPolicy,now=Date.now()):RateLimitResult{
    const windowStart=fixedWindowStart(now,policy.windowMs); const current=this.windows.get(subjectHash);
    const next:LocalWindow=!current||current.windowStart!==windowStart?{count:1,windowStart,lastSeen:now}:{count:current.count+1,windowStart,lastSeen:now};
    this.windows.set(subjectHash,next);
    if(this.windows.size>this.maxSubjects){const oldest=[...this.windows.entries()].sort((a,b)=>a[1].lastSeen-b[1].lastSeen).slice(0,Math.ceil(this.maxSubjects*0.1));for(const [key] of oldest)this.windows.delete(key);}
    return evaluateFixedWindow({count:next.count,limit:policy.limit,windowStart,windowMs:policy.windowMs});
  }
}

export class DurableMutationRateLimiter{
  constructor(private readonly database:Database){}
  async consume(guildId:string|undefined,subjectHash:string,policy:RateLimitPolicy,now=new Date()):Promise<RateLimitResult>{
    const windowStart=new Date(fixedWindowStart(now.getTime(),policy.windowMs));
    const {rows}=await this.database.requirePool().query<{request_count:number}>(`
      insert into http_rate_limit_windows(guild_id,subject_hash,window_start,window_ms,route_class,request_limit,request_count,last_seen_at)
      values($1,$2,$3,$4,$5,$6,1,$7)
      on conflict(guild_id,subject_hash,window_start,window_ms)
      do update set request_count=http_rate_limit_windows.request_count+1,route_class=excluded.route_class,request_limit=excluded.request_limit,last_seen_at=excluded.last_seen_at
      returning request_count`,[guildId??'global',subjectHash,windowStart,policy.windowMs,policy.routeClass,policy.limit,now]);
    const count=Number(rows[0]?.request_count??1);
    if(count%64===0) await this.database.requirePool().query(`delete from http_rate_limit_windows where last_seen_at<now()-interval '24 hours'`).catch(()=>undefined);
    return evaluateFixedWindow({count,limit:policy.limit,windowStart:windowStart.getTime(),windowMs:policy.windowMs});
  }
}

export function securityHeaders(dashboardOrigin?:string):Record<string,string>{
  const connectSrc=["'self'",'wss:','https:'];
  if(dashboardOrigin){try{const u=new URL(dashboardOrigin);connectSrc.push(u.origin);}catch{/* validated elsewhere */}}
  return {
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-resource-policy':'same-site',
    'content-security-policy':`default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; connect-src ${[...new Set(connectSrc)].join(' ')}`,
  };
}
