import type { Database } from '@autoserver/database';

export interface MetricPoint { metric: string; value: number; at: Date; dimensions?: Record<string, string>; }
export interface MetricAggregate { metric: string; count: number; sum: number; min: number; max: number; average: number; }
export function aggregateMetric(metric: string, points: readonly MetricPoint[]): MetricAggregate {
  const values = points.filter((p) => p.metric === metric).map((p) => p.value).filter(Number.isFinite);
  if (!values.length) return { metric, count: 0, sum: 0, min: 0, max: 0, average: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { metric, count: values.length, sum, min: Math.min(...values), max: Math.max(...values), average: sum / values.length };
}

export interface DailyMetricRecord { metricKey: string; value: number; sampleCount: number; dimensions: Record<string,string>; }

function safeDate(value: string): string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_METRIC_DATE');
  return value;
}

export class AnalyticsService {
  constructor(private readonly database: Database) {}

  async aggregateGuildDay(guildId: string, metricDate: string): Promise<DailyMetricRecord[]> {
    const day=safeDate(metricDate); const pool=this.database.requirePool();
    const scalarQueries:Array<[string,string,string?]>= [
      ['members.joined',`select count(*)::float8 as value from member_onboarding where guild_id=$1 and joined_at >= $2::date and joined_at < $2::date+interval '1 day'`],
      ['verification.succeeded',`select count(*)::float8 as value from verification_attempts where guild_id=$1 and result='SUCCEEDED' and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['tickets.created',`select count(*)::float8 as value from tickets where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['tickets.closed',`select count(*)::float8 as value from tickets where guild_id=$1 and closed_at >= $2::date and closed_at < $2::date+interval '1 day'`],
      ['tickets.resolution_minutes_avg',`select coalesce(avg(extract(epoch from (closed_at-created_at))/60.0),0)::float8 as value,count(*)::int as samples from tickets where guild_id=$1 and closed_at is not null and closed_at >= $2::date and closed_at < $2::date+interval '1 day'`],
      ['panels.interactions',`select count(*)::float8 as value from panel_interaction_events where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['events.registrations',`select count(*)::float8 as value from event_registrations r join server_events e using(event_id) where e.guild_id=$1 and r.created_at >= $2::date and r.created_at < $2::date+interval '1 day'`],
      ['events.checkins',`select count(*)::float8 as value from event_registrations r join server_events e using(event_id) where e.guild_id=$1 and r.checked_in_at >= $2::date and r.checked_in_at < $2::date+interval '1 day'`],
      ['gaming.lfg_created',`select count(*)::float8 as value from lfg_posts where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['gaming.sessions_created',`select count(*)::float8 as value from gaming_sessions where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['gaming.sessions_completed',`select count(*)::float8 as value from gaming_sessions where guild_id=$1 and completed_at >= $2::date and completed_at < $2::date+interval '1 day'`],
      ['gaming.session_joins',`select count(*)::float8 as value from gaming_session_participants where guild_id=$1 and status='JOINED' and joined_at >= $2::date and joined_at < $2::date+interval '1 day'`],
      ['gaming.session_waitlisted',`select count(*)::float8 as value from gaming_session_participants where guild_id=$1 and status='WAITLISTED' and joined_at >= $2::date and joined_at < $2::date+interval '1 day'`],
      ['gaming.session_checkins',`select count(*)::float8 as value from gaming_session_participants where guild_id=$1 and check_in_state='CHECKED_IN' and checked_in_at >= $2::date and checked_in_at < $2::date+interval '1 day'`],
      ['gaming.xp_awarded',`select coalesce(sum(amount),0)::float8 as value,count(*)::int as samples from xp_events where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['security.observations',`select count(*)::float8 as value from security_observations where guild_id=$1 and occurred_at >= $2::date and occurred_at < $2::date+interval '1 day'`],
      ['suggestions.created',`select count(*)::float8 as value from suggestions where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['applications.created',`select count(*)::float8 as value from applications where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
      ['reports.created',`select count(*)::float8 as value from reports where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day'`],
    ];
    const records:DailyMetricRecord[]=[];
    for(const [metricKey,sql] of scalarQueries) {
      const row=(await pool.query<any>(sql,[guildId,day])).rows[0]??{};
      records.push({metricKey,value:Number(row.value??0),sampleCount:Number(row.samples??1),dimensions:{}});
    }
    const panelRows=(await pool.query<any>(`select panel_id,action_key,count(*)::float8 as value from panel_interaction_events where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day' group by panel_id,action_key`,[guildId,day])).rows;
    for(const row of panelRows) records.push({metricKey:'panels.action',value:Number(row.value??0),sampleCount:Number(row.value??0),dimensions:{panelId:String(row.panel_id),actionKey:String(row.action_key)}});
    const gameRows=(await pool.query<any>(`select game_key,count(*)::float8 as value from lfg_posts where guild_id=$1 and created_at >= $2::date and created_at < $2::date+interval '1 day' group by game_key`,[guildId,day])).rows;
    for(const row of gameRows) records.push({metricKey:'gaming.lfg_created',value:Number(row.value??0),sampleCount:Number(row.value??0),dimensions:{gameKey:String(row.game_key)}});
    await this.database.transaction(async(client)=>{
      for(const metric of records) await client.query(
        `insert into analytics_daily(guild_id,metric_date,metric_key,dimensions,value,sample_count,updated_at)
         values($1,$2::date,$3,$4,$5,$6,now())
         on conflict (guild_id,metric_date,metric_key,dimensions) do update set value=excluded.value,sample_count=excluded.sample_count,updated_at=now()`,
        [guildId,day,metric.metricKey,metric.dimensions,metric.value,metric.sampleCount],
      );
    });
    return records;
  }

  async listGuildDay(guildId:string,metricDate:string):Promise<DailyMetricRecord[]> {
    const {rows}=await this.database.requirePool().query<any>(`select metric_key,dimensions,value,sample_count from analytics_daily where guild_id=$1 and metric_date=$2::date order by metric_key,dimensions::text`,[guildId,safeDate(metricDate)]);
    return rows.map((row)=>({metricKey:String(row.metric_key),dimensions:row.dimensions??{},value:Number(row.value??0),sampleCount:Number(row.sample_count??0)}));
  }
}

export { evaluateMetricTrend } from './trends-pure.ts';
export type { MetricHealth, MetricTrendDirection, MetricTrendPoint, MetricTrendResult } from './trends-pure.ts';
export { evaluateErrorBudget } from './slo-pure.ts';
export type { ErrorBudgetHealth, ErrorBudgetInput, ErrorBudgetResult } from './slo-pure.ts';
