import type { Client } from 'discord.js';
import type { EventEnvelope, InProcessEventBus } from '@autoserver/core';
import { sha256 } from '@autoserver/core';
import { PanelLiveStateRepository, type Database, type PanelLiveStateRecord } from '@autoserver/database';
import { PanelDeploymentService } from '@autoserver/panels';
import { deriveLivingPanelTransitions, livingPanelExpiry, livingPanelRenderDelayMs, livingPanelStateHash } from '@autoserver/visual-experience';

const timerKey=(guildId:string,panelId:string)=>`${guildId}:${panelId}`;

export class LivingPanelWorker {
  private readonly states:PanelLiveStateRepository;
  private readonly panels:PanelDeploymentService;
  private readonly timers=new Map<string,NodeJS.Timeout>();
  private unsubscribe?:()=>void;
  private active=false;
  constructor(private readonly database:Database,private readonly client:Client,private readonly minimumDiscordEditIntervalMs=15_000){
    this.states=new PanelLiveStateRepository(database);
    this.panels=new PanelDeploymentService(database);
  }
  async start(bus:InProcessEventBus):Promise<void>{
    if(this.active)return;
    this.active=true;
    this.unsubscribe=bus.subscribe((event)=>this.handle(event));
    const pending=await this.states.listPending(500).catch(()=>[]);
    for(const record of pending)this.schedule(record);
  }
  stop():void{
    this.active=false;
    this.unsubscribe?.();this.unsubscribe=undefined;
    for(const timer of this.timers.values())clearTimeout(timer);
    this.timers.clear();
  }
  private async handle(event:EventEnvelope):Promise<void>{
    if(!this.active||!event.guildId)return;
    for(const transition of deriveLivingPanelTransitions(event)){
      const expiresAt=livingPanelExpiry(event.occurredAt,transition.ttlSeconds);
      const result=await this.states.applyTransition({guildId:event.guildId,panelId:transition.panelId,eventId:event.eventId,eventType:event.type,correlationId:event.correlationId,state:transition.state,stateHash:livingPanelStateHash({panelId:transition.panelId,state:transition.state,reason:transition.reason,eventId:event.eventId}),reason:transition.reason,expiresAt,metadata:{priority:transition.priority,source:event.source??null}}).catch(()=>null);
      if(result?.applied)this.schedule(result.record);
    }
  }
  private schedule(record:PanelLiveStateRecord):void{
    const key=timerKey(record.guildId,record.panelId);
    const existing=this.timers.get(key);if(existing)clearTimeout(existing);
    const now=Date.now();
    const delayFromRender=record.lastRenderedAt?Math.max(0,record.lastRenderedAt.getTime()+Math.max(this.minimumDiscordEditIntervalMs,livingPanelRenderDelayMs(record.state))-now):0;
    const delay=Math.max(0,delayFromRender);
    const timer=setTimeout(()=>void this.renderLatest(record.guildId,record.panelId),delay);
    timer.unref?.();this.timers.set(key,timer);
  }
  private async renderLatest(guildId:string,panelId:string):Promise<void>{
    const key=timerKey(guildId,panelId);this.timers.delete(key);
    if(!this.active)return;
    let record=await this.states.get(guildId,panelId).catch(()=>null);if(!record)return;
    const now=new Date();
    if(record.expiresAt&&record.expiresAt<=now){
      record=await this.states.expire(guildId,panelId,sha256('IDLE:event-state-expired'),now).catch(()=>null);if(!record)return;
    }
    const guild=this.client.guilds.cache.get(guildId);if(!guild){const retry=setTimeout(()=>void this.renderLatest(guildId,panelId),10_000);retry.unref?.();this.timers.set(key,retry);return;}
    const result=await this.panels.renderLiveState({guild,panelId,state:record.state,stateDetail:record.reason,renderedByEventId:record.lastEventId}).catch(()=>null);
    if(result?.messageId)await this.states.markRendered(guildId,panelId,now,this.minimumDiscordEditIntervalMs).catch(()=>undefined);
    const latest=await this.states.get(guildId,panelId).catch(()=>null);
    if(latest?.expiresAt){
      const remaining=latest.expiresAt.getTime()-Date.now();
      if(remaining>0){const timer=setTimeout(()=>void this.renderLatest(guildId,panelId),remaining);timer.unref?.();this.timers.set(key,timer);}
    }
  }
}
