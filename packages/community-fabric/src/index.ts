import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type FabricDomain = 'PROJECT' | 'MEMBER_CARE' | 'CONTENT' | 'EVENT';
export type FabricStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'ACTIVE' | 'BLOCKED' | 'COMPLETED' | 'RESOLVED' | 'REJECTED' | 'CANCELLED';
export type FabricVisibility = 'PRIVATE' | 'GUILD' | 'STAFF';

export interface FabricSubmission {
  domain: FabricDomain;
  title: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

const domains = new Set<FabricDomain>(['PROJECT','MEMBER_CARE','CONTENT','EVENT']);
const terminal = new Set<FabricStatus>(['COMPLETED','RESOLVED','REJECTED','CANCELLED']);
const transitions: Record<FabricStatus, readonly FabricStatus[]> = {
  OPEN: ['IN_REVIEW','APPROVED','ACTIVE','REJECTED','CANCELLED'],
  IN_REVIEW: ['APPROVED','ACTIVE','REJECTED','CANCELLED'],
  APPROVED: ['ACTIVE','COMPLETED','RESOLVED','CANCELLED'],
  ACTIVE: ['BLOCKED','COMPLETED','RESOLVED','CANCELLED'],
  BLOCKED: ['ACTIVE','CANCELLED'],
  COMPLETED: [], RESOLVED: [], REJECTED: [], CANCELLED: [],
};
const forbiddenMetadataKey = /(secret|password|passwd|token|api[_-]?key|cookie|session|payment|card|credit|bank)/i;

export function defaultFabricVisibility(domain: FabricDomain): FabricVisibility {
  return domain === 'MEMBER_CARE' ? 'PRIVATE' : 'GUILD';
}

export function validateFabricSubmission(input: FabricSubmission): Required<FabricSubmission> {
  if (!domains.has(input.domain)) throw new Error('FABRIC_DOMAIN_INVALID');
  const title=input.title.trim(); const summary=input.summary.trim();
  if (title.length < 3 || title.length > 100) throw new Error('FABRIC_TITLE_INVALID');
  if (summary.length < 10 || summary.length > 1500) throw new Error('FABRIC_SUMMARY_INVALID');
  const raw=input.metadata ?? {};
  const entries=Object.entries(raw);
  if (entries.length > 20) throw new Error('FABRIC_METADATA_TOO_LARGE');
  const metadata:Record<string,unknown>={};
  for (const [key,value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) || forbiddenMetadataKey.test(key)) throw new Error('FABRIC_METADATA_KEY_INVALID');
    if (!['string','number','boolean'].includes(typeof value) && value !== null) throw new Error('FABRIC_METADATA_VALUE_INVALID');
    if (typeof value === 'string' && value.length > 300) throw new Error('FABRIC_METADATA_VALUE_INVALID');
    metadata[key]=value;
  }
  return { domain:input.domain,title,summary,metadata };
}

export function transitionFabricStatus(current: FabricStatus, next: FabricStatus): FabricStatus {
  if (current === next) return current;
  if (terminal.has(current) || !transitions[current].includes(next)) throw new Error(`FABRIC_TRANSITION_INVALID:${current}->${next}`);
  return next;
}

export function fabricStatusIsPublic(status: FabricStatus): boolean {
  return ['APPROVED','ACTIVE','COMPLETED','RESOLVED'].includes(status);
}

export class CommunityFabricRepository {
  constructor(private readonly database: Database) {}
  private get pool(){ return this.database.requirePool(); }

  async create(input:{guildId:string;createdBy:string;correlationId:string;submission:FabricSubmission}){
    const clean=validateFabricSubmission(input.submission); const workId=randomUUID(); const visibility=defaultFabricVisibility(clean.domain);
    await this.database.transaction(async(client)=>{
      await client.query(`insert into community_fabric_work_items(work_id,guild_id,domain,status,visibility,created_by,title,summary,metadata,correlation_id) values($1,$2,$3,'OPEN',$4,$5,$6,$7,$8,$9)`,[workId,input.guildId,clean.domain,visibility,input.createdBy,clean.title,clean.summary,clean.metadata,input.correlationId]);
      await client.query(`insert into community_fabric_work_events(event_id,guild_id,work_id,actor_id,action,before_status,after_status,correlation_id) values($1,$2,$3,$4,'CREATE',null,'OPEN',$5)`,[randomUUID(),input.guildId,workId,input.createdBy,input.correlationId]);
    });
    return {workId,status:'OPEN' as const,visibility,domain:clean.domain,title:clean.title};
  }

  async listPublic(guildId:string,domain:FabricDomain,limit=10){
    const safe=Math.max(1,Math.min(20,limit));
    if(domain==='MEMBER_CARE') return [];
    const result=await this.pool.query<{work_id:string;domain:FabricDomain;status:FabricStatus;title:string;summary:string;updated_at:Date}>(`select work_id,domain,status,title,summary,updated_at from community_fabric_work_items where guild_id=$1 and domain=$2 and visibility='GUILD' and status in ('APPROVED','ACTIVE','COMPLETED','RESOLVED') order by updated_at desc limit $3`,[guildId,domain,safe]);
    return result.rows;
  }

  async listQueue(guildId:string,limit=12){
    const safe=Math.max(1,Math.min(25,limit));
    const result=await this.pool.query<{work_id:string;domain:FabricDomain;status:FabricStatus;created_by:string;assigned_to:string|null;title:string;created_at:Date}>(`select work_id,domain,status,created_by,assigned_to,title,created_at from community_fabric_work_items where guild_id=$1 and status in ('OPEN','IN_REVIEW','APPROVED','ACTIVE','BLOCKED') order by case status when 'OPEN' then 0 when 'IN_REVIEW' then 1 when 'BLOCKED' then 2 else 3 end,created_at asc limit $2`,[guildId,safe]);
    return result.rows;
  }

  async transition(input:{guildId:string;workId:string;actorId:string;next:FabricStatus;note?:string;correlationId:string}){
    return this.database.transaction(async(client)=>{
      const row=(await client.query<{status:FabricStatus;domain:FabricDomain;title:string}>(`select status,domain,title from community_fabric_work_items where guild_id=$1 and work_id=$2 for update`,[input.guildId,input.workId])).rows[0];
      if(!row) throw new Error('FABRIC_WORK_NOT_FOUND');
      const next=transitionFabricStatus(row.status,input.next);
      await client.query(`update community_fabric_work_items set status=$3,assigned_to=coalesce(assigned_to,$4),updated_at=now(),closed_at=case when $3 in ('COMPLETED','RESOLVED','REJECTED','CANCELLED') then now() else null end where guild_id=$1 and work_id=$2`,[input.guildId,input.workId,next,input.actorId]);
      await client.query(`insert into community_fabric_work_events(event_id,guild_id,work_id,actor_id,action,before_status,after_status,note,correlation_id) values($1,$2,$3,$4,'STATUS_CHANGE',$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.workId,input.actorId,row.status,next,input.note?.slice(0,500)??null,input.correlationId]);
      return {workId:input.workId,domain:row.domain,title:row.title,before:row.status,status:next};
    });
  }
}
