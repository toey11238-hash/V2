import type { IntegrationAdapter, IntegrationAdapterContext, IntegrationSyncResult } from '../index.ts';

interface JsonClient { json<T=unknown>(url:string,init?:RequestInit):Promise<T>; }
interface DiscordStatusPayload { page?:{name?:string;updated_at?:string};status?:{indicator?:string;description?:string};components?:Array<{id?:string;name?:string;status?:string;group?:boolean;group_id?:string|null;updated_at?:string}>;incidents?:Array<{id?:string;name?:string;status?:string;impact?:string;updated_at?:string;shortlink?:string}>;scheduled_maintenances?:Array<{id?:string;name?:string;status?:string;impact?:string;scheduled_for?:string;scheduled_until?:string;updated_at?:string}>; }
const INDICATORS=new Set(['none','minor','major','critical','maintenance']);

function normalizeStatus(payload:DiscordStatusPayload){
  const indicator=String(payload.status?.indicator??'').trim();
  const description=String(payload.status?.description??'').trim();
  if(!INDICATORS.has(indicator)||!description)throw new Error('DISCORD_STATUS_RESPONSE_INVALID');
  return {indicator,description,pageUpdatedAt:payload.page?.updated_at??null};
}

export function createDiscordStatusAdapter(http:JsonClient):IntegrationAdapter{
  return {
    key:'discord-status',capabilities:{status:true,content:true},
    async health(_context?:IntegrationAdapterContext){
      const payload=await http.json<DiscordStatusPayload>('https://discordstatus.com/api/v2/status.json');
      const status=normalizeStatus(payload);
      return {healthy:true,detail:`Discord Status API reachable; current indicator ${status.indicator} (${status.description}).`};
    },
    async sync(_context:IntegrationAdapterContext):Promise<IntegrationSyncResult>{
      const payload=await http.json<DiscordStatusPayload>('https://discordstatus.com/api/v2/summary.json');
      const status=normalizeStatus(payload);
      const components=(payload.components??[]).slice(0,100).map((item)=>({id:String(item.id??''),name:String(item.name??''),status:String(item.status??'unknown'),group:Boolean(item.group),groupId:item.group_id??null,updatedAt:item.updated_at??null})).filter((item)=>item.id&&item.name);
      const incidents=(payload.incidents??[]).slice(0,50).map((item)=>({id:String(item.id??''),name:String(item.name??''),status:String(item.status??''),impact:String(item.impact??''),updatedAt:item.updated_at??null,shortlink:item.shortlink??null})).filter((item)=>item.id&&item.name);
      const maintenance=(payload.scheduled_maintenances??[]).slice(0,50).map((item)=>({id:String(item.id??''),name:String(item.name??''),status:String(item.status??''),impact:String(item.impact??''),scheduledFor:item.scheduled_for??null,scheduledUntil:item.scheduled_until??null,updatedAt:item.updated_at??null})).filter((item)=>item.id&&item.name);
      return {contentType:'discord-status',externalVersion:status.pageUpdatedAt??undefined,itemCount:components.length+incidents.length+maintenance.length,payload:{provider:'discord-status',status,components,incidents,scheduledMaintenances:maintenance},detail:`Synced Discord status ${status.indicator}; ${components.length} component(s), ${incidents.length} unresolved incident(s), ${maintenance.length} maintenance record(s).`};
    },
  };
}
