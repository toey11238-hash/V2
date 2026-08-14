import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import { AuditRepository, MaintenanceWindowRepository } from '@autoserver/database';
import { ResourceBudgetRepository } from '@autoserver/budgets';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { ScheduledTaskRepository } from '@autoserver/scheduler';
import { maintenancePolicyFromAutomation, operationAllowed } from '@autoserver/operations';
import { matchAutomationRule, type AutomationAction } from '@autoserver/automation';
import { AutomationEventRepository, AutomationExecutionRepository, AutomationRuleRepository, type AutomationSourceEvent } from '@autoserver/automation/repository';

export class DurableAutomationWorker {
  private readonly workerId=`automation:${randomUUID()}`;
  private readonly events:AutomationEventRepository;
  private readonly rules:AutomationRuleRepository;
  private readonly executions:AutomationExecutionRepository;
  private readonly budgets:ResourceBudgetRepository;
  private readonly scheduler:ScheduledTaskRepository;
  private readonly audits:AuditRepository;
  private readonly maintenance:MaintenanceWindowRepository;
  private timer?:NodeJS.Timeout;
  private active=false;
  private processed=0;
  private deferred=0;
  private failed=0;
  private executedActions=0;

  constructor(private readonly database:Database,private readonly pollMs=900){
    this.events=new AutomationEventRepository(database);this.rules=new AutomationRuleRepository(database);this.executions=new AutomationExecutionRepository(database);this.budgets=new ResourceBudgetRepository(database);this.scheduler=new ScheduledTaskRepository(database);this.audits=new AuditRepository(database);this.maintenance=new MaintenanceWindowRepository(database);
  }
  start():void{if(this.active)return;this.active=true;void this.tick();}
  stop():void{this.active=false;if(this.timer)clearTimeout(this.timer);}
  healthSnapshot(){return{active:this.active,workerId:this.workerId,processed:this.processed,deferred:this.deferred,failed:this.failed,executedActions:this.executedActions};}

  private schedule():void{if(!this.active)return;this.timer=setTimeout(()=>void this.tick(),this.pollMs);}
  private async tick():Promise<void>{
    if(!this.active)return;
    try{
      await this.events.seed(100,24);
      const event=await this.events.claim(this.workerId,60);
      if(!event)return this.schedule();
      try{await this.process(event);this.processed+=1;}
      catch(error){this.failed+=1;const delay=Math.min(900,2**Math.min(event.attempts,8)*5);await this.events.retry(event.guildId,event.eventId,this.workerId,error instanceof Error?error.message.slice(0,120):'AUTOMATION_RUNTIME_ERROR',delay);}
    }catch{/* database/network recovery is retried on the next poll */}
    this.schedule();
  }

  private async process(event:AutomationSourceEvent):Promise<void>{
    const maintenance=await this.maintenance.current(event.guildId);
    if(maintenance&&!operationAllowed(maintenancePolicyFromAutomation({...maintenance.automationPolicy,reason:maintenance.reason}),'MEMBER_AUTOMATION')){
      const retryAt=maintenance.endsAt&&maintenance.endsAt.getTime()>Date.now()?maintenance.endsAt:new Date(Date.now()+5*60_000);
      this.deferred+=1;await this.events.defer(event.guildId,event.eventId,this.workerId,retryAt,'MAINTENANCE_AUTOMATION_PAUSED');return;
    }
    const rules=(await this.rules.listForEvent(event.guildId,event.eventType)).filter((rule)=>matchAutomationRule(rule,event.eventType,event.payload));
    if(!rules.length){await this.events.complete(event.guildId,event.eventId,this.workerId);return;}
    const actionCount=rules.reduce((sum,rule)=>sum+rule.actions.length,0);if(actionCount<1||actionCount>100)throw new Error('AUTOMATION_ACTION_VOLUME_EXCEEDED');
    const admission=await new AdmissionControlRepository(this.database).evaluate({guildId:event.guildId,operation:'BULK',actorId:'automation-worker',correlationId:event.correlationId,detail:`automation:${event.eventType}:${event.eventId}`});
    if(admission.decision==='DEFER'){const retryAt=new Date(Date.now()+(admission.retryAfterSeconds??120)*1000);for(const rule of rules){const execution=await this.executions.begin({guildId:event.guildId,ruleId:rule.ruleId,sourceEventId:event.eventId,correlationId:event.correlationId,ruleVersion:rule.version??1,actionCount:rule.actions.length,budgetDecision:'DEFER'});if(!execution.alreadySucceeded)await this.executions.finish(execution.executionId,'DEFERRED',{retryAt:retryAt.toISOString(),pressure:admission.pressure},'ADMISSION_DEFERRED');}this.deferred+=1;await this.events.defer(event.guildId,event.eventId,this.workerId,retryAt,'ADMISSION_DEFERRED');return;}
    const budget=await this.budgets.consume({guildId:event.guildId,budgetKey:'bulk.automation',units:actionCount,actorId:'automation-worker',correlationId:event.correlationId,detail:`event:${event.eventType}:${event.eventId}`});
    if(budget.decision==='DEFER'){
      for(const rule of rules){const execution=await this.executions.begin({guildId:event.guildId,ruleId:rule.ruleId,sourceEventId:event.eventId,correlationId:event.correlationId,ruleVersion:rule.version??1,actionCount:rule.actions.length,budgetDecision:budget.decision});if(!execution.alreadySucceeded)await this.executions.finish(execution.executionId,'DEFERRED',{retryAt:budget.retryAt,budgetKey:budget.budgetKey},'RESOURCE_BUDGET_DEFERRED');}
      this.deferred+=1;await this.events.defer(event.guildId,event.eventId,this.workerId,new Date(budget.retryAt!),'RESOURCE_BUDGET_DEFERRED');return;
    }
    for(const rule of rules){
      const execution=await this.executions.begin({guildId:event.guildId,ruleId:rule.ruleId,sourceEventId:event.eventId,correlationId:event.correlationId,ruleVersion:rule.version??1,actionCount:rule.actions.length,budgetDecision:budget.decision});
      if(execution.alreadySucceeded)continue;
      try{
        const actionResults=[] as Array<Record<string,unknown>>;
        for(const [index,action] of rule.actions.entries()){actionResults.push(await this.executeAction(event,rule.ruleId,index,action));this.executedActions+=1;}
        await this.executions.finish(execution.executionId,'SUCCEEDED',{actions:actionResults,budgetDecision:budget.decision});
        await this.audits.record({auditId:randomUUID(),guildId:event.guildId,actorId:'automation-worker',action:'AUTOMATION_RULE_EXECUTE',resourceType:'AUTOMATION_RULE',resourceId:rule.ruleId,afterState:{sourceEventId:event.eventId,eventType:event.eventType,actionCount:rule.actions.length,budgetDecision:budget.decision},result:'SUCCEEDED',correlationId:event.correlationId});
      }catch(error){await this.executions.finish(execution.executionId,'FAILED',{sourceEventId:event.eventId},error instanceof Error?error.message.slice(0,120):'AUTOMATION_ACTION_ERROR');throw error;}
    }
    await this.events.complete(event.guildId,event.eventId,this.workerId);
  }

  private async executeAction(event:AutomationSourceEvent,ruleId:string,index:number,action:AutomationAction):Promise<Record<string,unknown>>{
    if(action.type==='AUDIT_NOTE'){
      await this.audits.record({auditId:randomUUID(),guildId:event.guildId,actorId:'automation-worker',action:'AUTOMATION_NOTE',resourceType:'AUTOMATION_RULE',resourceId:ruleId,afterState:{note:action.config.note,sourceEventId:event.eventId},result:'SUCCEEDED',correlationId:event.correlationId});
      return{type:action.type,status:'RECORDED'};
    }
    const delaySeconds=action.type==='SCHEDULE_NOTIFICATION'?Number(action.config.delaySeconds):0;const runAt=new Date(Date.now()+delaySeconds*1000);const sourceKey=`automation:${ruleId}:${event.eventId}:${index}`;
    const taskId=await this.scheduler.schedule({guildId:event.guildId,taskType:'NOTIFICATION_FANOUT',runAt,timezone:'UTC',dedupKey:sourceKey,payload:{topic:action.config.topic,title:action.config.title,body:action.config.body,sourceKey}});
    return{type:action.type,status:'SCHEDULED',taskId,runAt:runAt.toISOString()};
  }
}
