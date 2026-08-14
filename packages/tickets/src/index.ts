export type TicketType = 'GENERAL_SUPPORT' | 'TECHNICAL_SUPPORT' | 'REPORT_USER' | 'REPORT_BUG' | 'PARTNERSHIP' | 'APPLICATION' | 'PURCHASE_SUPPORT' | 'APPEAL';
export type TicketStatus = 'OPEN' | 'CLAIMED' | 'WAITING_USER' | 'WAITING_STAFF' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'ARCHIVED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

const ticketTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['CLAIMED', 'WAITING_STAFF', 'CLOSED'],
  CLAIMED: ['WAITING_USER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED'],
  WAITING_USER: ['CLAIMED', 'WAITING_STAFF', 'RESOLVED', 'CLOSED'],
  WAITING_STAFF: ['CLAIMED', 'WAITING_USER', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED', 'ARCHIVED'],
  REOPENED: ['CLAIMED', 'WAITING_STAFF', 'RESOLVED', 'CLOSED'],
  ARCHIVED: [],
};

export interface TicketState {
  status: TicketStatus;
  claimedBy?: string;
  participantIds: string[];
  priority: TicketPriority;
}

export function transitionTicket(state: TicketState, next: TicketStatus, actorId: string): TicketState {
  if (!ticketTransitions[state.status].includes(next)) throw new Error(`INVALID_TICKET_TRANSITION:${state.status}->${next}`);
  if (next === 'CLAIMED') return { ...state, status: next, claimedBy: actorId };
  if (next === 'ARCHIVED') return { ...state, status: next, participantIds: [] };
  return { ...state, status: next };
}

export function addTicketParticipant(state: TicketState, userId: string): TicketState {
  return state.participantIds.includes(userId) ? state : { ...state, participantIds: [...state.participantIds, userId] };
}

export function removeTicketParticipant(state: TicketState, userId: string): TicketState {
  return { ...state, participantIds: state.participantIds.filter((id) => id !== userId) };
}

export interface TicketVisibilityContext {
  openerId: string;
  participantIds: readonly string[];
  assignedStaffId?: string;
  staffRole: boolean;
}

export function canViewTicket(userId: string, context: TicketVisibilityContext): boolean {
  return userId === context.openerId || context.participantIds.includes(userId) || userId === context.assignedStaffId || context.staffRole;
}

import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export interface TicketRecord {
  ticketId: string;
  guildId: string;
  ticketNumber: number;
  openerUserId: string;
  ticketType: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  channelId?: string;
  subject?: string;
  assignedStaffId?: string;
  slaDueAt?: Date;
  firstStaffResponseAt?: Date;
}

export class TicketRepository {
  constructor(private readonly database: Database) {}

  async reserve(input: { guildId: string; openerUserId: string; ticketType: TicketType; priority?: TicketPriority; subject?: string; metadata?: Record<string, unknown> }): Promise<TicketRecord> {
    const client = await this.database.requirePool().connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`ticket-number:${input.guildId}`]);
      const { rows: numberRows } = await client.query<{ next_number: string }>('select (coalesce(max(ticket_number),0)+1)::text as next_number from tickets where guild_id=$1', [input.guildId]);
      const ticketNumber = Number(numberRows[0]?.next_number ?? '1');
      const ticketId = randomUUID();
      const priority = input.priority ?? 'NORMAL';
      const slaHours: Record<TicketPriority, number> = { LOW: 48, NORMAL: 24, HIGH: 4, URGENT: 1 };
      const { rows } = await client.query<any>(
        `insert into tickets(ticket_id,guild_id,ticket_number,opener_user_id,ticket_type,priority,status,subject,metadata,sla_due_at)
         values($1,$2,$3,$4,$5,$6,'OPEN',$7,$8,now()+make_interval(hours => $9)) returning *`,
        [ticketId, input.guildId, ticketNumber, input.openerUserId, input.ticketType, priority, input.subject ?? null, input.metadata ?? {}, slaHours[priority]],
      );
      await client.query('commit');
      return this.map(rows[0]);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async attachChannel(ticketId: string, channelId: string): Promise<void> {
    await this.database.requirePool().query('update tickets set channel_id=$2, updated_at=now() where ticket_id=$1', [ticketId, channelId]);
  }

  async get(ticketId: string): Promise<TicketRecord | null> {
    const { rows } = await this.database.requirePool().query<any>('select * from tickets where ticket_id=$1', [ticketId]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async setStatus(ticketId: string, status: TicketStatus, assignedStaffId?: string): Promise<TicketRecord> {
    const { rows } = await this.database.requirePool().query<any>(
      `update tickets set status=$2, assigned_staff_id=coalesce($3,assigned_staff_id),
       first_staff_response_at=case when $3 is not null then coalesce(first_staff_response_at,now()) else first_staff_response_at end,
       resolved_at=case when $2='RESOLVED' then coalesce(resolved_at,now()) else resolved_at end,
       closed_at=case when $2='CLOSED' then now() when $2='REOPENED' then null else closed_at end,
       archived_at=case when $2='ARCHIVED' then now() when $2='REOPENED' then null else archived_at end, updated_at=now() where ticket_id=$1 returning *`,
      [ticketId, status, assignedStaffId ?? null],
    );
    if(!rows[0]) throw new Error('TICKET_NOT_FOUND');
    return this.map(rows[0]);
  }

  async claim(ticketId: string, guildId: string, staffId: string): Promise<TicketRecord> {
    return this.database.transaction(async (client) => {
      const row = (await client.query<any>(`select * from tickets where ticket_id=$1 and guild_id=$2 for update`, [ticketId,guildId])).rows[0];
      if (!row) throw new Error('TICKET_NOT_FOUND');
      if (['CLOSED','ARCHIVED'].includes(row.status)) throw new Error('TICKET_NOT_CLAIMABLE');
      if (row.assigned_staff_id && row.assigned_staff_id !== staffId) throw new Error('TICKET_ALREADY_CLAIMED');
      await client.query(`update tickets set status='CLAIMED',assigned_staff_id=$3,first_staff_response_at=coalesce(first_staff_response_at,now()),updated_at=now() where ticket_id=$1 and guild_id=$2`, [ticketId,guildId,staffId]);
      return this.map({ ...row, status:'CLAIMED', assigned_staff_id:staffId, first_staff_response_at:row.first_staff_response_at ?? new Date() });
    });
  }

  async addParticipant(ticketId: string, guildId: string, userId: string, addedBy: string): Promise<void> {
    await this.database.requirePool().query(`insert into ticket_participants(ticket_id,guild_id,user_id,added_by) values($1,$2,$3,$4) on conflict(ticket_id,user_id) do nothing`, [ticketId,guildId,userId,addedBy]);
  }

  async removeParticipant(ticketId: string, guildId: string, userId: string): Promise<void> {
    await this.database.requirePool().query(`delete from ticket_participants where ticket_id=$1 and guild_id=$2 and user_id=$3`, [ticketId,guildId,userId]);
  }

  async listParticipants(ticketId: string, guildId: string): Promise<string[]> {
    const rows = await this.database.requirePool().query<{user_id:string}>(`select user_id from ticket_participants where ticket_id=$1 and guild_id=$2 order by created_at`, [ticketId,guildId]);
    return rows.rows.map((row) => row.user_id);
  }

  async listActive(guildId: string, limit = 50): Promise<TicketRecord[]> {
    const rows = await this.database.requirePool().query<any>(`select * from tickets where guild_id=$1 and status not in ('CLOSED','ARCHIVED') order by case priority when 'URGENT' then 1 when 'HIGH' then 2 when 'NORMAL' then 3 else 4 end, created_at asc limit $2`, [guildId,Math.max(1,Math.min(100,limit))]);
    return rows.rows.map((row) => this.map(row));
  }

  async remove(ticketId: string): Promise<void> {
    await this.database.requirePool().query('delete from tickets where ticket_id=$1 and channel_id is null', [ticketId]);
  }

  private map(row: any): TicketRecord {
    return { ticketId: row.ticket_id, guildId: row.guild_id, ticketNumber: Number(row.ticket_number), openerUserId: row.opener_user_id, ticketType: row.ticket_type,
      priority: row.priority, status: row.status, channelId: row.channel_id ?? undefined, subject: row.subject ?? undefined, assignedStaffId: row.assigned_staff_id ?? undefined,
      slaDueAt: row.sla_due_at ? new Date(row.sla_due_at) : undefined, firstStaffResponseAt: row.first_staff_response_at ? new Date(row.first_staff_response_at) : undefined };
  }
}
