import type { Database } from '@autoserver/database';
import { CreatorRepository } from '@autoserver/creator';
import { EducationRepository } from '@autoserver/education';
import { BusinessRepository } from '@autoserver/business';
import { ScheduledTaskRepository, computeReminderInstants, parseScheduleInstant } from '@autoserver/scheduler';

export interface CreatorScheduleResult {
  contentId:string;
  runAt:Date;
  channelKey:string;
  taskId:string;
}

export interface MentorScheduleResult {
  requestId:string;
  runAt:Date;
  timezone:string;
  reminderTaskIds:string[];
}

export class VerticalOpsService {
  private readonly creators:CreatorRepository;
  private readonly education:EducationRepository;
  private readonly business:BusinessRepository;
  private readonly scheduler:ScheduledTaskRepository;

  constructor(private readonly database:Database) {
    this.creators=new CreatorRepository(database);
    this.education=new EducationRepository(database);
    this.business=new BusinessRepository(database);
    this.scheduler=new ScheduledTaskRepository(database);
  }

  async reviewCreator(input:{guildId:string;contentId:string;actorId:string;decision:'APPROVED'|'REJECTED';reason?:string}) {
    const current=await this.creators.get(input.guildId,input.contentId);
    if(!current) throw new Error('CREATOR_CONTENT_NOT_FOUND');
    await this.creators.review({guildId:input.guildId,contentId:input.contentId,reviewerUserId:input.actorId,decision:input.decision,reason:input.reason});
    return {beforeStatus:String(current.status),status:input.decision};
  }

  async scheduleCreator(input:{guildId:string;contentId:string;runAt:string|number;channelKey:string;timezone:string;now?:Date}):Promise<CreatorScheduleResult> {
    const runAt=parseScheduleInstant(input.runAt,input.now??new Date(),365);
    await this.creators.schedulePublish({guildId:input.guildId,contentId:input.contentId,runAt,channelKey:input.channelKey});
    try {
      const taskId=await this.scheduler.schedule({guildId:input.guildId,taskType:'CREATOR_CONTENT_PUBLISH',runAt,timezone:input.timezone,dedupKey:`creator-content:${input.contentId}`,payload:{contentId:input.contentId}});
      return {contentId:input.contentId,runAt,channelKey:input.channelKey.trim().toUpperCase(),taskId};
    } catch(error) {
      const compensated=await this.creators.cancelScheduledPublish({guildId:input.guildId,contentId:input.contentId}).catch(()=>false);
      const failure=new Error(compensated?'CREATOR_SCHEDULE_TASK_FAILED_COMPENSATED':'CREATOR_SCHEDULE_PARTIAL_FAILURE');
      (failure as Error & {cause?:unknown}).cause=error; throw failure;
    }
  }

  async cancelCreatorSchedule(input:{guildId:string;contentId:string}):Promise<{cancelled:boolean;taskCancelled:boolean}> {
    // Durable domain state is cleared first. If a scheduler task was already claimed,
    // the worker re-reads scheduled_at and becomes a no-op rather than publishing stale intent.
    const cancelled=await this.creators.cancelScheduledPublish({guildId:input.guildId,contentId:input.contentId});
    const taskCancelled=await this.scheduler.cancelScheduledByDedup(input.guildId,'CREATOR_CONTENT_PUBLISH',`creator-content:${input.contentId}`);
    return {cancelled,taskCancelled};
  }

  async scheduleMentor(input:{guildId:string;requestId:string;runAt:string|number;timezone:string;now?:Date;reminderMinutes?:readonly number[]}):Promise<MentorScheduleResult> {
    const runAt=parseScheduleInstant(input.runAt,input.now??new Date(),365);
    const row=await this.education.getMentorRequest(input.guildId,input.requestId);
    if(!row) throw new Error('MENTOR_REQUEST_NOT_FOUND');
    if(row.status!=='CLAIMED'||!row.mentor_user_id) throw new Error('MENTOR_REQUEST_NOT_SCHEDULABLE');
    await this.education.scheduleMentorRequest({guildId:input.guildId,requestId:input.requestId,scheduledAt:runAt,timezone:input.timezone});
    const reminderTaskIds:string[]=[]; const reminderDedups:string[]=[];
    try {
      for(const reminderAt of computeReminderInstants(runAt,input.reminderMinutes??[60,10])) {
        if(reminderAt.getTime()<=(input.now??new Date()).getTime()+5_000) continue;
        const offsetMinutes=Math.round((runAt.getTime()-reminderAt.getTime())/60_000); const dedupKey=`mentor-reminder:${input.requestId}:${offsetMinutes}`;
        reminderDedups.push(dedupKey); reminderTaskIds.push(await this.scheduler.schedule({guildId:input.guildId,taskType:'MENTOR_SESSION_REMINDER',runAt:reminderAt,timezone:input.timezone,dedupKey,payload:{requestId:input.requestId,offsetMinutes}}));
      }
      return {requestId:input.requestId,runAt,timezone:input.timezone,reminderTaskIds};
    } catch(error) {
      await Promise.all(reminderDedups.map((dedupKey)=>this.scheduler.cancelByDedup(input.guildId,'MENTOR_SESSION_REMINDER',dedupKey).catch(()=>undefined)));
      const compensated=await this.education.cancelMentorSchedule({guildId:input.guildId,requestId:input.requestId}).catch(()=>false);
      const failure=new Error(compensated?'MENTOR_SCHEDULE_TASK_FAILED_COMPENSATED':'MENTOR_SCHEDULE_PARTIAL_FAILURE');
      (failure as Error & {cause?:unknown}).cause=error; throw failure;
    }
  }

  async completeMentor(input:{guildId:string;requestId:string;actorId:string;manager:boolean}):Promise<void> {
    await this.education.completeMentorRequest({guildId:input.guildId,requestId:input.requestId,actorUserId:input.actorId,manager:input.manager});
  }

  async claimBusinessSupport(input:{guildId:string;supportRefId:string;actorId:string}):Promise<void> {
    await this.business.claimSupport({guildId:input.guildId,supportRefId:input.supportRefId,staffId:input.actorId});
  }

  async resolveBusinessSupport(input:{guildId:string;supportRefId:string;actorId:string;next:'RESOLVED'|'CLOSED'}):Promise<void> {
    await this.business.resolveSupport({guildId:input.guildId,supportRefId:input.supportRefId,staffId:input.actorId,next:input.next});
  }
}
