import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type ApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'ARCHIVED';
export type SuggestionStatus = 'OPEN' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'IMPLEMENTED' | 'DUPLICATE' | 'ARCHIVED';
export type ReportStatus = 'OPEN' | 'TRIAGED' | 'INVESTIGATING' | 'ACTIONED' | 'CLOSED' | 'DISMISSED';
export type AnnouncementStatus = 'DRAFT' | 'REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';

const applicationTransitions: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW','WITHDRAWN'], UNDER_REVIEW: ['INTERVIEW','ACCEPTED','REJECTED','WITHDRAWN'],
  INTERVIEW: ['ACCEPTED','REJECTED','WITHDRAWN'], ACCEPTED: ['ARCHIVED'], REJECTED: ['ARCHIVED'], WITHDRAWN: ['ARCHIVED'], ARCHIVED: [],
};
const suggestionTransitions: Record<SuggestionStatus, readonly SuggestionStatus[]> = {
  OPEN: ['UNDER_REVIEW','DUPLICATE','ARCHIVED'], UNDER_REVIEW: ['ACCEPTED','REJECTED','DUPLICATE','ARCHIVED'],
  ACCEPTED: ['IMPLEMENTED','ARCHIVED'], REJECTED: ['ARCHIVED'], IMPLEMENTED: ['ARCHIVED'], DUPLICATE: ['ARCHIVED'], ARCHIVED: [],
};
const reportTransitions: Record<ReportStatus, readonly ReportStatus[]> = {
  OPEN: ['TRIAGED','DISMISSED'], TRIAGED: ['INVESTIGATING','DISMISSED'], INVESTIGATING: ['ACTIONED','CLOSED','DISMISSED'],
  ACTIONED: ['CLOSED'], CLOSED: [], DISMISSED: [],
};
const announcementTransitions: Record<AnnouncementStatus, readonly AnnouncementStatus[]> = {
  DRAFT: ['REVIEW','CANCELLED'], REVIEW: ['DRAFT','SCHEDULED','PUBLISHED','CANCELLED'], SCHEDULED: ['PUBLISHED','CANCELLED'],
  PUBLISHED: ['ARCHIVED'], CANCELLED: ['ARCHIVED'], ARCHIVED: [],
};

export function transitionApplication(status: ApplicationStatus, next: ApplicationStatus): ApplicationStatus {
  if (status === next) return status;
  if (!applicationTransitions[status].includes(next)) throw new Error(`Invalid application transition ${status} -> ${next}`);
  return next;
}
export function transitionSuggestion(status: SuggestionStatus, next: SuggestionStatus): SuggestionStatus {
  if (status === next) return status;
  if (!suggestionTransitions[status].includes(next)) throw new Error(`Invalid suggestion transition ${status} -> ${next}`);
  return next;
}
export function transitionReport(status: ReportStatus, next: ReportStatus): ReportStatus {
  if (status === next) return status;
  if (!reportTransitions[status].includes(next)) throw new Error(`Invalid report transition ${status} -> ${next}`);
  return next;
}
export function transitionAnnouncement(status: AnnouncementStatus, next: AnnouncementStatus): AnnouncementStatus {
  if (status === next) return status;
  if (!announcementTransitions[status].includes(next)) throw new Error(`Invalid announcement transition ${status} -> ${next}`);
  return next;
}

export function normalizeSuggestionVote(input: { upvoters: readonly string[]; downvoters: readonly string[] }, userId: string, vote: 'UP' | 'DOWN' | 'CLEAR') {
  const up = new Set(input.upvoters); const down = new Set(input.downvoters);
  up.delete(userId); down.delete(userId);
  if (vote === 'UP') up.add(userId);
  if (vote === 'DOWN') down.add(userId);
  return { upvoters: [...up], downvoters: [...down], score: up.size - down.size };
}

export class CommunityWorkflowRepository {
  constructor(private readonly database: Database) {}
  private get pool() { return this.database.requirePool(); }

  async createApplication(input: { guildId: string; userId: string; type: string; answers: Record<string, unknown> }) {
    const id = randomUUID();
    await this.pool.query(`insert into applications(application_id,guild_id,applicant_user_id,application_type,status,answers) values($1,$2,$3,$4,'SUBMITTED',$5)`, [id,input.guildId,input.userId,input.type,input.answers]);
    return id;
  }
  async createSuggestion(input: { guildId: string; userId: string; content: string }) {
    const id = randomUUID();
    await this.pool.query(`insert into suggestions(suggestion_id,guild_id,author_user_id,status,content) values($1,$2,$3,'OPEN',$4)`, [id,input.guildId,input.userId,input.content]);
    return id;
  }
  async voteSuggestion(input: { suggestionId: string; guildId: string; userId: string; vote: 'UP'|'DOWN'|'CLEAR' }) {
    return this.database.transaction(async (client) => {
      const row = (await client.query<{upvoter_ids:string[];downvoter_ids:string[]}>(`select upvoter_ids,downvoter_ids from suggestions where suggestion_id=$1 and guild_id=$2 for update`, [input.suggestionId,input.guildId])).rows[0];
      if (!row) throw new Error('Suggestion not found');
      const next = normalizeSuggestionVote({ upvoters: row.upvoter_ids, downvoters: row.downvoter_ids }, input.userId, input.vote);
      await client.query(`update suggestions set upvoter_ids=$3,downvoter_ids=$4,updated_at=now() where suggestion_id=$1 and guild_id=$2`, [input.suggestionId,input.guildId,next.upvoters,next.downvoters]);
      return next;
    });
  }
  async createReport(input: { guildId: string; reporterId: string; subjectUserId?: string; type: string; priority: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; detail: string; evidence?: unknown[] }) {
    const id = randomUUID();
    await this.pool.query(`insert into reports(report_id,guild_id,reporter_user_id,subject_user_id,report_type,priority,status,detail,evidence) values($1,$2,$3,$4,$5,$6,'OPEN',$7,$8)`, [id,input.guildId,input.reporterId,input.subjectUserId ?? null,input.type,input.priority,input.detail,input.evidence ?? []]);
    return id;
  }
  async createAnnouncement(input: { guildId: string; createdBy: string; title: string; body: string; target: Record<string,unknown>; scheduledAt?: Date }) {
    const id = randomUUID();
    await this.pool.query(`insert into announcements(announcement_id,guild_id,status,title,body,target,scheduled_at,created_by) values($1,$2,'DRAFT',$3,$4,$5,$6,$7)`, [id,input.guildId,input.title,input.body,input.target,input.scheduledAt ?? null,input.createdBy]);
    return id;
  }

  async staffQueue(guildId: string, limit = 10) {
    const safeLimit=Math.max(1,Math.min(25,limit));
    const [applications,reports,suggestions,announcements]=await Promise.all([
      this.pool.query<any>(`select application_id,applicant_user_id,application_type,status,assigned_staff_id,created_at from applications where guild_id=$1 and status in ('SUBMITTED','UNDER_REVIEW','INTERVIEW') order by created_at asc limit $2`,[guildId,safeLimit]),
      this.pool.query<any>(`select report_id,reporter_user_id,subject_user_id,report_type,priority,status,assigned_staff_id,created_at from reports where guild_id=$1 and status in ('OPEN','TRIAGED','INVESTIGATING','ACTIONED') order by case priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,created_at asc limit $2`,[guildId,safeLimit]),
      this.pool.query<any>(`select suggestion_id,author_user_id,status,content,cardinality(upvoter_ids)-cardinality(downvoter_ids) as score,created_at from suggestions where guild_id=$1 and status in ('OPEN','UNDER_REVIEW','ACCEPTED') order by score desc,created_at asc limit $2`,[guildId,safeLimit]),
      this.pool.query<any>(`select announcement_id,status,title,created_by,scheduled_at,created_at from announcements where guild_id=$1 and status in ('DRAFT','REVIEW','SCHEDULED') order by created_at asc limit $2`,[guildId,safeLimit]),
    ]);
    return { applications:applications.rows,reports:reports.rows,suggestions:suggestions.rows,announcements:announcements.rows };
  }

  async reviewApplication(input: { guildId:string; applicationId:string; staffId:string; next:ApplicationStatus; reason?:string }) {
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from applications where guild_id=$1 and application_id=$2 for update`,[input.guildId,input.applicationId])).rows[0];
      if(!row) throw new Error('APPLICATION_NOT_FOUND');
      const next=transitionApplication(row.status as ApplicationStatus,input.next);
      await client.query(`update applications set status=$3,assigned_staff_id=$4,decision_reason=$5,updated_at=now() where guild_id=$1 and application_id=$2`,[input.guildId,input.applicationId,next,input.staffId,input.reason ?? null]);
      await client.query(`insert into workflow_events(workflow_event_id,guild_id,workflow_type,workflow_id,actor_id,action,before_state,after_state,correlation_id) values($1,$2,'APPLICATION',$3,$4,$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.applicationId,input.staffId,`STATUS_${next}`,{status:row.status},{status:next,reason:input.reason ?? null},randomUUID()]);
      return next;
    });
  }

  async reviewReport(input: { guildId:string; reportId:string; staffId:string; next:ReportStatus }) {
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from reports where guild_id=$1 and report_id=$2 for update`,[input.guildId,input.reportId])).rows[0];
      if(!row) throw new Error('REPORT_NOT_FOUND');
      const next=transitionReport(row.status as ReportStatus,input.next);
      await client.query(`update reports set status=$3,assigned_staff_id=$4,updated_at=now() where guild_id=$1 and report_id=$2`,[input.guildId,input.reportId,next,input.staffId]);
      await client.query(`insert into workflow_events(workflow_event_id,guild_id,workflow_type,workflow_id,actor_id,action,before_state,after_state,correlation_id) values($1,$2,'REPORT',$3,$4,$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.reportId,input.staffId,`STATUS_${next}`,{status:row.status},{status:next},randomUUID()]);
      return next;
    });
  }

  async reviewSuggestion(input: { guildId:string; suggestionId:string; staffId:string; next:SuggestionStatus; reason?:string }) {
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from suggestions where guild_id=$1 and suggestion_id=$2 for update`,[input.guildId,input.suggestionId])).rows[0];
      if(!row) throw new Error('SUGGESTION_NOT_FOUND');
      const next=transitionSuggestion(row.status as SuggestionStatus,input.next);
      await client.query(`update suggestions set status=$3,staff_reason=$4,updated_at=now() where guild_id=$1 and suggestion_id=$2`,[input.guildId,input.suggestionId,next,input.reason ?? null]);
      await client.query(`insert into workflow_events(workflow_event_id,guild_id,workflow_type,workflow_id,actor_id,action,before_state,after_state,correlation_id) values($1,$2,'SUGGESTION',$3,$4,$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.suggestionId,input.staffId,`STATUS_${next}`,{status:row.status},{status:next,reason:input.reason ?? null},randomUUID()]);
      return next;
    });
  }

  async submitAnnouncementForReview(input:{guildId:string;announcementId:string;actorId:string}) {
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from announcements where guild_id=$1 and announcement_id=$2 for update`,[input.guildId,input.announcementId])).rows[0];
      if(!row) throw new Error('ANNOUNCEMENT_NOT_FOUND');
      const next=transitionAnnouncement(row.status as AnnouncementStatus,'REVIEW');
      await client.query(`update announcements set status=$3,updated_at=now() where guild_id=$1 and announcement_id=$2`,[input.guildId,input.announcementId,next]);
      await client.query(`insert into workflow_events(workflow_event_id,guild_id,workflow_type,workflow_id,actor_id,action,before_state,after_state,correlation_id) values($1,$2,'ANNOUNCEMENT',$3,$4,'SUBMIT_REVIEW',$5,$6,$7)`,[randomUUID(),input.guildId,input.announcementId,input.actorId,{status:row.status},{status:next},randomUUID()]);
      return { status:next,createdBy:String(row.created_by),scheduledAt:row.scheduled_at ? new Date(row.scheduled_at) : undefined };
    });
  }

  async approveAnnouncement(input:{guildId:string;announcementId:string;approverId:string;mode:'SCHEDULE'|'PUBLISH'}) {
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from announcements where guild_id=$1 and announcement_id=$2 for update`,[input.guildId,input.announcementId])).rows[0];
      if(!row) throw new Error('ANNOUNCEMENT_NOT_FOUND');
      if(String(row.created_by)===input.approverId) throw new Error('SECOND_OPERATOR_REQUIRED');
      if(row.status!=='REVIEW') throw new Error(`ANNOUNCEMENT_NOT_IN_REVIEW:${row.status}`);
      if(input.mode==='SCHEDULE' && (!row.scheduled_at || new Date(row.scheduled_at).getTime()<=Date.now())) throw new Error('ANNOUNCEMENT_SCHEDULE_REQUIRED');
      const next:AnnouncementStatus=input.mode==='SCHEDULE' ? transitionAnnouncement(row.status as AnnouncementStatus,'SCHEDULED') : 'REVIEW';
      await client.query(`update announcements set status=$3,approved_by=$4,updated_at=now() where guild_id=$1 and announcement_id=$2`,[input.guildId,input.announcementId,next,input.approverId]);
      await client.query(`insert into workflow_events(workflow_event_id,guild_id,workflow_type,workflow_id,actor_id,action,before_state,after_state,correlation_id) values($1,$2,'ANNOUNCEMENT',$3,$4,$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.announcementId,input.approverId,`APPROVE_${input.mode}`,{status:row.status},{status:next,approvedBy:input.approverId},randomUUID()]);
      return { status:next,scheduledAt:row.scheduled_at ? new Date(row.scheduled_at) : undefined,title:String(row.title),body:String(row.body),target:row.target ?? {} };
    });
  }

  async markAnnouncementPublished(input:{guildId:string;announcementId:string;messageId:string;actorId:string}) {
    await this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select status from announcements where guild_id=$1 and announcement_id=$2 for update`,[input.guildId,input.announcementId])).rows[0];
      if(!row) throw new Error('ANNOUNCEMENT_NOT_FOUND');
      if(!['REVIEW','SCHEDULED'].includes(row.status)) throw new Error(`ANNOUNCEMENT_NOT_PUBLISHABLE:${row.status}`);
      const next=transitionAnnouncement(row.status as AnnouncementStatus,'PUBLISHED');
      await client.query(`update announcements set status=$3,published_at=now(),published_message_id=$4,updated_at=now() where guild_id=$1 and announcement_id=$2`,[input.guildId,input.announcementId,next,input.messageId]);
      await client.query(`insert into workflow_events(workflow_event_id,guild_id,workflow_type,workflow_id,actor_id,action,before_state,after_state,correlation_id) values($1,$2,'ANNOUNCEMENT',$3,$4,'PUBLISH',$5,$6,$7)`,[randomUUID(),input.guildId,input.announcementId,input.actorId,{status:row.status},{status:next,messageId:input.messageId},randomUUID()]);
    });
  }
}
