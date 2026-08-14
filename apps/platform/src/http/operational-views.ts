import type { Database } from '@autoserver/database';
import { isUserCancellableTask } from '@autoserver/scheduler';
import { AuditLogService } from '@autoserver/audit-log';
import { evaluateErrorBudget, evaluateMetricTrend } from '@autoserver/analytics';

export type OperationalViewKey = 'panels'|'resources'|'access'|'tickets'|'workflows'|'events'|'gaming'|'incidents'|'capacity'|'admission'|'budgets'|'automation'|'recovery_drills'|'security'|'integrations'|'scheduler'|'analytics'|'audit'|'governance'|'plugins'|'settings';

export interface OperationalView {
  key: OperationalViewKey;
  summary: Record<string, number|string|boolean|null>;
  items: Array<Record<string, unknown>>;
}

async function rows(db: Database, sql: string, values: readonly unknown[]): Promise<Array<Record<string, unknown>>> {
  return (await db.requirePool().query(sql, [...values])).rows as Array<Record<string, unknown>>;
}

export class OperationalViewService {
  constructor(private readonly db: Database) {}

  async read(guildId: string, key: OperationalViewKey): Promise<OperationalView> {
    switch (key) {
      case 'panels': {
        const items = await rows(this.db, `select panel_id,"lifecycle_state" as status,content_version,target_channel_key,message_id,repair_policy,last_synced_at from panel_registry where guild_id=$1 order by panel_id limit 100`, [guildId]);
        return { key, summary:{ total:items.length, unhealthy:items.filter((item)=>!['ACTIVE','PUBLISHED'].includes(String(item.status))).length }, items };
      }
      case 'resources': {
        const items = await rows(this.db, `select logical_key,resource_kind,name_snapshot,ownership,locked,updated_at from resource_mappings where guild_id=$1 order by resource_kind,logical_key limit 250`, [guildId]);
        return { key, summary:{ total:items.length, locked:items.filter((item)=>item.locked===true).length }, items };
      }
      case 'access': {
        const items = await rows(this.db, `
          select 'temporary_role'::text as kind,(user_id||':'||role_id||':'||extract(epoch from expires_at)::bigint::text) as id,status,role_id as detail,expires_at as next_at,updated_at from temporary_roles where guild_id=$1
          union all select 'notification_delivery',delivery_id::text,state,topic,delivered_at,updated_at from notification_deliveries where guild_id=$1
          union all select 'forum_thread',thread_id::text,state,title_snapshot,last_activity_at,updated_at from managed_forum_threads where guild_id=$1
          union all select 'backup_schedule',guild_id,cadence,coalesce(last_result,'—'),next_run_at,updated_at from backup_schedule_state where guild_id=$1
          order by updated_at desc limit 160`, [guildId]);
        return { key, summary:{
          total:items.length,
          activeTemporaryRoles:items.filter((item)=>item.kind==='temporary_role'&&item.status==='ACTIVE').length,
          deliveredNotifications:items.filter((item)=>item.kind==='notification_delivery'&&item.status==='DELIVERED').length,
          openForumThreads:items.filter((item)=>item.kind==='forum_thread'&&item.status==='OPEN').length,
        }, items };
      }
      case 'tickets': {
        const items = await rows(this.db, `select ticket_id,ticket_number,ticket_type,priority,status,assigned_staff_id,subject,created_at,updated_at,closed_at,sla_due_at from tickets where guild_id=$1 order by created_at desc limit 100`, [guildId]);
        return { key, summary:{ total:items.length, open:items.filter((item)=>!['CLOSED','ARCHIVED','RESOLVED'].includes(String(item.status))).length }, items };
      }
      case 'workflows': {
        const items = await rows(this.db, `
          select 'application'::text as kind, application_id::text as id, application_type as type, status, applicant_user_id as actor_id, null::text as owner_id, null::timestamptz as next_at, created_at, updated_at from applications where guild_id=$1
          union all select 'report', report_id::text, report_type, status, reporter_user_id, null::text, null::timestamptz, created_at, updated_at from reports where guild_id=$1
          union all select 'suggestion', suggestion_id::text, 'suggestion', status, author_user_id, null::text, null::timestamptz, created_at, updated_at from suggestions where guild_id=$1
          union all select 'creator_content', content_id::text, content_type, status, author_user_id, reviewer_user_id, scheduled_at, created_at, updated_at from creator_content_items where guild_id=$1
          union all select 'mentor_request', mentor_request_id::text, subject, status, requester_user_id, mentor_user_id, scheduled_at, created_at, updated_at from mentor_requests where guild_id=$1
          union all select 'business_support', support_ref_id::text, priority, status, requester_user_id, assigned_staff_id, sla_due_at, created_at, updated_at from business_support_refs where guild_id=$1
          union all select 'fabric_work', work_id::text, domain, status, created_by, assigned_to, null::timestamptz, created_at, updated_at from community_fabric_work_items where guild_id=$1
          order by created_at desc limit 220`, [guildId]);
        return { key, summary:{ total:items.length, pending:items.filter((item)=>['SUBMITTED','OPEN','UNDER_REVIEW','IN_REVIEW','REVIEW','CLAIMED','SCHEDULED','APPROVED','ACTIVE','BLOCKED'].includes(String(item.status))).length, scheduled:items.filter((item)=>item.next_at!=null).length, fabric:items.filter((item)=>item.kind==='fabric_work').length, memberCare:items.filter((item)=>item.kind==='fabric_work'&&item.type==='MEMBER_CARE').length }, items };
      }
      case 'events': {
        const items = await rows(this.db, `select event_id,title,event_type,status,starts_at,ends_at,capacity,created_by,created_at from server_events where guild_id=$1 order by starts_at desc nulls last limit 100`, [guildId]);
        return { key, summary:{ total:items.length, active:items.filter((item)=>['DRAFT','OPEN','SCHEDULED','ACTIVE'].includes(String(item.status))).length }, items };
      }
      case 'gaming': {
        const items = await rows(this.db, `
          select 'lfg'::text as kind,lfg_id::text as id,game_key as scope,status,owner_user_id as actor_id,created_at from lfg_posts where guild_id=$1
          union all select 'team',team_id::text,game_key,status,captain_user_id,created_at from teams where guild_id=$1
          union all select 'clan',clan_id::text,game_key,status,leader_user_id,created_at from clans where guild_id=$1
          union all select 'tournament',tournament_id::text,game_key,status,created_by,created_at from tournaments where guild_id=$1
          union all select 'recruitment',recruitment_post_id::text,game_key,status,owner_user_id,created_at from recruitment_posts where guild_id=$1
          union all select 'session',session_id::text,game_key,status,host_user_id,created_at from gaming_sessions where guild_id=$1
          order by created_at desc limit 200`, [guildId]);
        const availability = (await rows(this.db, `select count(*)::int as windows,count(distinct user_id)::int as members,count(distinct game_key)::int as games from gaming_availability_windows where guild_id=$1`, [guildId]))[0] ?? {};
        const sessionReliability=(await rows(this.db, `select count(*) filter(where status='WAITLISTED')::int as waitlisted,count(*) filter(where status='JOINED' and check_in_state='CHECKED_IN')::int as checked_in,count(*) filter(where status='JOINED')::int as joined from gaming_session_participants where guild_id=$1`,[guildId]))[0]??{};
        return { key, summary:{ total:items.length, active:items.filter((item)=>!['CLOSED','ARCHIVED','COMPLETED','CANCELLED','EXPIRED'].includes(String(item.status))).length, sessions:items.filter((item)=>item.kind==='session').length, activeSessions:items.filter((item)=>item.kind==='session'&&['OPEN','READY','ACTIVE'].includes(String(item.status))).length, waitlistedMembers:Number(sessionReliability.waitlisted??0), checkedInMembers:Number(sessionReliability.checked_in??0), joinedSessionMembers:Number(sessionReliability.joined??0), availabilityMembers:Number(availability.members??0), availabilityWindows:Number(availability.windows??0), availabilityGames:Number(availability.games??0), availabilityDetailExposed:false }, items };
      }
      case 'incidents': {
        const items = await rows(this.db, `select incident_id::text as id,kind,severity,status,title,commander_id,opened_by,correlation_id,started_at,resolved_at,closed_at,updated_at from operational_incidents where guild_id=$1 order by case status when 'CLOSED' then 2 else 1 end,case severity when 'CRITICAL' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,started_at desc limit 120`, [guildId]);
        const recentEvents = await rows(this.db, `select event_id::text as id,'incident_event'::text as kind,incident_id::text,event_type as status,actor_id,note,correlation_id,created_at from operational_incident_events where guild_id=$1 order by created_at desc limit 80`, [guildId]);
        return { key, summary:{ total:items.length, open:items.filter((item)=>item.status!=='CLOSED').length, criticalOpen:items.filter((item)=>item.severity==='CRITICAL'&&!['RESOLVED','CLOSED'].includes(String(item.status))).length, monitoring:items.filter((item)=>item.status==='MONITORING').length, recentTimelineEvents:recentEvents.length }, items:[...items,...recentEvents].slice(0,180) };
      }
      case 'capacity': {
        const items = await rows(this.db, `select assessment_id::text as id,pressure as status,score,signals,policy,reasons,actions,actor_id,correlation_id,created_at from capacity_assessments where guild_id=$1 order by created_at desc limit 80`, [guildId]);
        return { key, summary:{ assessments:items.length, emergency:items.filter((item)=>item.status==='EMERGENCY').length, throttle:items.filter((item)=>item.status==='THROTTLE').length, latestScore:items.length?Number(items[0].score):null, latestPressure:items.length?String(items[0].status):'UNKNOWN' }, items };
      }
      case 'admission': {
        const policies = await rows(this.db, `select guild_id as id,'policy'::text as kind,preset,mode as status,fail_closed_when_unknown,updated_by,updated_at from admission_control_policies where guild_id=$1`, [guildId]);
        const decisions = await rows(this.db, `select decision_id::text as id,'decision'::text as kind,operation_class,pressure,decision as status,would_decision,enforced,reason,retry_after_seconds,actor_id,correlation_id,created_at from admission_decisions where guild_id=$1 order by created_at desc limit 120`, [guildId]);
        return { key, summary:{ policies:policies.length, decisions:decisions.length, deferred:decisions.filter((item)=>item.status==='DEFER').length, observeWouldDefer:decisions.filter((item)=>item.status==='ALLOW'&&item.would_decision==='DEFER').length }, items:[...policies,...decisions] };
      }
      case 'budgets': {
        const policies = await rows(this.db, `select p.budget_key as id,'policy'::text as kind,p.budget_key,p.enabled,p.mode as status,p.window_seconds,p.max_units,p.updated_by,p.updated_at,
          coalesce((select w.units_used from resource_budget_windows w where w.guild_id=p.guild_id and w.budget_key=p.budget_key order by w.window_started_at desc limit 1),0)::int as units_used,
          (select w.window_started_at from resource_budget_windows w where w.guild_id=p.guild_id and w.budget_key=p.budget_key order by w.window_started_at desc limit 1) as window_started_at
          from resource_budget_policies p where p.guild_id=$1 order by p.budget_key`, [guildId]);
        const events = await rows(this.db, `select event_id::text as id,'event'::text as kind,budget_key,decision as status,units,used_before,used_after,max_units,retry_at,actor_id,correlation_id,detail,created_at from resource_budget_events where guild_id=$1 order by created_at desc limit 100`, [guildId]);
        return { key, summary:{ policies:policies.length, enforcing:policies.filter((item)=>item.status==='ENFORCE'&&item.enabled===true).length, observeOnly:policies.filter((item)=>item.status==='OBSERVE'&&item.enabled===true).length, deferredLast100:events.filter((item)=>item.status==='DEFER').length, observedOverLast100:events.filter((item)=>item.status==='OBSERVE_OVER').length }, items:[...policies,...events].slice(0,180) };
      }
      case 'automation': {
        const rules = await rows(this.db, `select rule_id::text as id,'rule'::text as kind,rule_key,event_type,enabled,version,conditions,actions,updated_at from automation_rules where guild_id=$1 order by rule_key limit 100`, [guildId]);
        const executions = await rows(this.db, `select execution_id::text as id,'execution'::text as kind,rule_id::text,source_event_id::text,status,action_count,budget_decision,last_error_code,created_at,finished_at from automation_executions where guild_id=$1 order by created_at desc limit 100`, [guildId]);
        const receipts = await rows(this.db, `select event_id::text as id,'receipt'::text as kind,state as status,attempts,next_attempt_at,last_error_code,processed_at,updated_at from automation_event_receipts where guild_id=$1 order by updated_at desc limit 80`, [guildId]);
        return { key, summary:{ rules:rules.length, enabledRules:rules.filter((item)=>item.enabled===true).length, recentExecutions:executions.length, failedExecutions:executions.filter((item)=>item.status==='FAILED').length, deferredEvents:receipts.filter((item)=>item.status==='DEFERRED').length }, items:[...rules,...executions,...receipts].slice(0,240) };
      }
      case 'recovery_drills': {
        const items = await rows(this.db, `select drill_id::text as id,drill_type,status,objective,expected_checks,evidence,blockers,created_by,correlation_id,started_at,finished_at,created_at,updated_at from recovery_drill_runs where guild_id=$1 order by created_at desc limit 100`, [guildId]);
        return { key, summary:{ total:items.length, planned:items.filter((item)=>item.status==='PLANNED').length, running:items.filter((item)=>item.status==='RUNNING').length, blocked:items.filter((item)=>item.status==='BLOCKED').length, passed:items.filter((item)=>item.status==='PASSED').length, failed:items.filter((item)=>item.status==='FAILED').length }, items };
      }
      case 'security': {
        const items = await rows(this.db, `select observation_id::text as id,event_type,resource_id,resource_name,occurred_at as created_at from security_observations where guild_id=$1 order by created_at desc limit 100`, [guildId]);
        const mod = await rows(this.db, `select action_id::text as id,action_type,result,automated,target_user_id,created_at from moderation_actions where guild_id=$1 order by created_at desc limit 50`, [guildId]);
        const rateLimits = await rows(this.db, `select left(subject_hash,12) as id,'rate_limit_window'::text as kind,route_class,request_count,request_limit,(request_count>request_limit) as throttled,window_start,last_seen_at as created_at from http_rate_limit_windows where guild_id=$1 and last_seen_at>=now()-interval '1 hour' order by last_seen_at desc limit 60`, [guildId]);
        return { key, summary:{ observations:items.length, moderationActions:mod.length, recentRateLimitWindows:rateLimits.length, throttledWindows:rateLimits.filter((item)=>item.throttled===true).length }, items:[...rateLimits,...items.map((item)=>({kind:'observation',...item})),...mod.map((item)=>({kind:'moderation',...item}))].slice(0,160) };
      }
      case 'integrations': {
        const integrations = await rows(this.db, `select integration_key as id,'integration'::text as kind,integration_key,status,enabled,capabilities,config,last_health_at,last_error_code,last_health_detail,config_version,updated_at from integrations where guild_id=$1 order by integration_key limit 100`, [guildId]);
        const history = await rows(this.db, `select event_id::text as id,'integration_event'::text as kind,integration_key,action as status,after_state,detail,created_at from integration_events where guild_id=$1 order by created_at desc limit 80`, [guildId]);
        const webhooks = await rows(this.db, `select delivery_id::text as id,'webhook_delivery'::text as kind,integration_key,state as status,event_count,left(body_hash,12) as body_fingerprint,last_error_code,received_at as created_at,processed_at,expires_at from webhook_deliveries where guild_id=$1 order by received_at desc limit 60`, [guildId]);
        const snapshots = await rows(this.db, `select snapshot_id::text as id,'integration_snapshot'::text as kind,integration_key,'SYNCED'::text as status,content_type,external_version,left(content_hash,12) as content_fingerprint,item_count,created_at from integration_sync_snapshots where guild_id=$1 order by created_at desc limit 60`, [guildId]);
        return { key, summary:{ total:integrations.length, healthy:integrations.filter((item)=>['HEALTHY','ACTIVE','READY'].includes(String(item.status))).length, recentEvents:history.length, snapshots:snapshots.length, webhookReceipts:webhooks.length, webhookFailures:webhooks.filter((item)=>item.status==='FAILED').length }, items:[...integrations,...snapshots,...webhooks,...history].slice(0,220) };
      }
      case 'scheduler': {
        const raw = await rows(this.db, `select task_id::text as id,task_type,state as status,run_at,timezone,attempts,updated_at from scheduled_tasks where guild_id=$1 order by run_at asc limit 100`, [guildId]);
        const items:Array<Record<string,unknown>&{cancellable:boolean}>=raw.map((item)=>({...item,cancellable:isUserCancellableTask(String(item.task_type),String(item.status) as any)}));
        return { key, summary:{ total:items.length, due:items.filter((item)=>new Date(String(item.run_at)).getTime()<=Date.now() && item.status==='SCHEDULED').length, userCancellable:items.filter((item)=>item.cancellable===true).length }, items };
      }
      case 'analytics': {
        const items = await rows(this.db, `select metric_date,metric_key,dimensions,value,sample_count from analytics_daily where guild_id=$1 order by metric_date desc,metric_key limit 150`, [guildId]);
        const recommendations = await rows(this.db, `select recommendation_id::text as id,recommendation_key,risk,destructive,title,reason,status,created_at from recommendations where guild_id=$1 and status='OPEN' order by created_at desc limit 50`, [guildId]);
        const scalarByMetric=new Map<string,Array<Record<string,unknown>>>();
        for(const item of items){const dimensions=item.dimensions&&typeof item.dimensions==='object'&&!Array.isArray(item.dimensions)?item.dimensions as Record<string,unknown>:{};if(Object.keys(dimensions).length)continue;const metric=String(item.metric_key);const list=scalarByMetric.get(metric)??[];list.push(item);scalarByMetric.set(metric,list);}
        const lowerIsBetter=new Set(['tickets.resolution_minutes_avg','security.observations']);
        const trends:Array<Record<string,unknown>>=[];
        for(const [metric,points] of scalarByMetric){if(points.length<2)continue;const current=points[0]!,previous=points[1]!;const trend=evaluateMetricTrend({value:Number(previous.value??0),sampleCount:Number(previous.sample_count??0)},{value:Number(current.value??0),sampleCount:Number(current.sample_count??0)},{higherIsBetter:!lowerIsBetter.has(metric),minimumSamples:1});trends.push({kind:'metric_trend',metric_key:metric,direction:trend.direction,health:trend.health,current:trend.current,previous:trend.previous,percent_change:trend.percentChange,current_date:current.metric_date,previous_date:previous.metric_date});}
        const [jobSlo,notificationSlo,automationSlo]=await Promise.all([
          rows(this.db,`select count(*) filter(where status='SUCCEEDED')::int as good,count(*)::int as total from jobs where guild_id=$1 and status in ('SUCCEEDED','FAILED','DEAD_LETTER') and coalesce(finished_at,updated_at)>=now()-interval '24 hours'`,[guildId]),
          rows(this.db,`select count(*) filter(where state='DELIVERED')::int as good,count(*)::int as total from notification_deliveries where guild_id=$1 and state in ('DELIVERED','FAILED') and updated_at>=now()-interval '24 hours'`,[guildId]),
          rows(this.db,`select count(*) filter(where state='SUCCEEDED')::int as good,count(*)::int as total from automation_event_receipts where guild_id=$1 and state in ('SUCCEEDED','FAILED') and updated_at>=now()-interval '24 hours'`,[guildId]),
        ]);
        const sloInputs=[['jobs.terminal_success_24h',jobSlo[0],0.99],['notifications.delivery_success_24h',notificationSlo[0],0.98],['automation.receipt_success_24h',automationSlo[0],0.99]] as const;
        const slos=sloInputs.map(([objective,row,target])=>{const result=evaluateErrorBudget({good:Number(row?.good??0),total:Number(row?.total??0),targetRatio:target,minimumSamples:20});return{kind:'slo',objective,target_ratio:target,health:result.health,observed_ratio:result.observedRatio,good:result.good,total:result.total,bad:result.bad,remaining_fraction:result.remainingFraction,burn_multiple:result.burnMultiple,sufficient_samples:result.sufficientSamples,window:'24h'};});
        return { key, summary:{ metrics:items.length, trends:trends.length, degradedTrends:trends.filter((item)=>item.health==='DEGRADED').length, watchTrends:trends.filter((item)=>item.health==='WATCH').length, sloObjectives:slos.length, sloExhausted:slos.filter((item)=>item.health==='EXHAUSTED').length, sloWatch:slos.filter((item)=>item.health==='WATCH').length, openRecommendations:recommendations.length, destructiveRecommendations:recommendations.filter((item)=>item.destructive===true).length }, items:[...slos,...recommendations.map((item)=>({kind:'recommendation',...item})),...trends,...items.map((item)=>({kind:'metric',...item}))].slice(0,240) };
      }
      case 'governance': {
        const changes = await rows(this.db, `select change_run_id::text as id,'change'::text as kind,mode as type,state as status,risk,from_template,to_template,created_at,updated_at from change_runs where guild_id=$1 order by created_at desc limit 50`, [guildId]);
        const flags = await rows(this.db, `select rollout_id::text as id,'feature_flag'::text as kind,feature_key as type,state,scope,rollout_percent,revision,updated_at from feature_rollouts where guild_id=$1 or guild_id is null order by updated_at desc limit 50`, [guildId]);
        const flagHistory = await rows(this.db, `select history_id::text as id,'feature_flag_history'::text as kind,feature_key as type,action as status,revision,reason,created_at from feature_rollout_history where guild_id=$1 or guild_id is null order by created_at desc limit 40`, [guildId]);
        const flagObservations = await rows(this.db, `select observation_id::text as id,'feature_flag_observation'::text as kind,feature_key as type,case when enabled then 'ENABLED' else 'DISABLED' end as status,reason,bucket,rollout_revision,observed_at as created_at from feature_rollout_observations where guild_id=$1 order by observed_at desc limit 40`, [guildId]);
        const ai = await rows(this.db, `select run_id::text as id,'ai_hook'::text as kind,capability as type,state as status,provider_key,duration_ms,created_at from ai_hook_runs where guild_id=$1 order by created_at desc limit 40`, [guildId]);
        const giveaways = await rows(this.db, `select giveaway_id::text as id,'free_entry_reward'::text as kind,title as type,status,winner_count,closes_at,created_at from giveaways where guild_id=$1 order by created_at desc limit 40`, [guildId]);
        const maintenance = await rows(this.db, `select maintenance_id::text as id,'maintenance'::text as kind,coalesce(reason,'maintenance') as type,state as status,starts_at,ends_at,updated_at from maintenance_windows where guild_id=$1 order by starts_at desc limit 30`, [guildId]);
        const growth = await rows(this.db, `select assessment_id::text as id,'growth'::text as kind,mode as type,'ASSESSED'::text as status,score,recommendations,created_at from growth_assessments where guild_id=$1 order by created_at desc limit 20`, [guildId]);
        const documents = await rows(this.db, `select document_id::text as id,'generated_document'::text as kind,document_type as type,'SNAPSHOT'::text as status,content_hash,created_at from generated_document_snapshots where guild_id=$1 order by created_at desc limit 30`, [guildId]);
        const configImports = await rows(this.db, `select import_id::text as id,'config_import_preview'::text as kind,('schema '||source_schema_version::text||'→'||target_schema_version::text) as type,'PREVIEWED'::text as status,plan_hash,actionable_count,conflicts,created_at from portable_config_import_previews where guild_id=$1 order by created_at desc limit 30`, [guildId]);
        return { key, summary:{ changeRuns:changes.length, featureRollouts:flags.length, rolloutHistory:flagHistory.length, rolloutObservations:flagObservations.length, configImportPreviews:configImports.length, aiRuns:ai.length, freeEntryRewards:giveaways.length, maintenanceWindows:maintenance.length, growthAssessments:growth.length, generatedDocuments:documents.length }, items:[...maintenance,...growth,...documents,...configImports,...flagObservations,...flagHistory,...changes,...flags,...ai,...giveaways].slice(0,240) };
      }
      case 'plugins': {
        const items = await rows(this.db, `select plugin_key,version,state,execution_mode,trust_level,enabled,updated_at from plugin_installations where guild_id=$1 order by plugin_key limit 100`, [guildId]);
        return { key, summary:{ total:items.length, enabled:items.filter((item)=>item.enabled===true).length, external:items.filter((item)=>item.execution_mode==='EXTERNAL_PROCESS').length }, items };
      }
      case 'audit': {
        const page=await new AuditLogService(this.db).list({guildId,limit:100});
        const items=page.items.map((item)=>({id:item.auditId,action:item.action,result:item.result,resource_type:item.resourceType??null,resource_id:item.resourceId??null,actor_id:item.actorId??null,correlation_id:item.correlationId,error_code:item.errorCode??null,created_at:item.createdAt}));
        return {key,summary:{total:items.length,failed:items.filter((item)=>item.result!=='SUCCEEDED').length,redacted:true},items};
      }
      case 'settings': {
        const items = await rows(this.db, `select template_key,template_version,language,timezone,theme_key,schema_version,version as config_version,last_applied_version,last_verified_version,migration_status,enabled_modules,updated_at from guild_configs where guild_id=$1 limit 1`, [guildId]);
        return { key, summary:{ configured:items.length===1 }, items };
      }
    }
  }
}

export const OPERATIONAL_VIEW_KEYS: readonly OperationalViewKey[] = ['panels','resources','access','tickets','workflows','events','gaming','incidents','capacity','admission','budgets','automation','recovery_drills','security','integrations','scheduler','analytics','audit','governance','plugins','settings'];
