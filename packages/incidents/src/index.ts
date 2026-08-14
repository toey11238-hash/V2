import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MITIGATING' | 'MONITORING' | 'RESOLVED' | 'CLOSED';
export type IncidentKind = 'SECURITY' | 'PLATFORM' | 'DISCORD' | 'DATABASE' | 'INTEGRATION' | 'CONTENT' | 'OTHER';

export interface IncidentRecord {
  incidentId:string;
  guildId:string;
  kind:IncidentKind;
  severity:IncidentSeverity;
  status:IncidentStatus;
  title:string;
  summary:string;
  commanderId?:string;
  openedBy:string;
  correlationId:string;
  startedAt:string;
  resolvedAt?:string;
  closedAt?:string;
  createdAt:string;
  updatedAt:string;
}

const kinds = new Set<IncidentKind>(['SECURITY','PLATFORM','DISCORD','DATABASE','INTEGRATION','CONTENT','OTHER']);
const severities = new Set<IncidentSeverity>(['LOW','MEDIUM','HIGH','CRITICAL']);
const transitions:Record<IncidentStatus,readonly IncidentStatus[]>={
  OPEN:['INVESTIGATING','MITIGATING','RESOLVED'],
  INVESTIGATING:['MITIGATING','MONITORING','RESOLVED'],
  MITIGATING:['INVESTIGATING','MONITORING','RESOLVED'],
  MONITORING:['INVESTIGATING','MITIGATING','RESOLVED'],
  RESOLVED:['MONITORING','CLOSED'],
  CLOSED:[],
};

export function validateIncidentCreate(input:{kind:IncidentKind;severity:IncidentSeverity;title:string;summary:string}){
  if(!kinds.has(input.kind))throw new Error('INCIDENT_KIND_INVALID');
  if(!severities.has(input.severity))throw new Error('INCIDENT_SEVERITY_INVALID');
  const title=input.title.trim(); const summary=input.summary.trim();
  if(title.length<4||title.length>120)throw new Error('INCIDENT_TITLE_INVALID');
  if(summary.length<10||summary.length>3000)throw new Error('INCIDENT_SUMMARY_INVALID');
  return {...input,title,summary};
}

export function transitionIncidentStatus(current:IncidentStatus,next:IncidentStatus,note?:string):IncidentStatus{
  if(current===next)return current;
  if(!transitions[current].includes(next))throw new Error(`INCIDENT_TRANSITION_INVALID:${current}->${next}`);
  if((next==='RESOLVED'||next==='CLOSED')&&(!note||note.trim().length<8))throw new Error('INCIDENT_RESOLUTION_NOTE_REQUIRED');
  return next;
}

export function incidentNeedsIndependentReview(input:{severity:IncidentSeverity;status:IncidentStatus}):boolean{
  return input.severity==='CRITICAL' && ['RESOLVED','CLOSED'].includes(input.status);
}

function rowToIncident(row:any):IncidentRecord{
  const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value);
  return {
    incidentId:String(row.incident_id),guildId:String(row.guild_id),kind:row.kind as IncidentKind,severity:row.severity as IncidentSeverity,status:row.status as IncidentStatus,
    title:String(row.title),summary:String(row.summary),commanderId:row.commander_id??undefined,openedBy:String(row.opened_by),correlationId:String(row.correlation_id),
    startedAt:iso(row.started_at),resolvedAt:row.resolved_at?iso(row.resolved_at):undefined,closedAt:row.closed_at?iso(row.closed_at):undefined,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),
  };
}

export class IncidentRepository{
  constructor(private readonly database:Database){}
  private get pool(){return this.database.requirePool();}

  async create(input:{guildId:string;kind:IncidentKind;severity:IncidentSeverity;title:string;summary:string;openedBy:string;correlationId:string;commanderId?:string}):Promise<IncidentRecord>{
    const clean=validateIncidentCreate(input); const incidentId=randomUUID();
    return this.database.transaction(async(client)=>{
      const {rows}=await client.query<any>(`insert into operational_incidents(incident_id,guild_id,kind,severity,status,title,summary,commander_id,opened_by,correlation_id) values($1,$2,$3,$4,'OPEN',$5,$6,$7,$8,$9) returning *`,[incidentId,input.guildId,clean.kind,clean.severity,clean.title,clean.summary,input.commanderId??null,input.openedBy,input.correlationId]);
      await client.query(`insert into operational_incident_events(event_id,guild_id,incident_id,actor_id,event_type,after_state,note,correlation_id) values($1,$2,$3,$4,'CREATED',$5,$6,$7)`,[randomUUID(),input.guildId,incidentId,input.openedBy,{status:'OPEN',severity:clean.severity,kind:clean.kind},clean.summary.slice(0,1000),input.correlationId]);
      return rowToIncident(rows[0]);
    });
  }

  async get(guildId:string,incidentId:string):Promise<IncidentRecord|undefined>{
    const {rows}=await this.pool.query<any>(`select * from operational_incidents where guild_id=$1 and incident_id=$2`,[guildId,incidentId]);
    return rows[0]?rowToIncident(rows[0]):undefined;
  }

  async listOpen(guildId:string,limit=25):Promise<IncidentRecord[]>{
    const safe=Math.max(1,Math.min(100,Math.floor(limit)));
    const {rows}=await this.pool.query<any>(`select * from operational_incidents where guild_id=$1 and status<>'CLOSED' order by case severity when 'CRITICAL' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,started_at desc limit $2`,[guildId,safe]);
    return rows.map(rowToIncident);
  }

  async transition(input:{guildId:string;incidentId:string;actorId:string;next:IncidentStatus;note?:string;correlationId:string}):Promise<IncidentRecord>{
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from operational_incidents where guild_id=$1 and incident_id=$2 for update`,[input.guildId,input.incidentId])).rows[0];
      if(!row)throw new Error('INCIDENT_NOT_FOUND');
      const current=row.status as IncidentStatus; const next=transitionIncidentStatus(current,input.next,input.note);
      const {rows}=await client.query<any>(`update operational_incidents set status=$3,commander_id=coalesce(commander_id,$4),resolved_at=case when $3='RESOLVED' then coalesce(resolved_at,now()) when $3 in ('OPEN','INVESTIGATING','MITIGATING','MONITORING') then null else resolved_at end,closed_at=case when $3='CLOSED' then now() else null end,updated_at=now() where guild_id=$1 and incident_id=$2 returning *`,[input.guildId,input.incidentId,next,input.actorId]);
      await client.query(`insert into operational_incident_events(event_id,guild_id,incident_id,actor_id,event_type,before_state,after_state,note,correlation_id) values($1,$2,$3,$4,'STATUS_CHANGE',$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.incidentId,input.actorId,{status:current},{status:next},input.note?.trim().slice(0,1500)??null,input.correlationId]);
      return rowToIncident(rows[0]);
    });
  }

  async addNote(input:{guildId:string;incidentId:string;actorId:string;note:string;correlationId:string}):Promise<void>{
    const note=input.note.trim(); if(note.length<3||note.length>1500)throw new Error('INCIDENT_NOTE_INVALID');
    const result=await this.pool.query(`insert into operational_incident_events(event_id,guild_id,incident_id,actor_id,event_type,note,correlation_id) select $1,$2,$3,$4,'NOTE',$5,$6 where exists(select 1 from operational_incidents where guild_id=$2 and incident_id=$3)`,[randomUUID(),input.guildId,input.incidentId,input.actorId,note,input.correlationId]);
    if(!result.rowCount)throw new Error('INCIDENT_NOT_FOUND');
  }
}
