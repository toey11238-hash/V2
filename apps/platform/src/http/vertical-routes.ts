import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuditRepository, GuildConfigRepository, type Database } from '@autoserver/database';
import { newCorrelationId } from '@autoserver/core';
import { VerticalOpsService } from '@autoserver/vertical-ops';

export interface VerticalRouteAuthorization { actorId:string; }
export type AuthorizeVerticalMutation=(request:FastifyRequest,reply:FastifyReply,guildId:string)=>Promise<VerticalRouteAuthorization|null>;

export function registerVerticalRoutes(app:FastifyInstance,input:{database:Database;authorize:AuthorizeVerticalMutation}):void {
  const audit=async(args:{guildId:string;actorId:string;action:string;resourceType:string;resourceId:string;beforeState?:Record<string,unknown>;afterState?:Record<string,unknown>;correlationId:string})=>{
    await new AuditRepository(input.database).record({auditId:crypto.randomUUID(),...args,result:'SUCCEEDED'});
  };
  const auth=async(request:FastifyRequest,reply:FastifyReply,guildId:string)=>{
    if(!input.database.configured){await reply.status(503).send({error:'DATABASE_REQUIRED'});return null;}
    return input.authorize(request,reply,guildId);
  };

  app.post('/api/guilds/:guildId/vertical/creator/:contentId/review', async (request, reply) => {
    const {guildId,contentId}=request.params as {guildId:string;contentId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return;
    const body=(request.body??{}) as {decision?:string;reason?:string}; if(!['APPROVED','REJECTED'].includes(String(body.decision)))return reply.status(400).send({error:'CREATOR_DECISION_INVALID'});
    const correlationId=newCorrelationId();
    try{const result=await new VerticalOpsService(input.database).reviewCreator({guildId,contentId,actorId:authorization.actorId,decision:body.decision as 'APPROVED'|'REJECTED',reason:body.reason?.trim().slice(0,500)});await audit({guildId,actorId:authorization.actorId,action:'CREATOR_REVIEW',resourceType:'CREATOR_CONTENT',resourceId:contentId,beforeState:{status:result.beforeStatus},afterState:{status:result.status},correlationId});return {guildId,contentId,...result,correlationId};}
    catch(error){return reply.status(409).send({error:'CREATOR_REVIEW_REJECTED',message:error instanceof Error?error.message:'Creator review rejected'});}
  });

  app.post('/api/guilds/:guildId/vertical/creator/:contentId/schedule', async (request, reply) => {
    const {guildId,contentId}=request.params as {guildId:string;contentId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return;
    const body=(request.body??{}) as {runAt?:string|number;channelKey?:string;timezone?:string}; if(body.runAt==null||typeof body.channelKey!=='string')return reply.status(400).send({error:'CREATOR_SCHEDULE_INPUT_REQUIRED'});
    const config=await new GuildConfigRepository(input.database).get(guildId); const timezone=body.timezone?.trim()||config?.timezone||'UTC'; const correlationId=newCorrelationId();
    try{const result=await new VerticalOpsService(input.database).scheduleCreator({guildId,contentId,runAt:body.runAt,channelKey:body.channelKey,timezone});await audit({guildId,actorId:authorization.actorId,action:'CREATOR_SCHEDULE',resourceType:'CREATOR_CONTENT',resourceId:contentId,afterState:{runAt:result.runAt.toISOString(),channelKey:result.channelKey,taskId:result.taskId},correlationId});return {guildId,contentId,runAt:result.runAt.toISOString(),channelKey:result.channelKey,taskId:result.taskId,correlationId};}
    catch(error){return reply.status(409).send({error:'CREATOR_SCHEDULE_REJECTED',message:error instanceof Error?error.message:'Creator schedule rejected'});}
  });

  app.post('/api/guilds/:guildId/vertical/creator/:contentId/cancel-schedule', async (request, reply) => {
    const {guildId,contentId}=request.params as {guildId:string;contentId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return; const correlationId=newCorrelationId();
    try{const result=await new VerticalOpsService(input.database).cancelCreatorSchedule({guildId,contentId});await audit({guildId,actorId:authorization.actorId,action:'CREATOR_SCHEDULE_CANCEL',resourceType:'CREATOR_CONTENT',resourceId:contentId,afterState:result,correlationId});return {guildId,contentId,...result,correlationId};}
    catch(error){return reply.status(409).send({error:'CREATOR_SCHEDULE_CANCEL_REJECTED',message:error instanceof Error?error.message:'Creator schedule cancellation rejected'});}
  });

  app.post('/api/guilds/:guildId/vertical/mentor/:requestId/schedule', async (request, reply) => {
    const {guildId,requestId}=request.params as {guildId:string;requestId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return;
    const body=(request.body??{}) as {runAt?:string|number;timezone?:string}; if(body.runAt==null)return reply.status(400).send({error:'MENTOR_SCHEDULE_INPUT_REQUIRED'});
    const config=await new GuildConfigRepository(input.database).get(guildId); const timezone=body.timezone?.trim()||config?.timezone||'UTC'; const correlationId=newCorrelationId();
    try{const result=await new VerticalOpsService(input.database).scheduleMentor({guildId,requestId,runAt:body.runAt,timezone});await audit({guildId,actorId:authorization.actorId,action:'MENTOR_SCHEDULE',resourceType:'MENTOR_REQUEST',resourceId:requestId,afterState:{runAt:result.runAt.toISOString(),timezone,reminderTasks:result.reminderTaskIds.length},correlationId});return {guildId,requestId,runAt:result.runAt.toISOString(),timezone,reminderTaskIds:result.reminderTaskIds,correlationId};}
    catch(error){return reply.status(409).send({error:'MENTOR_SCHEDULE_REJECTED',message:error instanceof Error?error.message:'Mentor schedule rejected'});}
  });

  app.post('/api/guilds/:guildId/vertical/mentor/:requestId/complete', async (request, reply) => {
    const {guildId,requestId}=request.params as {guildId:string;requestId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return; const correlationId=newCorrelationId();
    try{await new VerticalOpsService(input.database).completeMentor({guildId,requestId,actorId:authorization.actorId,manager:true});await audit({guildId,actorId:authorization.actorId,action:'MENTOR_COMPLETE',resourceType:'MENTOR_REQUEST',resourceId:requestId,afterState:{status:'COMPLETED'},correlationId});return {guildId,requestId,status:'COMPLETED',correlationId};}
    catch(error){return reply.status(409).send({error:'MENTOR_COMPLETE_REJECTED',message:error instanceof Error?error.message:'Mentor completion rejected'});}
  });

  app.post('/api/guilds/:guildId/vertical/business/:supportRefId/claim', async (request, reply) => {
    const {guildId,supportRefId}=request.params as {guildId:string;supportRefId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return; const correlationId=newCorrelationId();
    try{await new VerticalOpsService(input.database).claimBusinessSupport({guildId,supportRefId,actorId:authorization.actorId});await audit({guildId,actorId:authorization.actorId,action:'BUSINESS_SUPPORT_CLAIM',resourceType:'BUSINESS_SUPPORT',resourceId:supportRefId,afterState:{status:'CLAIMED',assignedStaffId:authorization.actorId},correlationId});return {guildId,supportRefId,status:'CLAIMED',correlationId};}
    catch(error){return reply.status(409).send({error:'BUSINESS_SUPPORT_CLAIM_REJECTED',message:error instanceof Error?error.message:'Business support claim rejected'});}
  });

  app.post('/api/guilds/:guildId/vertical/business/:supportRefId/resolve', async (request, reply) => {
    const {guildId,supportRefId}=request.params as {guildId:string;supportRefId:string}; const authorization=await auth(request,reply,guildId); if(!authorization)return;
    const body=(request.body??{}) as {next?:string}; if(!['RESOLVED','CLOSED'].includes(String(body.next)))return reply.status(400).send({error:'BUSINESS_SUPPORT_TARGET_INVALID'}); const correlationId=newCorrelationId();
    try{await new VerticalOpsService(input.database).resolveBusinessSupport({guildId,supportRefId,actorId:authorization.actorId,next:body.next as 'RESOLVED'|'CLOSED'});await audit({guildId,actorId:authorization.actorId,action:'BUSINESS_SUPPORT_RESOLVE',resourceType:'BUSINESS_SUPPORT',resourceId:supportRefId,afterState:{status:body.next},correlationId});return {guildId,supportRefId,status:body.next,correlationId};}
    catch(error){return reply.status(409).send({error:'BUSINESS_SUPPORT_RESOLVE_REJECTED',message:error instanceof Error?error.message:'Business support resolve rejected'});}
  });
}
