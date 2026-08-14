export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'REGISTRATION_OPEN' | 'CHECK_IN' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
export type RegistrationStatus = 'REGISTERED' | 'WAITLISTED' | 'CHECKED_IN' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED';

export interface EventRegistrationBook { capacity?: number; registered: string[]; waitlisted: string[]; }
export function registerForEvent(book: EventRegistrationBook, userId: string): { book: EventRegistrationBook; status: RegistrationStatus } {
  if (book.registered.includes(userId)) return { book, status: 'REGISTERED' };
  if (book.waitlisted.includes(userId)) return { book, status: 'WAITLISTED' };
  if (book.capacity === undefined || book.registered.length < book.capacity) {
    return { book: { ...book, registered: [...book.registered, userId] }, status: 'REGISTERED' };
  }
  return { book: { ...book, waitlisted: [...book.waitlisted, userId] }, status: 'WAITLISTED' };
}

export function cancelEventRegistration(book: EventRegistrationBook, userId: string): EventRegistrationBook {
  const registered = book.registered.filter((id) => id !== userId);
  const waitlisted = book.waitlisted.filter((id) => id !== userId);
  if (registered.length < book.registered.length && waitlisted.length > 0) {
    const [promoted, ...remaining] = waitlisted;
    return { ...book, registered: [...registered, promoted!], waitlisted: remaining };
  }
  return { ...book, registered, waitlisted };
}

import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export interface PersistedServerEvent {
  eventId: string;
  guildId: string;
  eventType: string;
  title: string;
  status: EventStatus;
  capacity?: number;
  startsAt: Date;
  endsAt?: Date;
  config: Record<string, unknown>;
  createdBy: string;
}

export class ServerEventRepository {
  constructor(private readonly database: Database) {}

  async create(input: { guildId:string; eventType:string; title:string; startsAt:Date; endsAt?:Date; capacity?:number; createdBy:string; config?:Record<string,unknown> }): Promise<PersistedServerEvent> {
    const title=input.title.trim();
    if(title.length<3 || title.length>100) throw new Error('INVALID_EVENT_TITLE');
    if(!Number.isFinite(input.startsAt.getTime()) || input.startsAt.getTime()<=Date.now()) throw new Error('INVALID_EVENT_START');
    if(input.endsAt && (!Number.isFinite(input.endsAt.getTime()) || input.endsAt<=input.startsAt)) throw new Error('INVALID_EVENT_END');
    if(input.capacity!==undefined && (!Number.isInteger(input.capacity) || input.capacity<1 || input.capacity>100000)) throw new Error('INVALID_EVENT_CAPACITY');
    const eventId=randomUUID();
    await this.database.requirePool().query(
      `insert into server_events(event_id,guild_id,event_type,title,status,capacity,starts_at,ends_at,config,created_by)
       values($1,$2,$3,$4,'REGISTRATION_OPEN',$5,$6,$7,$8,$9)`,
      [eventId,input.guildId,input.eventType.trim().toUpperCase().slice(0,40),title,input.capacity ?? null,input.startsAt,input.endsAt ?? null,input.config ?? {},input.createdBy],
    );
    return { eventId,guildId:input.guildId,eventType:input.eventType,title,status:'REGISTRATION_OPEN',capacity:input.capacity,startsAt:input.startsAt,endsAt:input.endsAt,config:input.config ?? {},createdBy:input.createdBy };
  }

  async get(guildId:string,eventId:string): Promise<PersistedServerEvent|null> {
    const row=(await this.database.requirePool().query<any>(`select * from server_events where guild_id=$1 and event_id=$2`,[guildId,eventId])).rows[0];
    return row ? { eventId:row.event_id,guildId:row.guild_id,eventType:row.event_type,title:row.title,status:row.status,capacity:row.capacity ?? undefined,startsAt:new Date(row.starts_at),endsAt:row.ends_at ? new Date(row.ends_at):undefined,config:row.config ?? {},createdBy:row.created_by } : null;
  }

  async registrationSummary(guildId:string,eventId:string): Promise<{ registered:number; waitlisted:number; checkedIn:number }> {
    const rows=await this.database.requirePool().query<{status:string;count:string}>(`select status,count(*)::text as count from event_registrations where guild_id=$1 and event_id=$2 group by status`,[guildId,eventId]);
    const counts: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const row of rows.rows) counts[row.status] = Number(row.count);
    return { registered:(counts.REGISTERED ?? 0)+(counts.CHECKED_IN ?? 0)+(counts.ATTENDED ?? 0),waitlisted:counts.WAITLISTED ?? 0,checkedIn:(counts.CHECKED_IN ?? 0)+(counts.ATTENDED ?? 0) };
  }

  async register(guildId:string,eventId:string,userId:string): Promise<RegistrationStatus> {
    return this.database.transaction(async(client)=>{
      const event=(await client.query<any>(`select * from server_events where guild_id=$1 and event_id=$2 for update`,[guildId,eventId])).rows[0];
      if(!event) throw new Error('EVENT_NOT_FOUND');
      if(!['REGISTRATION_OPEN','CHECK_IN'].includes(event.status)) throw new Error('EVENT_REGISTRATION_CLOSED');
      if(new Date(event.starts_at).getTime()<=Date.now() && event.status!=='CHECK_IN') throw new Error('EVENT_ALREADY_STARTED');
      const existing=(await client.query<any>(`select status from event_registrations where guild_id=$1 and event_id=$2 and user_id=$3`,[guildId,eventId,userId])).rows[0];
      if(existing && existing.status!=='CANCELLED') return existing.status as RegistrationStatus;
      const count=Number((await client.query<{count:string}>(`select count(*)::text as count from event_registrations where guild_id=$1 and event_id=$2 and status in ('REGISTERED','CHECKED_IN','ATTENDED')`,[guildId,eventId])).rows[0]?.count ?? 0);
      const status:RegistrationStatus=event.capacity==null || count<Number(event.capacity) ? 'REGISTERED':'WAITLISTED';
      await client.query(`insert into event_registrations(event_id,guild_id,user_id,status,registered_at,checked_in_at) values($1,$2,$3,$4,now(),null) on conflict(event_id,user_id) do update set status=excluded.status,registered_at=now(),checked_in_at=null`,[eventId,guildId,userId,status]);
      return status;
    });
  }

  async cancelRegistration(guildId:string,eventId:string,userId:string): Promise<void> {
    await this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select status from event_registrations where guild_id=$1 and event_id=$2 and user_id=$3 for update`,[guildId,eventId,userId])).rows[0];
      if(!row || row.status==='CANCELLED') return;
      const wasRegistered=['REGISTERED','CHECKED_IN','ATTENDED'].includes(row.status);
      await client.query(`update event_registrations set status='CANCELLED',checked_in_at=null where guild_id=$1 and event_id=$2 and user_id=$3`,[guildId,eventId,userId]);
      if(wasRegistered){
        const promoted=(await client.query<any>(`select user_id from event_registrations where guild_id=$1 and event_id=$2 and status='WAITLISTED' order by registered_at asc for update skip locked limit 1`,[guildId,eventId])).rows[0];
        if(promoted) await client.query(`update event_registrations set status='REGISTERED' where guild_id=$1 and event_id=$2 and user_id=$3`,[guildId,eventId,promoted.user_id]);
      }
    });
  }

  async checkIn(guildId:string,eventId:string,userId:string,now=new Date()): Promise<void> {
    await this.database.transaction(async(client)=>{
      const event=(await client.query<any>(`select * from server_events where guild_id=$1 and event_id=$2 for update`,[guildId,eventId])).rows[0];
      if(!event) throw new Error('EVENT_NOT_FOUND');
      const startsAt=new Date(event.starts_at).getTime();
      const endsAt=event.ends_at ? new Date(event.ends_at).getTime():startsAt+6*60*60_000;
      if(now.getTime()<startsAt-60*60_000 || now.getTime()>endsAt) throw new Error('EVENT_CHECKIN_WINDOW_CLOSED');
      const registration=(await client.query<any>(`select status from event_registrations where guild_id=$1 and event_id=$2 and user_id=$3 for update`,[guildId,eventId,userId])).rows[0];
      if(!registration || registration.status==='WAITLISTED' || registration.status==='CANCELLED') throw new Error('EVENT_REGISTRATION_REQUIRED');
      await client.query(`update event_registrations set status='CHECKED_IN',checked_in_at=coalesce(checked_in_at,now()) where guild_id=$1 and event_id=$2 and user_id=$3`,[guildId,eventId,userId]);
      if(event.status==='REGISTRATION_OPEN') await client.query(`update server_events set status='CHECK_IN',updated_at=now() where guild_id=$1 and event_id=$2`,[guildId,eventId]);
    });
  }
}
