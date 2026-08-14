import type { EventEnvelope } from '@autoserver/core';

export interface ReplaySourceEvent extends Pick<EventEnvelope,'eventId'|'type'|'guildId'|'correlationId'|'source'|'aggregateKey'|'sequence'|'occurredAt'|'payload'>{origin:'DURABLE'|'LIVE'}
export interface ReplayTimelineEvent{
  eventId:string;type:string;guildId?:string;correlationId:string;source?:string;aggregateKey?:string;sequence?:number;occurredAt:string;origin:'DURABLE'|'LIVE';offsetMs:number;payload:unknown;redactedFields:number;ordering:'OK'|'GAP'|'STALE'|'UNSEQUENCED';
}
export interface EventReplayReport{
  schemaVersion:1;
  mode:'READ_ONLY_SANDBOX';
  sideEffectsAllowed:false;
  events:ReplayTimelineEvent[];
  startedAt:string|null;
  endedAt:string|null;
  durationMs:number;
  eventTypes:Record<string,number>;
  correlations:number;
  aggregates:number;
  orderingGaps:number;
  staleSequences:number;
  duplicateEventsDropped:number;
  redactedFields:number;
  sources:{durable:number;live:number};
  note:string;
}

const secretKey=/token|secret|password|authorization|cookie|api[-_]?key|private[-_]?key|signature/i;
function sanitize(value:unknown,depth=0):{value:unknown;redacted:number}{
  if(depth>4)return{value:'[ตัดข้อมูลเกินระดับที่อนุญาต]',redacted:1};
  if(value===null||typeof value==='number'||typeof value==='boolean')return{value,redacted:0};
  if(typeof value==='string')return{value:value.length>500?`${value.slice(0,500)}…`:value,redacted:0};
  if(Array.isArray(value)){
    let redacted=value.length>25?1:0;const out=[] as unknown[];
    for(const item of value.slice(0,25)){const next=sanitize(item,depth+1);out.push(next.value);redacted+=next.redacted;}
    return{value:out,redacted};
  }
  if(typeof value==='object'){
    const out:Record<string,unknown>={};let redacted=0;const entries=Object.entries(value as Record<string,unknown>);
    if(entries.length>50)redacted+=1;
    for(const [key,item] of entries.slice(0,50)){
      if(secretKey.test(key)){out[key]='[ปกปิด]';redacted+=1;continue;}
      const next=sanitize(item,depth+1);out[key]=next.value;redacted+=next.redacted;
    }
    return{value:out,redacted};
  }
  return{value:String(value),redacted:0};
}

export function buildEventReplay(events:readonly ReplaySourceEvent[],limit=200):EventReplayReport{
  const bounded=Math.max(1,Math.min(500,Math.floor(limit)));
  const sorted=[...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||((a.sequence??Number.MAX_SAFE_INTEGER)-(b.sequence??Number.MAX_SAFE_INTEGER))||a.eventId.localeCompare(b.eventId));
  const seen=new Set<string>();let duplicates=0;const unique:ReplaySourceEvent[]=[];
  for(const event of sorted){if(seen.has(event.eventId)){duplicates+=1;continue;}seen.add(event.eventId);unique.push(event);}
  const selected=unique.slice(Math.max(0,unique.length-bounded));
  const startMs=selected.length?Date.parse(selected[0]!.occurredAt):0;
  const headByAggregate=new Map<string,number>();
  let orderingGaps=0,staleSequences=0,redactedFields=0,durable=0,live=0;
  const eventTypes:Record<string,number>={};const correlations=new Set<string>(),aggregates=new Set<string>();
  const timeline:ReplayTimelineEvent[]=selected.map((event)=>{
    eventTypes[event.type]=(eventTypes[event.type]??0)+1;correlations.add(event.correlationId);if(event.aggregateKey)aggregates.add(event.aggregateKey);event.origin==='DURABLE'?durable+=1:live+=1;
    let ordering:ReplayTimelineEvent['ordering']='UNSEQUENCED';
    if(event.aggregateKey&&Number.isSafeInteger(event.sequence)){
      const previous=headByAggregate.get(event.aggregateKey);
      if(previous===undefined||event.sequence===previous+1)ordering='OK';
      else if(event.sequence! <= previous){ordering='STALE';staleSequences+=1;}
      else{ordering='GAP';orderingGaps+=1;}
      if(previous===undefined||event.sequence! > previous)headByAggregate.set(event.aggregateKey,event.sequence!);
    }
    const clean=sanitize(event.payload);redactedFields+=clean.redacted;
    return{eventId:event.eventId,type:event.type,guildId:event.guildId,correlationId:event.correlationId,source:event.source,aggregateKey:event.aggregateKey,sequence:event.sequence,occurredAt:event.occurredAt,origin:event.origin,offsetMs:startMs?Math.max(0,Date.parse(event.occurredAt)-startMs):0,payload:clean.value,redactedFields:clean.redacted,ordering};
  });
  const endMs=timeline.length?Date.parse(timeline.at(-1)!.occurredAt):0;
  return{schemaVersion:1,mode:'READ_ONLY_SANDBOX',sideEffectsAllowed:false,events:timeline,startedAt:timeline[0]?.occurredAt??null,endedAt:timeline.at(-1)?.occurredAt??null,durationMs:startMs&&endMs?Math.max(0,endMs-startMs):0,eventTypes,correlations:correlations.size,aggregates:aggregates.size,orderingGaps,staleSequences,duplicateEventsDropped:duplicates,redactedFields,sources:{durable,live},note:'การเล่นย้อนหลังเป็นแบบอ่านอย่างเดียว ไม่เผยแพร่เหตุการณ์กลับเข้าบัส ไม่เรียก Discord API และไม่เปลี่ยนข้อมูลในฐานข้อมูล'};
}
