import { randomUUID } from 'node:crypto';
import { ChannelType, type Client } from 'discord.js';
import type { AppConfig } from '@autoserver/config';
import type { Database } from '@autoserver/database';
import { BackupSnapshotRepository, GrowthAssessmentRepository, GuildConfigRepository, MaintenanceWindowRepository, ResourceMappingRepository } from '@autoserver/database';
import { ScheduledTaskRepository, localDateKey, nextLocalTime, nextLocalWeekdayTime, type PersistedScheduledTask } from '@autoserver/scheduler';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';
import { TicketRepository } from '@autoserver/tickets';
import { createAndStoreTicketTranscript } from '../discord/ticket-actions.js';
import { AnalyticsService } from '@autoserver/analytics';
import { RecommendationService, recommendFromDailyMetrics } from '@autoserver/recommendations';
import { NotificationRepository, evaluateNotification, type NotificationTopic } from '@autoserver/notifications';
import { captureManagedDiscordBackup } from './discord-backup-snapshot.js';
import { GiveawayRepository } from '@autoserver/giveaways';
import { assessGrowth } from '@autoserver/growth';
import { SharedDatabaseCache } from '@autoserver/cache';
import { GamingRepository } from '@autoserver/gaming';
import { CreatorRepository } from '@autoserver/creator';
import { EducationRepository } from '@autoserver/education';
import { WebhookDeliveryRepository, IntegrationControlRepository, IntegrationSyncRepository, createDefaultIntegrationRegistry } from '@autoserver/integrations';
import { v2NoticePanel } from '@autoserver/panels';
import { ResourceBudgetRepository } from '@autoserver/budgets';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { presentSystemValue } from '@autoserver/localization';

export interface ScheduledWorkerDependencies { client: Client; config: AppConfig; database: Database; bus: EventBus; }

export class ScheduledWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  private pollCount = 0;
  private readonly workerId = `scheduled:${randomUUID()}`;
  private readonly tasks: ScheduledTaskRepository;
  constructor(private readonly deps: ScheduledWorkerDependencies) { this.tasks = new ScheduledTaskRepository(deps.database); }

  start(): void {
    if (this.timer || !this.deps.database.configured) return;
    const tick = () => void this.poll().catch((error) => console.error('[scheduler-poll-error]', error));
    tick(); this.timer = setInterval(tick, this.deps.config.SCHEDULER_POLL_INTERVAL_MS); this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  healthSnapshot(){ return { active:Boolean(this.timer), busy:this.running, workerId:this.workerId }; }

  private async poll(): Promise<void> {
    if (this.running || !this.deps.client.isReady()) return;
    this.running = true;
    try {
      const recovered=await this.tasks.recoverStale(5);
      if(recovered.requeued||recovered.failed) await this.deps.bus.publish(makeEvent({type:'scheduler.stale.recovered',correlationId:newCorrelationId(),payload:recovered}));
      this.pollCount+=1; if(this.pollCount===1||this.pollCount%30===0){await this.reconcileVerticalSchedules();await this.reconcilePrivacyExportExpiry();await this.reconcileStaleRetentionRuns();}
      for (const task of await this.tasks.claimDue(12,this.workerId,120)) await this.runTask(task);
    } finally { this.running = false; }
  }

  private async reconcileVerticalSchedules():Promise<void> {
    const pool=this.deps.database.requirePool(); const now=new Date(); let created=0;
    const creators=(await pool.query<any>(`select guild_id,content_id,scheduled_at from creator_content_items where status='APPROVED' and scheduled_at is not null order by scheduled_at asc limit 100`)).rows;
    for(const row of creators){const runAt=new Date(Math.max(now.getTime(),new Date(row.scheduled_at).getTime()));const result=await this.tasks.ensureScheduled({guildId:String(row.guild_id),taskType:'CREATOR_CONTENT_PUBLISH',runAt,timezone:'UTC',dedupKey:`creator-content:${row.content_id}`,payload:{contentId:String(row.content_id)}});if(result.created)created+=1;}
    const mentors=(await pool.query<any>(`select guild_id,mentor_request_id,scheduled_at,timezone from mentor_requests where status='SCHEDULED' and scheduled_at>now() order by scheduled_at asc limit 100`)).rows;
    for(const row of mentors){const scheduledAt=new Date(row.scheduled_at);for(const reminderAt of [60,10].map((minutes)=>({minutes,at:new Date(scheduledAt.getTime()-minutes*60_000)})).filter((item)=>item.at.getTime()>now.getTime()+5_000)){const result=await this.tasks.ensureScheduled({guildId:String(row.guild_id),taskType:'MENTOR_SESSION_REMINDER',runAt:reminderAt.at,timezone:String(row.timezone??'UTC'),dedupKey:`mentor-reminder:${row.mentor_request_id}:${reminderAt.minutes}`,payload:{requestId:String(row.mentor_request_id),offsetMinutes:reminderAt.minutes}});if(result.created)created+=1;}}
    const support=(await pool.query<any>(`select guild_id,support_ref_id,sla_due_at from business_support_refs where status in ('OPEN','CLAIMED') and sla_due_at is not null and sla_alerted_at is null order by sla_due_at asc limit 100`)).rows;
    for(const row of support){const runAt=new Date(Math.max(now.getTime(),new Date(row.sla_due_at).getTime()));const result=await this.tasks.ensureScheduled({guildId:String(row.guild_id),taskType:'BUSINESS_SUPPORT_SLA_CHECK',runAt,timezone:'UTC',dedupKey:`business-support-sla:${row.support_ref_id}`,payload:{supportRefId:String(row.support_ref_id)}});if(result.created)created+=1;}
    if(created>0)await this.deps.bus.publish(makeEvent({type:'scheduler.vertical.reconciled',correlationId:newCorrelationId(),source:'scheduler',payload:{created}}));
  }

  private async reconcilePrivacyExportExpiry():Promise<void> {
    const pool=this.deps.database.requirePool(); const now=new Date(); let recovered=0;
    const stale=await pool.query(`update data_export_requests r set status='FAILED',artifact_ref=null,finished_at=coalesce(finished_at,now()) where r.status='RUNNING' and r.created_at<now()-interval '15 minutes' and not exists(select 1 from data_export_artifacts a where a.request_id=r.request_id and a.guild_id=r.guild_id) returning r.request_id`);
    const privacyExports=(await pool.query<any>(`select a.artifact_id,a.request_id,a.guild_id,a.expires_at from data_export_artifacts a join data_export_requests r on r.request_id=a.request_id and r.guild_id=a.guild_id where r.status='SUCCEEDED' order by a.expires_at asc limit 100`)).rows;
    for(const row of privacyExports){const runAt=new Date(Math.max(now.getTime(),new Date(row.expires_at).getTime()));const result=await this.tasks.ensureScheduledRecoverable({guildId:String(row.guild_id),taskType:'PRIVACY_EXPORT_EXPIRE',runAt,timezone:'UTC',dedupKey:`privacy-export:${row.artifact_id}`,payload:{artifactId:String(row.artifact_id),requestId:String(row.request_id)}});if(result.created||result.revived)recovered+=1;}
    const failedRequests=stale.rowCount??0;
    if(recovered>0||failedRequests>0)await this.deps.bus.publish(makeEvent({type:'scheduler.privacy_export_expiry.reconciled',correlationId:newCorrelationId(),source:'scheduler',payload:{expiryTasksRecovered:recovered,staleRequestsFailed:failedRequests}}));
  }

  private async reconcileStaleRetentionRuns():Promise<void> {
    const pool=this.deps.database.requirePool();
    const guilds=(await pool.query<{guild_id:string}>(`select distinct guild_id from retention_runs where status='RUNNING' and created_at<now()-interval '30 minutes' order by guild_id limit 100`)).rows;
    let failed=0;
    for(const row of guilds){
      failed+=await this.deps.database.transaction(async(client)=>{
        const lock=(await client.query<{acquired:boolean}>(`select pg_try_advisory_xact_lock(hashtext($1)) as acquired`,[`autoserver:retention:${row.guild_id}`])).rows[0];
        if(!lock?.acquired)return 0;
        const result=await client.query(`update retention_runs set status='FAILED',error_code='RETENTION_RUN_STALE_RECONCILED',finished_at=coalesce(finished_at,now()) where guild_id=$1 and status='RUNNING' and created_at<now()-interval '30 minutes'`,[row.guild_id]);
        return result.rowCount??0;
      });
    }
    if(failed>0)await this.deps.bus.publish(makeEvent({type:'scheduler.retention_runs.reconciled',correlationId:newCorrelationId(),source:'scheduler',payload:{staleRunsFailed:failed}}));
  }

  private async runTask(task: PersistedScheduledTask): Promise<void> {
    const correlationId = newCorrelationId();
    await this.tasks.markRunning(task.taskId,this.workerId);
    const heartbeat=setInterval(()=>void this.tasks.renewLease(task.taskId,this.workerId,120).catch(()=>undefined),30_000);
    await this.deps.bus.publish(makeEvent({ type: 'scheduler.task.started', guildId: task.guildId, correlationId, payload: { taskId: task.taskId, taskType: task.taskType, attempts: task.attempts } }));
    try {
      if (task.taskType === 'ANNOUNCEMENT_PUBLISH') await this.publishAnnouncement(task);
      else if (task.taskType === 'EVENT_REMINDER') await this.sendEventReminder(task);
      else if (task.taskType === 'TEMP_ROLE_EXPIRE') await this.expireTemporaryRole(task);
      else if (task.taskType === 'TEMP_ROLE_WARN') await this.warnTemporaryRole(task);
      else if (task.taskType === 'NOTIFICATION_FANOUT') await this.notificationFanout(task);
      else if (task.taskType === 'NOTIFICATION_DELIVER') await this.deliverNotification(task);
      else if (task.taskType === 'BACKUP_SCHEDULED') await this.runScheduledBackup(task);
      else if (task.taskType === 'TEMP_VOICE_CLEANUP') await this.cleanupTemporaryVoice(task);
      else if (task.taskType === 'TICKET_SLA_CHECK') await this.checkTicketSla(task);
      else if (task.taskType === 'TICKET_ARCHIVE') await this.archiveTicket(task);
      else if (task.taskType === 'PRIVACY_EXPORT_EXPIRE') await this.expirePrivacyExport(task);
      else if (task.taskType === 'ANALYTICS_DAILY') await this.aggregateDailyAnalytics(task);
      else if (task.taskType === 'GIVEAWAY_CLOSE') await this.closeGiveaway(task);
      else if (task.taskType === 'GAMING_RECRUITMENT_EXPIRE') await this.expireRecruitment(task);
      else if (task.taskType === 'MAINTENANCE_START') await this.startMaintenance(task);
      else if (task.taskType === 'MAINTENANCE_END') await this.endMaintenance(task);
      else if (task.taskType === 'CREATOR_CONTENT_PUBLISH') await this.publishCreatorContent(task);
      else if (task.taskType === 'MENTOR_SESSION_REMINDER') await this.remindMentorSession(task);
      else if (task.taskType === 'BUSINESS_SUPPORT_SLA_CHECK') await this.checkBusinessSupportSla(task);
      else if (task.taskType === 'INTEGRATION_SYNC') await this.syncIntegration(task);
      else throw new Error(`Unsupported scheduled task type ${task.taskType}`);
      await this.tasks.markSucceeded(task.taskId,this.workerId);
      await this.deps.bus.publish(makeEvent({ type: 'scheduler.task.succeeded', guildId: task.guildId, correlationId, payload: { taskId: task.taskId, taskType: task.taskType } }));
    } catch (error) {
      const retryable = task.attempts < 4;
      const retryAt = retryable ? new Date(Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, task.attempts - 1))) : undefined;
      await this.tasks.markFailed(task.taskId, retryAt,this.workerId);
      if (task.taskType === 'BACKUP_SCHEDULED') {
        await this.deps.database.requirePool().query(`update backup_schedule_state set last_result=$2,next_run_at=coalesce($3,next_run_at),updated_at=now() where guild_id=$1`,[task.guildId,`FAILED:${error instanceof Error ? error.message.slice(0,120) : 'unknown'}`,retryAt ?? null]).catch(()=>undefined);
      }
      await this.deps.bus.publish(makeEvent({ type: 'scheduler.task.failed', guildId: task.guildId, correlationId, payload: { taskId: task.taskId, taskType: task.taskType, retryable, retryAt: retryAt?.toISOString(), error: error instanceof Error ? error.message : 'unknown' } }));
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async syncIntegration(task: PersistedScheduledTask): Promise<void> {
    const integrationKey=String(task.payload.integrationKey??'');
    const cadence=String(task.payload.cadence??'OFF').toUpperCase();
    if(!integrationKey||!['OFF','DAILY','WEEKLY'].includes(cadence))throw new Error('INTEGRATION_SYNC_PAYLOAD_INVALID');
    const control=new IntegrationControlRepository(this.deps.database);
    const integration=await control.get(task.guildId,integrationKey);
    if(!integration?.enabled||cadence==='OFF')return;
    const adapter=createDefaultIntegrationRegistry().get(integrationKey);
    if(!adapter?.sync)throw new Error('INTEGRATION_SYNC_ADAPTER_UNAVAILABLE');
    try{
      const correlationId=newCorrelationId();
      const admission=await new AdmissionControlRepository(this.deps.database).evaluate({guildId:task.guildId,operation:'PROVIDER',actorId:'scheduler',correlationId,detail:`scheduled:${integrationKey}`});
      if(admission.decision==='DEFER'){const retryAt=new Date(Date.now()+(admission.retryAfterSeconds??120)*1000);await this.tasks.schedule({guildId:task.guildId,taskType:'INTEGRATION_SYNC',runAt:retryAt,timezone:task.timezone,dedupKey:`integration-sync-admission:${integrationKey}:${retryAt.toISOString()}`,payload:{...task.payload,integrationKey,cadence}});await this.deps.bus.publish(makeEvent({type:'integration.sync.admission_deferred',guildId:task.guildId,correlationId,payload:{integrationKey,pressure:admission.pressure,retryAt:retryAt.toISOString()}}));return;}
      const budget=await new ResourceBudgetRepository(this.deps.database).consume({guildId:task.guildId,budgetKey:'provider.sync',units:1,actorId:'scheduler',correlationId,detail:`scheduled:${integrationKey}`});
      if(budget.decision==='DEFER'){
        const retryAt=new Date(budget.retryAt!);
        await this.tasks.schedule({guildId:task.guildId,taskType:'INTEGRATION_SYNC',runAt:retryAt,timezone:task.timezone,dedupKey:`integration-sync-budget:${integrationKey}:${retryAt.toISOString()}`,payload:{...task.payload,integrationKey,cadence}});
        await this.deps.bus.publish(makeEvent({type:'integration.sync.budget_deferred',guildId:task.guildId,correlationId,payload:{integrationKey,budgetKey:budget.budgetKey,retryAt:budget.retryAt}}));
        return;
      }
      const result=await adapter.sync({config:integration.config});
      const snapshots=new IntegrationSyncRepository(this.deps.database);
      const snapshot=await snapshots.store({guildId:task.guildId,integrationKey,result});
      await snapshots.prune(task.guildId,integrationKey,12);
      await control.recordSync({guildId:task.guildId,integrationKey,detail:result.detail,snapshotId:snapshot.snapshotId,contentType:result.contentType,itemCount:result.itemCount,actorId:'scheduler'});
      const hour=Math.max(0,Math.min(23,Number(task.payload.localHour??5)));
      const weekday=Math.max(0,Math.min(6,Number(task.payload.weekday??1)));
      const nextRun=cadence==='DAILY'
        ? nextLocalTime(task.timezone,hour,0,new Date(Date.now()+60_000))
        : nextLocalWeekdayTime(task.timezone,weekday,hour,0,new Date(Date.now()+60_000));
      await this.tasks.schedule({guildId:task.guildId,taskType:'INTEGRATION_SYNC',runAt:nextRun,timezone:task.timezone,dedupKey:`integration-sync:${integrationKey}:${nextRun.toISOString()}`,payload:{integrationKey,cadence,localHour:hour,weekday}});
      await this.deps.bus.publish(makeEvent({type:'integration.content.synced',guildId:task.guildId,correlationId:newCorrelationId(),payload:{integrationKey,snapshotId:snapshot.snapshotId,contentType:result.contentType,itemCount:result.itemCount,nextRunAt:nextRun.toISOString()}}));
    }catch(error){
      const code=error instanceof Error?error.message.slice(0,120):'INTEGRATION_SYNC_FAILED';
      await control.recordHealth({guildId:task.guildId,integrationKey,healthy:false,detail:'Scheduled provider synchronization failed.',errorCode:code,actorId:'scheduler'}).catch(()=>undefined);
      throw error;
    }
  }

  private async publishCreatorContent(task: PersistedScheduledTask): Promise<void> {
    const contentId=String(task.payload.contentId??''); if(!contentId)throw new Error('CREATOR_CONTENT_PUBLISH missing contentId');
    const repo=new CreatorRepository(this.deps.database); const content=await repo.get(task.guildId,contentId);
    if(!content||content.status!=='APPROVED'||!content.scheduled_at)return;
    const scheduledAt=new Date(content.scheduled_at); if(scheduledAt.getTime()>Date.now()+5_000)throw new Error('CREATOR_CONTENT_PUBLISH_EARLY');
    const channel=await this.targetChannel(task.guildId,String(content.publish_channel_key??'CH_UPLOADS'));
    const sent=await channel.send({...v2NoticePanel({title:String(content.title),description:`${String(content.body)}\n\n**${content.external_url?'ลิงก์':'ประเภท'}** ${content.external_url?String(content.external_url):String(content.content_type)}\n\n-# เนื้อหาครีเอเตอร์ ${contentId}`,tone:'violet'}),allowedMentions:{parse:[]}});
    await repo.markPublished({guildId:task.guildId,contentId,messageId:sent.id});
    await this.deps.bus.publish(makeEvent({type:'creator.content.published',guildId:task.guildId,correlationId:newCorrelationId(),payload:{contentId,messageId:sent.id,scheduled:true}}));
  }

  private async remindMentorSession(task: PersistedScheduledTask): Promise<void> {
    const requestId=String(task.payload.requestId??''); if(!requestId)throw new Error('MENTOR_SESSION_REMINDER missing requestId');
    const request=await new EducationRepository(this.deps.database).getMentorRequest(task.guildId,requestId);
    if(!request||request.status!=='SCHEDULED'||!request.scheduled_at||!request.mentor_user_id)return;
    const scheduledAt=new Date(request.scheduled_at); const offset=Number(task.payload.offsetMinutes??0); const guild=await this.deps.client.guilds.fetch(task.guildId);
    const ids=[String(request.requester_user_id),String(request.mentor_user_id)]; let delivered=0;
    for(const userId of new Set(ids)){const member=await guild.members.fetch(userId).catch(()=>null);if(!member)continue;const ok=await member.send({...v2NoticePanel({title:'แจ้งเตือนนัดพี่เลี้ยง',description:`นัดพี่เลี้ยงเรื่อง **${String(request.subject).slice(0,100)}** จะเริ่ม <t:${Math.floor(scheduledAt.getTime()/1000)}:R>\n\n-# ออโต้เซิร์ฟเวอร์ · แจ้งเตือนล่วงหน้า ${offset} นาที`,tone:'primary'}),allowedMentions:{parse:[]}}).then(()=>true).catch(()=>false);if(ok)delivered++;}
    await this.deps.bus.publish(makeEvent({type:'education.mentor.reminder',guildId:task.guildId,correlationId:newCorrelationId(),payload:{requestId,offsetMinutes:offset,delivered}}));
  }

  private async checkBusinessSupportSla(task: PersistedScheduledTask): Promise<void> {
    const supportRefId=String(task.payload.supportRefId??''); if(!supportRefId)throw new Error('BUSINESS_SUPPORT_SLA_CHECK missing supportRefId');
    const pool=this.deps.database.requirePool(); const row=(await pool.query<any>(`select support_ref_id,status,priority,sla_due_at,sla_alerted_at,created_at from business_support_refs where guild_id=$1 and support_ref_id=$2`,[task.guildId,supportRefId])).rows[0];
    if(!row||!['OPEN','CLAIMED'].includes(String(row.status))||!row.sla_due_at||row.sla_alerted_at||new Date(row.sla_due_at).getTime()>Date.now())return;
    let channel; try{channel=await this.targetChannel(task.guildId,'CH_STAFF_ALERTS');}catch{channel=await this.targetChannel(task.guildId,'CH_STAFF_CENTER');}
    const sent=await channel.send({...v2NoticePanel({title:'คำขอช่วยเหลือถึงกำหนดตอบสนอง',description:`คำขอช่วยเหลือ \`${supportRefId}\` ยังมีสถานะ **${presentSystemValue(row.status)}**\nระดับความสำคัญ: **${presentSystemValue(row.priority)}**\nสร้างเมื่อ: <t:${Math.floor(new Date(row.created_at).getTime()/1000)}:R>\n\n-# ไม่แสดงข้อมูลรับรองการชำระเงินหรือข้อมูลอ้างอิงภายนอกแบบดิบ`,tone:'warning'}),allowedMentions:{parse:[]}});
    await pool.query(`update business_support_refs set sla_alerted_at=now(),sla_alert_message_id=$3,updated_at=now() where guild_id=$1 and support_ref_id=$2 and sla_alerted_at is null`,[task.guildId,supportRefId,sent.id]);
    await this.deps.bus.publish(makeEvent({type:'business.support.sla_alerted',guildId:task.guildId,correlationId:newCorrelationId(),payload:{supportRefId,status:String(row.status),priority:String(row.priority),messageId:sent.id}}));
  }

  private async targetChannel(guildId: string, logicalKey: string) {
    const guild = await this.deps.client.guilds.fetch(guildId);
    const mappings = await new ResourceMappingRepository(this.deps.database).list(guildId);
    const channelId = mappings.find((row) => row.logicalKey === logicalKey)?.discordId;
    if (!channelId) throw new Error(`Mapped channel ${logicalKey} not found`);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) throw new Error(`Channel ${logicalKey} is not publishable`);
    return channel;
  }

  private async queueNotificationFanout(input: {
    guildId: string;
    topic: NotificationTopic;
    sourceKey: string;
    title: string;
    body: string;
    url?: string;
  }): Promise<void> {
    await this.tasks.schedule({
      guildId: input.guildId,
      taskType: 'NOTIFICATION_FANOUT',
      runAt: new Date(),
      timezone: 'UTC',
      dedupKey: `notify-fanout:${input.sourceKey}:root`,
      payload: { ...input, afterUserId: '' },
    });
  }

  private async notificationFanout(task: PersistedScheduledTask): Promise<void> {
    const topic = String(task.payload.topic ?? '') as NotificationTopic;
    const sourceKey = String(task.payload.sourceKey ?? '');
    const title = String(task.payload.title ?? '').slice(0, 180);
    const body = String(task.payload.body ?? '').slice(0, 1800);
    const afterUserId = String(task.payload.afterUserId ?? '');
    const allowedTopics: NotificationTopic[] = ['ANNOUNCEMENTS','EVENTS','NEWS','LIVE','UPDATES','GAME_PATCHES','LFG','TOURNAMENTS','SECURITY','MAINTENANCE'];
    if (!allowedTopics.includes(topic) || !sourceKey || !title || !body) throw new Error('NOTIFICATION_FANOUT_INVALID_PAYLOAD');
    const repo = new NotificationRepository(this.deps.database);
    const subscribers = await repo.listSubscribers(task.guildId, topic, afterUserId, 100);
    const correlationId = newCorrelationId();
    if(!['SECURITY','MAINTENANCE'].includes(topic) && subscribers.length>0){
      const admission=await new AdmissionControlRepository(this.deps.database).evaluate({guildId:task.guildId,operation:'BACKGROUND',actorId:'scheduler',correlationId,detail:`notification:${topic}:${sourceKey}`});
      if(admission.decision==='DEFER'){const retryAt=new Date(Date.now()+(admission.retryAfterSeconds??120)*1000);await this.tasks.schedule({guildId:task.guildId,taskType:'NOTIFICATION_FANOUT',runAt:retryAt,timezone:task.timezone,dedupKey:`notify-fanout-admission:${sourceKey}:${afterUserId||'root'}:${retryAt.toISOString()}`,payload:task.payload});await this.deps.bus.publish(makeEvent({type:'notification.fanout.admission_deferred',guildId:task.guildId,correlationId,payload:{topic,sourceKey,pressure:admission.pressure,retryAt:retryAt.toISOString()}}));return;}
      const budget=await new ResourceBudgetRepository(this.deps.database).consume({guildId:task.guildId,budgetKey:'notification.fanout',units:subscribers.length,actorId:'scheduler',correlationId,detail:`${topic}:${sourceKey}`});
      if(budget.decision==='DEFER'){
        const retryAt=new Date(budget.retryAt!);await this.tasks.schedule({guildId:task.guildId,taskType:'NOTIFICATION_FANOUT',runAt:retryAt,timezone:task.timezone,dedupKey:`notify-fanout-budget:${sourceKey}:${afterUserId||'root'}:${retryAt.toISOString()}`,payload:task.payload});
        await this.deps.bus.publish(makeEvent({type:'notification.fanout.budget_deferred',guildId:task.guildId,correlationId,payload:{topic,sourceKey,queued:0,retryAt:budget.retryAt}}));return;
      }
    }
    for (const preference of subscribers) {
      const deliveryDedup = `${sourceKey}:${preference.userId}`;
      await repo.record({ guildId:task.guildId,userId:preference.userId,topic,dedupKey:deliveryDedup,state:'QUEUED',payload:{title,body,url:task.payload.url},correlationId });
      await this.tasks.schedule({
        guildId:task.guildId, taskType:'NOTIFICATION_DELIVER', runAt:new Date(), timezone:preference.quietHours?.timezone ?? preference.timezone ?? task.timezone,
        dedupKey:`notify-deliver:${deliveryDedup}:initial`,
        payload:{ topic,sourceKey,title,body,url:task.payload.url,userId:preference.userId,deliveryDedup },
      });
    }
    if (subscribers.length === 100) {
      const lastUserId = subscribers[subscribers.length - 1]!.userId;
      await this.tasks.schedule({
        guildId:task.guildId,taskType:'NOTIFICATION_FANOUT',runAt:new Date(Date.now()+1000),timezone:task.timezone,
        dedupKey:`notify-fanout:${sourceKey}:after:${lastUserId}`,
        payload:{...task.payload,afterUserId:lastUserId},
      });
    }
    await this.deps.bus.publish(makeEvent({type:'notification.fanout.completed',guildId:task.guildId,correlationId,payload:{topic,sourceKey,queued:subscribers.length,nextCursor:subscribers.length===100?subscribers[subscribers.length-1]!.userId:null}}));
  }

  private async deliverNotification(task: PersistedScheduledTask): Promise<void> {
    const topic = String(task.payload.topic ?? '') as NotificationTopic;
    const sourceKey = String(task.payload.sourceKey ?? '');
    const userId = String(task.payload.userId ?? '');
    const deliveryDedup = String(task.payload.deliveryDedup ?? `${sourceKey}:${userId}`);
    const title = String(task.payload.title ?? '').slice(0, 180);
    const body = String(task.payload.body ?? '').slice(0, 1800);
    if (!topic || !sourceKey || !userId || !title || !body) throw new Error('NOTIFICATION_DELIVER_INVALID_PAYLOAD');
    const repo = new NotificationRepository(this.deps.database);
    const existingState = await repo.deliveryState(task.guildId,deliveryDedup);
    if (existingState === 'DELIVERED' || existingState === 'SKIPPED' || existingState === 'FAILED') return;
    const preferences = await repo.get(task.guildId,userId);
    const correlationId = newCorrelationId();
    if (!preferences) {
      await repo.record({guildId:task.guildId,userId,topic,dedupKey:deliveryDedup,state:'SKIPPED',payload:{title,body},correlationId,reason:'NO_PREFERENCES',attempts:task.attempts});
      return;
    }
    const decision = evaluateNotification(preferences,topic,new Date());
    if (decision.state === 'SKIP') {
      await repo.record({guildId:task.guildId,userId,topic,dedupKey:deliveryDedup,state:'SKIPPED',payload:{title,body},correlationId,reason:decision.reason,attempts:task.attempts});
      return;
    }
    if (decision.state === 'DEFER') {
      await repo.record({guildId:task.guildId,userId,topic,dedupKey:deliveryDedup,state:'DEFERRED',payload:{title,body},correlationId,reason:decision.reason,attempts:task.attempts});
      await this.tasks.schedule({
        guildId:task.guildId,taskType:'NOTIFICATION_DELIVER',runAt:decision.retryAt,timezone:preferences.quietHours?.timezone ?? preferences.timezone ?? task.timezone,
        dedupKey:`notify-deliver:${deliveryDedup}:retry:${decision.retryAt.getTime()}`,
        payload:task.payload,
      });
      return;
    }
    const guild = await this.deps.client.guilds.fetch(task.guildId);
    const member = await guild.members.fetch(userId).catch(()=>null);
    if (!member) {
      await repo.record({guildId:task.guildId,userId,topic,dedupKey:deliveryDedup,state:'SKIPPED',payload:{title,body},correlationId,reason:'MEMBER_NOT_FOUND',attempts:task.attempts});
      return;
    }
    const url = typeof task.payload.url === 'string' && /^https:\/\//.test(task.payload.url) ? task.payload.url.slice(0,500) : undefined;
    try {
      const message = await member.send({ ...v2NoticePanel({ title, description: `${body}${url?`\n\n${url}`:''}\n\n-# ออโต้เซิร์ฟเวอร์ · ${presentSystemValue(topic)}`, tone: 'primary' }), allowedMentions:{parse:[]} });
      await repo.record({guildId:task.guildId,userId,topic,dedupKey:deliveryDedup,state:'DELIVERED',payload:{title,body,url},correlationId,messageId:message.id,attempts:task.attempts});
    } catch {
      await repo.record({guildId:task.guildId,userId,topic,dedupKey:deliveryDedup,state:'FAILED',payload:{title,body,url},correlationId,reason:'DM_UNAVAILABLE',attempts:task.attempts});
    }
  }

  private async warnTemporaryRole(task: PersistedScheduledTask): Promise<void> {
    const userId=String(task.payload.userId ?? ''); const roleId=String(task.payload.roleId ?? ''); const expiresAtRaw=String(task.payload.expiresAt ?? '');
    if(!userId || !roleId || !expiresAtRaw) throw new Error('TEMP_ROLE_WARN missing identity');
    const expiresAt=new Date(expiresAtRaw); if(Number.isNaN(expiresAt.getTime())) throw new Error('TEMP_ROLE_WARN_INVALID_EXPIRY');
    const pool=this.deps.database.requirePool();
    const row=(await pool.query<{warning_sent_at:Date|null}>(`select warning_sent_at from temporary_roles where guild_id=$1 and user_id=$2 and role_id=$3 and expires_at=$4 and status='ACTIVE'`,[task.guildId,userId,roleId,expiresAt])).rows[0];
    if(!row || row.warning_sent_at) return;
    const guild=await this.deps.client.guilds.fetch(task.guildId); const member=await guild.members.fetch(userId).catch(()=>null); const role=guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(()=>null);
    const correlationId=newCorrelationId(); let sent=false;
    if(member){
      sent=await member.send({...v2NoticePanel({title:'ยศชั่วคราวใกล้หมดอายุ',description:`ยศชั่วคราว **${role?.name ?? 'ยศที่ระบบดูแล'}** ใน **${guild.name}** จะหมดอายุ <t:${Math.floor(expiresAt.getTime()/1000)}:R>\n\n-# ออโต้เซิร์ฟเวอร์ · สิทธิ์ชั่วคราว`,tone:'warning'}),allowedMentions:{parse:[]}}).then(()=>true).catch(()=>false);
    }
    await this.deps.database.transaction(async(client)=>{
      await client.query(`update temporary_roles set warning_sent_at=now(),updated_at=now() where guild_id=$1 and user_id=$2 and role_id=$3 and expires_at=$4 and status='ACTIVE' and warning_sent_at is null`,[task.guildId,userId,roleId,expiresAt]);
      await client.query(`insert into temporary_role_events(event_id,guild_id,user_id,role_id,expires_at,event_type,actor_id,payload,correlation_id) values($1,$2,$3,$4,$5,$6,null,$7,$8)`,[randomUUID(),task.guildId,userId,roleId,expiresAt,sent?'WARNING_SENT':'WARNING_FAILED',{reason:sent?'DELIVERED':'DM_UNAVAILABLE'},correlationId]);
    });
  }

  private async runScheduledBackup(task: PersistedScheduledTask): Promise<void> {
    const pool=this.deps.database.requirePool();
    const schedule=(await pool.query<{cadence:'OFF'|'DAILY'|'WEEKLY';local_hour:number;backup_weekday:number;timezone:string;keep_scheduled:number}>(`select cadence,local_hour,backup_weekday,timezone,keep_scheduled from backup_schedule_state where guild_id=$1`,[task.guildId])).rows[0];
    if(!schedule || schedule.cadence==='OFF') return;
    const correlationId=newCorrelationId();const admission=await new AdmissionControlRepository(this.deps.database).evaluate({guildId:task.guildId,operation:'BACKGROUND',actorId:'scheduler',correlationId,detail:`backup:${schedule.cadence}`});
    if(admission.decision==='DEFER'){const retryAt=new Date(Date.now()+(admission.retryAfterSeconds??120)*1000);await pool.query(`update backup_schedule_state set next_run_at=$2,last_result='DEFERRED_ADMISSION',updated_at=now() where guild_id=$1`,[task.guildId,retryAt]);await this.tasks.schedule({guildId:task.guildId,taskType:'BACKUP_SCHEDULED',runAt:retryAt,timezone:schedule.timezone,dedupKey:`backup-admission:${retryAt.toISOString()}`,payload:task.payload});await this.deps.bus.publish(makeEvent({type:'backup.scheduled.admission_deferred',guildId:task.guildId,correlationId,payload:{pressure:admission.pressure,retryAt:retryAt.toISOString()}}));return;}
    const budget=await new ResourceBudgetRepository(this.deps.database).consume({guildId:task.guildId,budgetKey:'background.backup',units:1,actorId:'scheduler',correlationId,detail:`scheduled:${schedule.cadence}`});
    if(budget.decision==='DEFER'){
      const retryAt=new Date(budget.retryAt!);await pool.query(`update backup_schedule_state set next_run_at=$2,last_result='DEFERRED_BUDGET',updated_at=now() where guild_id=$1`,[task.guildId,retryAt]);await this.tasks.schedule({guildId:task.guildId,taskType:'BACKUP_SCHEDULED',runAt:retryAt,timezone:schedule.timezone,dedupKey:`backup-budget:${retryAt.toISOString()}`,payload:task.payload});await this.deps.bus.publish(makeEvent({type:'backup.scheduled.budget_deferred',guildId:task.guildId,correlationId,payload:{retryAt:budget.retryAt}}));return;
    }
    const guild=await this.deps.client.guilds.fetch(task.guildId);
    const result=await captureManagedDiscordBackup({guild,database:this.deps.database,kind:'SCHEDULED',createdBy:'scheduler'});
    const pruned=await new BackupSnapshotRepository(this.deps.database).pruneScheduled(task.guildId,schedule.keep_scheduled);
    const nextRun=schedule.cadence==='DAILY'
      ? nextLocalTime(schedule.timezone,schedule.local_hour,0,new Date())
      : nextLocalWeekdayTime(schedule.timezone,schedule.backup_weekday,schedule.local_hour,0,new Date());
    await pool.query(`update backup_schedule_state set last_backup_id=$2,last_run_at=now(),next_run_at=$3,last_result='SUCCEEDED',updated_at=now() where guild_id=$1`,[task.guildId,result.backupId,nextRun]);
    await this.tasks.schedule({guildId:task.guildId,taskType:'BACKUP_SCHEDULED',runAt:nextRun,timezone:schedule.timezone,dedupKey:`backup-scheduled:${nextRun.toISOString()}`,payload:{cadence:schedule.cadence,localHour:schedule.local_hour,weekday:schedule.backup_weekday,keep:schedule.keep_scheduled}});
    await this.deps.bus.publish(makeEvent({type:'backup.scheduled.completed',guildId:task.guildId,correlationId:newCorrelationId(),payload:{backupId:result.backupId,pruned,nextRunAt:nextRun.toISOString(),cadence:schedule.cadence}}));
  }

  private async publishAnnouncement(task: PersistedScheduledTask): Promise<void> {
    const announcementId = String(task.payload.announcementId ?? '');
    if (!announcementId) throw new Error('ANNOUNCEMENT_PUBLISH missing announcementId');
    const pool = this.deps.database.requirePool();
    const announcement = (await pool.query<any>(`select * from announcements where announcement_id=$1 and guild_id=$2`, [announcementId,task.guildId])).rows[0];
    if (!announcement) throw new Error('Announcement not found');
    if (announcement.status === 'PUBLISHED') {
      await this.queueNotificationFanout({guildId:task.guildId,topic:'ANNOUNCEMENTS',sourceKey:`announcement:${announcementId}`,title:String(announcement.title),body:String(announcement.body)});
      return;
    }
    if (!['SCHEDULED','REVIEW'].includes(announcement.status)) return;
    const targetKey = String(task.payload.channelKey ?? 'CH_ANNOUNCEMENTS');
    const channel = await this.targetChannel(task.guildId,targetKey);
    const sent = await channel.send({ ...v2NoticePanel({ title: String(announcement.title), description: `${String(announcement.body)}\n\n-# ออโต้เซิร์ฟเวอร์ · ประกาศที่ระบบดูแล`, tone: 'primary' }), allowedMentions: { parse: [] } });
    await this.deps.database.transaction(async (client) => {
      await client.query(`update announcements set status='PUBLISHED',published_at=now(),published_message_id=$3,updated_at=now() where announcement_id=$1 and guild_id=$2`, [announcementId,task.guildId,sent.id]);
      await client.query(`insert into announcement_deliveries(announcement_id,guild_id,channel_id,message_id,state,delivered_at) values($1,$2,$3,$4,'PUBLISHED',now()) on conflict (announcement_id,channel_id) do update set message_id=excluded.message_id,state='PUBLISHED',delivered_at=now()`, [announcementId,task.guildId,channel.id,sent.id]);
    });
    await this.queueNotificationFanout({guildId:task.guildId,topic:'ANNOUNCEMENTS',sourceKey:`announcement:${announcementId}`,title:String(announcement.title),body:String(announcement.body)});
  }

  private async sendEventReminder(task: PersistedScheduledTask): Promise<void> {
    const eventId = String(task.payload.eventId ?? '');
    const event = (await this.deps.database.requirePool().query<any>(`select * from server_events where event_id=$1 and guild_id=$2`,[eventId,task.guildId])).rows[0];
    if (!event) throw new Error('Event not found');
    const channel = await this.targetChannel(task.guildId,String(task.payload.channelKey ?? 'CH_EVENT_CENTER'));
    await channel.send({ ...v2NoticePanel({ title: `ใกล้เริ่ม · ${String(event.title)}`, description: `เริ่ม <t:${Math.floor(new Date(event.starts_at).getTime()/1000)}:R>\nออโต้เซิร์ฟเวอร์ดูแลสถานะการลงทะเบียนและการแจ้งเตือนจากข้อมูลจริง`, tone: 'warning' }), allowedMentions: { parse: [] } });
    await this.queueNotificationFanout({guildId:task.guildId,topic:'EVENTS',sourceKey:`event-reminder:${eventId}:${task.dedupKey}`,title:`Upcoming · ${String(event.title)}`,body:`Starts <t:${Math.floor(new Date(event.starts_at).getTime()/1000)}:R>. Open the server Event Center for registration and check-in.`});
  }

  private async expireTemporaryRole(task: PersistedScheduledTask): Promise<void> {
    const userId=String(task.payload.userId ?? ''); const roleId=String(task.payload.roleId ?? '');
    if (!userId || !roleId) throw new Error('TEMP_ROLE_EXPIRE missing identity');
    const pool=this.deps.database.requirePool(); const correlationId=newCorrelationId();
    const expired=await pool.query<{expires_at:Date}>(`update temporary_roles set status='EXPIRED',updated_at=now() where guild_id=$1 and user_id=$2 and role_id=$3 and status='ACTIVE' and expires_at<=now() returning expires_at`,[task.guildId,userId,roleId]);
    for(const row of expired.rows){
      await pool.query(`insert into temporary_role_events(event_id,guild_id,user_id,role_id,expires_at,event_type,actor_id,payload,correlation_id) values($1,$2,$3,$4,$5,'EXPIRED',null,$6,$7)`,[randomUUID(),task.guildId,userId,roleId,row.expires_at,{source:'scheduler'},correlationId]);
    }
    const stillActive=await pool.query(`select 1 from temporary_roles where guild_id=$1 and user_id=$2 and role_id=$3 and status='ACTIVE' and expires_at>now() limit 1`,[task.guildId,userId,roleId]);
    if(stillActive.rowCount) return;
    const guild=await this.deps.client.guilds.fetch(task.guildId); const member=await guild.members.fetch(userId).catch(()=>null);
    if (member?.roles.cache.has(roleId)) await member.roles.remove(roleId,'ออโต้เซิร์ฟเวอร์ · ยศชั่วคราวหมดอายุ');
  }

  private async checkTicketSla(task: PersistedScheduledTask): Promise<void> {
    const ticketId=String(task.payload.ticketId ?? ''); if(!ticketId) throw new Error('TICKET_SLA_CHECK missing ticketId');
    const ticket=await new TicketRepository(this.deps.database).get(ticketId); if(!ticket || ticket.guildId!==task.guildId) return;
    if(['CLOSED','ARCHIVED','RESOLVED'].includes(ticket.status) || ticket.firstStaffResponseAt || ticket.assignedStaffId) return;
    const channel=await this.targetChannel(task.guildId,'CH_STAFF_ALERTS');
    await channel.send({...v2NoticePanel({title:`คำขอช่วยเหลือเกินเวลาตอบสนอง · #${ticket.ticketNumber}`,description:`คำขอระดับ **${presentSystemValue(ticket.priority)}** ยังไม่มีการตอบกลับของทีมดูแลที่ถูกบันทึกก่อนเวลาที่กำหนด
${ticket.channelId ? `ช่อง: <#${ticket.channelId}>` : 'ไม่พบช่องของคำขอช่วยเหลือ'}

-# คำขอ ${ticket.ticketId} · แจ้งเตือนเท่านั้น ไม่มีการลงโทษหรือปิดเรื่องอัตโนมัติ`,tone:'danger'}),allowedMentions:{parse:[]}});
    await this.deps.database.requirePool().query(`update tickets set metadata=metadata || $3::jsonb,updated_at=now() where ticket_id=$1 and guild_id=$2`,[ticketId,task.guildId,JSON.stringify({slaBreachedAt:new Date().toISOString()})]);
  }

  private async archiveTicket(task: PersistedScheduledTask): Promise<void> {
    const ticketId=String(task.payload.ticketId ?? ''); if(!ticketId) throw new Error('TICKET_ARCHIVE missing ticketId');
    const repo=new TicketRepository(this.deps.database); const ticket=await repo.get(ticketId); if(!ticket || ticket.guildId!==task.guildId) return;
    if(!['CLOSED','RESOLVED'].includes(ticket.status)) return;
    const guild=await this.deps.client.guilds.fetch(task.guildId);
    await createAndStoreTicketTranscript({guild,database:this.deps.database,ticket,createdBy:'scheduler'}).catch(()=>null);
    if(ticket.channelId){
      const channel=await guild.channels.fetch(ticket.channelId).catch(()=>null);
      if(channel?.type===ChannelType.GuildText){
        const mappings=await new ResourceMappingRepository(this.deps.database).list(task.guildId); const archiveId=mappings.find((row)=>row.logicalKey==='CAT_ARCHIVE')?.discordId;
        await channel.permissionOverwrites.edit(ticket.openerUserId,{ViewChannel:false,SendMessages:false},{reason:`Ticket #${ticket.ticketNumber} archived`}).catch(()=>undefined);
        if(archiveId) await channel.setParent(archiveId,{lockPermissions:false,reason:`Ticket #${ticket.ticketNumber} archived`}).catch(()=>undefined);
        if(!channel.name.startsWith('archived-')) await channel.setName(`archived-${channel.name.replace(/^closed-/, '')}`.slice(0,100),'Ticket archived').catch(()=>undefined);
      }
    }
    await repo.setStatus(ticketId,'ARCHIVED');
    await this.deps.database.requirePool().query(`insert into ticket_events(ticket_event_id,ticket_id,guild_id,actor_id,event_type,payload,correlation_id) values($1,$2,$3,null,'ARCHIVED',$4,$5)`,[randomUUID(),ticketId,task.guildId,{source:'scheduler'},newCorrelationId()]);
  }


  private async expirePrivacyExport(task: PersistedScheduledTask): Promise<void> {
    const artifactId=String(task.payload.artifactId ?? ''); const requestId=String(task.payload.requestId ?? '');
    if(!artifactId || !requestId) throw new Error('PRIVACY_EXPORT_EXPIRE missing identity');
    await this.deps.database.transaction(async(client)=>{
      const artifact=(await client.query<{expires_at:Date}>(`select expires_at from data_export_artifacts where artifact_id=$1 and request_id=$2 and guild_id=$3 for update`,[artifactId,requestId,task.guildId])).rows[0];
      if(artifact && new Date(artifact.expires_at).getTime()>Date.now()) throw new Error('PRIVACY_EXPORT_NOT_EXPIRED');
      await client.query(`delete from data_export_artifacts where artifact_id=$1 and request_id=$2 and guild_id=$3 and expires_at<=now()`,[artifactId,requestId,task.guildId]);
      await client.query(`update data_export_requests set status='EXPIRED',artifact_ref=null,expires_at=coalesce(expires_at,now()),finished_at=coalesce(finished_at,now()) where request_id=$1 and guild_id=$2 and status in ('SUCCEEDED','RUNNING')`,[requestId,task.guildId]);
    });
  }


  private async startMaintenance(task: PersistedScheduledTask): Promise<void> {
    const maintenanceId=String(task.payload.maintenanceId??''); if(!maintenanceId) throw new Error('MAINTENANCE_START missing maintenanceId');
    const repo=new MaintenanceWindowRepository(this.deps.database); const current=await repo.get(task.guildId,maintenanceId); if(!current) return;
    if(current.state==='ACTIVE') return; if(current.state!=='SCHEDULED') return;
    const updated=await repo.transition(task.guildId,maintenanceId,'ACTIVE','scheduler',newCorrelationId());
    await this.queueNotificationFanout({guildId:task.guildId,topic:'MAINTENANCE',sourceKey:`maintenance:${maintenanceId}:start`,title:'เริ่มโหมดบำรุงรักษา',body:updated.reason?`เริ่มการบำรุงรักษาแบบควบคุมแล้ว: ${updated.reason}`:'เริ่มการบำรุงรักษาแบบควบคุมแล้ว ระบบอัตโนมัติบางส่วนอาจหยุดชั่วคราวตามนโยบาย'});
    await this.deps.bus.publish(makeEvent({type:'maintenance.activated',guildId:task.guildId,correlationId:updated.correlationId,aggregateKey:maintenanceId,source:'scheduler',payload:{maintenanceId,endsAt:updated.endsAt?.toISOString(),policy:updated.automationPolicy}}));
  }

  private async endMaintenance(task: PersistedScheduledTask): Promise<void> {
    const maintenanceId=String(task.payload.maintenanceId??''); if(!maintenanceId) throw new Error('MAINTENANCE_END missing maintenanceId');
    const repo=new MaintenanceWindowRepository(this.deps.database); const current=await repo.get(task.guildId,maintenanceId); if(!current) return;
    if(current.state==='COMPLETED'||current.state==='CANCELLED') return; if(current.state==='SCHEDULED') await repo.transition(task.guildId,maintenanceId,'ACTIVE','scheduler',newCorrelationId());
    const updated=await repo.transition(task.guildId,maintenanceId,'COMPLETED','scheduler',newCorrelationId());
    await this.queueNotificationFanout({guildId:task.guildId,topic:'MAINTENANCE',sourceKey:`maintenance:${maintenanceId}:end`,title:'การบำรุงรักษาเสร็จสิ้น',body:'การบำรุงรักษาแบบควบคุมสิ้นสุดแล้ว ระบบอัตโนมัติสามารถกลับมาทำงานตามนโยบายปกติได้'});
    await this.deps.bus.publish(makeEvent({type:'maintenance.completed',guildId:task.guildId,correlationId:updated.correlationId,aggregateKey:maintenanceId,source:'scheduler',payload:{maintenanceId}}));
  }

  private async expireRecruitment(task: PersistedScheduledTask): Promise<void> {
    const recruitmentPostId=String(task.payload.recruitmentPostId??''); if(!recruitmentPostId) throw new Error('GAMING_RECRUITMENT_EXPIRE missing recruitmentPostId');
    const expired=await new GamingRepository(this.deps.database).expireRecruitment(task.guildId,recruitmentPostId);
    if(expired) await this.deps.bus.publish(makeEvent({type:'gaming.recruitment.expired',guildId:task.guildId,correlationId:newCorrelationId(),source:'scheduler',aggregateKey:recruitmentPostId,payload:{recruitmentPostId}}));
  }

  private async closeGiveaway(task: PersistedScheduledTask): Promise<void> {
    const giveawayId=String(task.payload.giveawayId??''); if(!giveawayId) throw new Error('GIVEAWAY_CLOSE missing giveawayId');
    const result=await new GiveawayRepository(this.deps.database).closeExpired(task.guildId,giveawayId);
    if(!result.closed) return;
    const guild=await this.deps.client.guilds.fetch(task.guildId);
    const channel=result.channelId?await guild.channels.fetch(result.channelId).catch(()=>null):null;
    if(channel?.type===ChannelType.GuildText || channel?.type===ChannelType.GuildAnnouncement){
      await channel.send({...v2NoticePanel({title:`ปิดรับผู้เข้าร่วมแล้ว · ${result.title??'กิจกรรมรางวัลชุมชน'}`,description:`สิ้นสุดช่วงเข้าร่วมฟรีแล้ว ผู้จัดการเซิร์ฟเวอร์สามารถดำเนินการคัดเลือกผู้ได้รับรางวัลแบบตรวจสอบย้อนหลังได้เมื่อพร้อม\n\n-# กิจกรรมรางวัล ${giveawayId.slice(0,8)} · ไม่มีการซื้อสิทธิ์และไม่มีการเดิมพัน`,tone:'success'}),allowedMentions:{parse:[]}}).catch(()=>undefined);
    }
    await this.deps.bus.publish(makeEvent({type:'giveaway.entries.closed',guildId:task.guildId,correlationId:newCorrelationId(),payload:{giveawayId,messageId:result.messageId??null}}));
  }

  private async aggregateDailyAnalytics(task: PersistedScheduledTask): Promise<void> {
    const config=await new GuildConfigRepository(this.deps.database).get(task.guildId);
    if(config?.enabledModules.analytics!==true){
      await this.deps.bus.publish(makeEvent({type:'analytics.daily.skipped_disabled',guildId:task.guildId,correlationId:newCorrelationId(),payload:{reason:'analytics module disabled'}}));
      return;
    }
    const metricDate=typeof task.payload.metricDate==='string' ? task.payload.metricDate : localDateKey(task.timezone,task.runAt);
    const correlationId=newCorrelationId();const admission=await new AdmissionControlRepository(this.deps.database).evaluate({guildId:task.guildId,operation:'BACKGROUND',actorId:'scheduler',correlationId,detail:`analytics:${metricDate}`});
    if(admission.decision==='DEFER'){const retryAt=new Date(Date.now()+(admission.retryAfterSeconds??120)*1000);await this.tasks.schedule({guildId:task.guildId,taskType:'ANALYTICS_DAILY',runAt:retryAt,timezone:task.timezone,dedupKey:`analytics-admission:${metricDate}:${retryAt.toISOString()}`,payload:{metricDate}});await this.deps.bus.publish(makeEvent({type:'analytics.daily.admission_deferred',guildId:task.guildId,correlationId,payload:{metricDate,pressure:admission.pressure,retryAt:retryAt.toISOString()}}));return;}
    const budget=await new ResourceBudgetRepository(this.deps.database).consume({guildId:task.guildId,budgetKey:'background.analytics',units:1,actorId:'scheduler',correlationId,detail:`daily:${metricDate}`});
    if(budget.decision==='DEFER'){const retryAt=new Date(budget.retryAt!);await this.tasks.schedule({guildId:task.guildId,taskType:'ANALYTICS_DAILY',runAt:retryAt,timezone:task.timezone,dedupKey:`analytics-budget:${metricDate}:${retryAt.toISOString()}`,payload:{metricDate}});await this.deps.bus.publish(makeEvent({type:'analytics.daily.budget_deferred',guildId:task.guildId,correlationId,payload:{metricDate,retryAt:budget.retryAt}}));return;}
    const analytics=new AnalyticsService(this.deps.database);
    const metrics=await analytics.aggregateGuildDay(task.guildId,metricDate);
    const recommendations=recommendFromDailyMetrics(metrics);
    const refreshed=await new RecommendationService(this.deps.database).refreshGuild(task.guildId,recommendations);
    const guild=await this.deps.client.guilds.fetch(task.guildId);
    const pool=this.deps.database.requirePool();
    const [ticketRows,eventRows,lfgRows]=await Promise.all([
      pool.query<{count:string}>(`select count(*)::text as count from tickets where guild_id=$1 and created_at>=now()-interval '7 days'`,[task.guildId]),
      pool.query<{count:string}>(`select count(*)::text as count from server_events where guild_id=$1 and created_at>=now()-interval '30 days'`,[task.guildId]),
      pool.query<{count:string}>(`select count(*)::text as count from lfg_posts where guild_id=$1 and created_at>=now()-interval '30 days'`,[task.guildId]),
    ]);
    const growthSignals={memberCount:guild.memberCount,roleCount:guild.roles.cache.size-1,channelCount:guild.channels.cache.size,activeTickets7d:Number(ticketRows.rows[0]?.count??0),events30d:Number(eventRows.rows[0]?.count??0),lfg30d:Number(lfgRows.rows[0]?.count??0)};
    const growth=assessGrowth(growthSignals);
    await new GrowthAssessmentRepository(this.deps.database).store({assessmentId:randomUUID(),guildId:task.guildId,mode:growth.mode,score:growth.score,signals:growthSignals,recommendations:growth.recommendations});
    const cachePruned=await new SharedDatabaseCache(this.deps.database).prune(1000).catch(()=>0);
    const next=nextLocalTime(task.timezone,3,15,new Date()); const nextDate=localDateKey(task.timezone,next);
    await this.tasks.schedule({guildId:task.guildId,taskType:'ANALYTICS_DAILY',runAt:next,timezone:task.timezone,dedupKey:`analytics-daily:${nextDate}`,payload:{metricDate:nextDate}});
    await this.deps.bus.publish(makeEvent({type:'analytics.daily.completed',guildId:task.guildId,correlationId:newCorrelationId(),payload:{metricDate,metricCount:metrics.length,recommendationCount:recommendations.length,refreshed,growthMode:growth.mode,growthScore:growth.score,cachePruned,nextRunAt:next.toISOString()}}));
  }

  private async cleanupTemporaryVoice(task: PersistedScheduledTask): Promise<void> {
    const channelId=String(task.payload.channelId ?? ''); if (!channelId) throw new Error('TEMP_VOICE_CLEANUP missing channelId');
    const room=(await this.deps.database.requirePool().query<any>(`select state,empty_since from temporary_voice_rooms where guild_id=$1 and channel_id=$2`,[task.guildId,channelId])).rows[0];
    if (!room) return;
    const guild=await this.deps.client.guilds.fetch(task.guildId); const channel=await guild.channels.fetch(channelId).catch(()=>null);
    if (channel?.type === ChannelType.GuildVoice && channel.members.size > 0) {
      await this.deps.database.requirePool().query(`update temporary_voice_rooms set state='ACTIVE',empty_since=null,updated_at=now() where guild_id=$1 and channel_id=$2`,[task.guildId,channelId]);
      return;
    }
    if (room.state !== 'EMPTY_GRACE') return;
    const emptySince=room.empty_since ? new Date(room.empty_since).getTime() : Date.now();
    const graceMs=Math.max(30_000,Number(task.payload.emptyGraceMs ?? 120_000));
    if (Date.now()-emptySince < graceMs) {
      const nextCleanup=new Date(emptySince+graceMs);
      await this.tasks.schedule({ guildId:task.guildId,taskType:'TEMP_VOICE_CLEANUP',runAt:nextCleanup,timezone:'UTC',dedupKey:`temporary-voice:${channelId}:${nextCleanup.toISOString()}`,payload:{ channelId,emptyGraceMs:graceMs } });
      return;
    }
    if (channel) await channel.delete('Temporary voice cleanup');
    await this.deps.database.requirePool().query(`delete from temporary_voice_rooms where guild_id=$1 and channel_id=$2`,[task.guildId,channelId]);
  }
}
