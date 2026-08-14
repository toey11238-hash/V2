import { randomUUID } from 'node:crypto';
import type { EventEnvelope, InProcessEventBus } from '@autoserver/core';
import { EventInboxRepository, EventOrderingRepository, type Database } from '@autoserver/database';

export class DurableInboxWorker {
  private readonly inbox: EventInboxRepository;
  private readonly ordering: EventOrderingRepository;
  private readonly workerId=`inbox:${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private active=false;
  private processed=0;
  private stale=0;
  private duplicates=0;

  constructor(database:Database,private readonly bus:InProcessEventBus,private readonly pollMs=750){
    this.inbox=new EventInboxRepository(database);
    this.ordering=new EventOrderingRepository(database);
  }

  start():void{if(this.active)return;this.active=true;void this.tick();}
  stop():void{this.active=false;if(this.timer)clearTimeout(this.timer);}
  healthSnapshot(){return{active:this.active,workerId:this.workerId,processed:this.processed,stale:this.stale,duplicates:this.duplicates};}

  private async tick():Promise<void>{
    if(!this.active)return;
    try{
      const event=await this.inbox.claim(this.workerId,30);
      if(!event)return this.schedule();
      try{
        if(event.source&&event.aggregateKey&&event.sequence!==undefined){
          const decision=await this.ordering.accept({guildId:event.guildId,source:event.source,aggregateKey:event.aggregateKey,sequence:event.sequence,eventId:event.eventId});
          if(!decision.accepted){
            if(decision.duplicate)this.duplicates++;else if(decision.stale)this.stale++;
            await this.inbox.complete(event.eventId,this.workerId);
            this.processed++;
            return this.schedule();
          }
        }
        const envelope:EventEnvelope={eventId:event.eventId,schemaVersion:1,type:event.eventType,guildId:event.guildId,correlationId:event.correlationId,source:event.source,aggregateKey:event.aggregateKey,sequence:event.sequence,occurredAt:new Date().toISOString(),payload:event.payload};
        await this.bus.publish(envelope);
        await this.inbox.complete(event.eventId,this.workerId);
        this.processed++;
      }catch(error){
        const delay=Math.min(60,2**Math.min(event.attempts,5));
        await this.inbox.retry(event.eventId,this.workerId,error instanceof Error?error.name:'INBOX_DISPATCH_ERROR',delay);
      }
    }catch{
      // Database/network recovery is naturally retried by the next poll.
    }
    this.schedule();
  }

  private schedule():void{if(!this.active)return;this.timer=setTimeout(()=>void this.tick(),this.pollMs);}
}
