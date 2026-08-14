export type HealthState = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
export interface HealthComponent { key: string; state: HealthState; latencyMs?: number; detail?: string; }
export function overallHealth(components: readonly HealthComponent[]): HealthState {
  if (components.some((c) => c.state === 'OFFLINE')) return 'OFFLINE';
  if (components.some((c) => c.state === 'DEGRADED')) return 'DEGRADED';
  if (components.some((c) => c.state === 'UNKNOWN')) return 'UNKNOWN';
  return components.length ? 'HEALTHY' : 'UNKNOWN';
}

import type { Database } from '@autoserver/database';
export interface ServiceHeartbeat {componentKey:string;instanceId:string;processRole:string;state:HealthState;metadata:Record<string,unknown>;startedAt:string;lastSeenAt:string;stale:boolean;}
export class ServiceHeartbeatRepository{
  constructor(private readonly database:Database){}
  async beat(input:{componentKey:string;instanceId:string;processRole:string;state:HealthState;metadata?:Record<string,unknown>}):Promise<void>{
    await this.database.requirePool().query(`insert into service_heartbeats(component_key,instance_id,process_role,state,metadata) values($1,$2,$3,$4,$5) on conflict(component_key,instance_id) do update set process_role=excluded.process_role,state=excluded.state,metadata=excluded.metadata,last_seen_at=now()`,[input.componentKey,input.instanceId,input.processRole,input.state,input.metadata??{}]);
  }
  async list(staleAfterMs=45_000):Promise<ServiceHeartbeat[]>{
    const {rows}=await this.database.requirePool().query<any>(`select component_key,instance_id,process_role,state,metadata,started_at,last_seen_at from service_heartbeats where last_seen_at>now()-interval '24 hours' order by component_key,last_seen_at desc`);
    const now=Date.now();return rows.map((row)=>{const last=new Date(row.last_seen_at);const stale=now-last.getTime()>staleAfterMs;return {componentKey:row.component_key,instanceId:row.instance_id,processRole:row.process_role,state:stale?'OFFLINE':row.state,metadata:row.metadata??{},startedAt:new Date(row.started_at).toISOString(),lastSeenAt:last.toISOString(),stale};});
  }
}
