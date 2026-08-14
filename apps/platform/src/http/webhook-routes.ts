import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuditRepository, type Database } from '@autoserver/database';
import { newCorrelationId } from '@autoserver/core';
import {
  IntegrationControlRepository,
  IntegrationRegistry,
  WebhookDeliveryRepository,
  normalizeWebhookHeaderName,
  resolveIntegrationSecretRef,
  validateIntegrationSecretRef,
  validateWebhookDeliveryId,
  validateWebhookTimestamp,
  webhookDigest,
} from '@autoserver/integrations';
import { DurableEventIngress } from '../runtime/event-ingress.js';

export interface WebhookRouteAuthorization { actorId:string; }
export type AuthorizeWebhookConfiguration=(request:FastifyRequest,reply:FastifyReply,guildId:string)=>Promise<WebhookRouteAuthorization|null>;

function header(request:FastifyRequest,name:string):string|undefined{
  const value=request.headers[normalizeWebhookHeaderName(name)];
  return Array.isArray(value)?value[0]:value;
}

export function registerWebhookRoutes(app:FastifyInstance,input:{database:Database;registry:IntegrationRegistry;authorize:AuthorizeWebhookConfiguration;maxBodyBytes?:number}):void{
  const rawBodies=new WeakMap<FastifyRequest,Uint8Array>();
  const maxBodyBytes=Math.max(1024,Math.min(2_097_152,input.maxBodyBytes??1_048_576));
  const captureRaw=async(request:FastifyRequest,reply:FastifyReply,payload:NodeJS.ReadableStream)=>{
    const chunks:Buffer[]=[]; let total=0;
    for await(const chunk of payload){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=part.length;if(total>maxBodyBytes){reply.code(413);const error=Object.assign(new Error('WEBHOOK_BODY_TOO_LARGE'),{statusCode:413});throw error;}chunks.push(part);}
    const raw=Buffer.concat(chunks);rawBodies.set(request,raw);return Readable.from(raw);
  };

  app.post('/api/guilds/:guildId/integrations/:integrationKey/webhook-config',async(request,reply)=>{
    const {guildId,integrationKey}=request.params as {guildId:string;integrationKey:string};
    if(!input.database.configured)return reply.status(503).send({error:'DATABASE_REQUIRED'});
    const authorization=await input.authorize(request,reply,guildId);if(!authorization)return;
    const adapter=input.registry.get(integrationKey);if(!adapter||!adapter.capabilities.webhooks||!adapter.webhook)return reply.status(409).send({error:'WEBHOOK_ADAPTER_NOT_REGISTERED'});
    const body=(request.body??{}) as {secretRef?:string};if(typeof body.secretRef!=='string')return reply.status(400).send({error:'WEBHOOK_SECRET_REF_REQUIRED'});
    let secretRef:string;try{secretRef=validateIntegrationSecretRef(integrationKey,body.secretRef);}catch(error){return reply.status(400).send({error:'WEBHOOK_SECRET_REF_INVALID',message:error instanceof Error?error.message:'Secret reference invalid'});}
    const repository=new WebhookDeliveryRepository(input.database);const correlationId=newCorrelationId();
    try{await new IntegrationControlRepository(input.database).ensureConfigured({guildId,integrationKey,capabilities:adapter.capabilities,actorId:authorization.actorId});await repository.configureSecretRef({guildId,integrationKey,secretRef,actorId:authorization.actorId});await new AuditRepository(input.database).record({auditId:crypto.randomUUID(),guildId,actorId:authorization.actorId,action:'INTEGRATION_WEBHOOK_CONFIG',resourceType:'INTEGRATION',resourceId:integrationKey,afterState:{configured:true,secretRef:'env:[redacted]'},result:'SUCCEEDED',correlationId});return {guildId,integrationKey,configured:true,secretRef:'env:[redacted]',correlationId};}
    catch(error){return reply.status(409).send({error:'WEBHOOK_CONFIG_REJECTED',message:error instanceof Error?error.message:'Webhook configuration rejected'});}
  });

  app.post('/api/webhooks/:guildId/:integrationKey',{preParsing:captureRaw},async(request,reply)=>{
    const {guildId,integrationKey}=request.params as {guildId:string;integrationKey:string};
    if(!input.database.configured)return reply.status(503).send({error:'DATABASE_REQUIRED'});
    const adapter=input.registry.get(integrationKey);const binding=adapter?.webhook;
    if(!adapter||!adapter.capabilities.webhooks||!binding)return reply.status(404).send({error:'WEBHOOK_ADAPTER_UNAVAILABLE'});
    const deliveries=new WebhookDeliveryRepository(input.database);const control=new IntegrationControlRepository(input.database);
    const config=await deliveries.inboundConfig(guildId,integrationKey);if(!config?.enabled||!config.secretRef)return reply.status(404).send({error:'WEBHOOK_INTEGRATION_UNAVAILABLE'});
    const raw=rawBodies.get(request);if(!raw)return reply.status(400).send({error:'WEBHOOK_RAW_BODY_UNAVAILABLE'});
    const signature=header(request,binding.signatureHeader);if(!signature)return reply.status(401).send({error:'WEBHOOK_SIGNATURE_REQUIRED'});
    const deliveryHeader=header(request,binding.deliveryIdHeader);if(!deliveryHeader)return reply.status(400).send({error:'WEBHOOK_DELIVERY_ID_REQUIRED'});
    let externalDeliveryId:string;try{externalDeliveryId=validateWebhookDeliveryId(deliveryHeader);}catch{return reply.status(400).send({error:'WEBHOOK_DELIVERY_ID_INVALID'});}
    const timestamp=binding.timestampHeader?header(request,binding.timestampHeader):undefined;
    if(binding.timestampHeader&&!timestamp)return reply.status(400).send({error:'WEBHOOK_TIMESTAMP_REQUIRED'});
    try{validateWebhookTimestamp(timestamp,binding.maxAgeSeconds??300);}catch(error){await control.recordWebhookEvent({guildId,integrationKey,action:'WEBHOOK_REJECTED',detail:error instanceof Error?error.message:'Webhook timestamp rejected',deliveryId:externalDeliveryId}).catch(()=>undefined);return reply.status(401).send({error:'WEBHOOK_TIMESTAMP_REJECTED'});}
    let secret:string;try{secret=resolveIntegrationSecretRef(config.secretRef);}catch{return reply.status(503).send({error:'WEBHOOK_SECRET_UNAVAILABLE'});}
    const headers=Object.fromEntries(Object.entries(request.headers).map(([key,value])=>[key,Array.isArray(value)?value[0]:value]));
    let verified=false;try{verified=await binding.verify({rawBody:raw,signature,secret,timestamp,headers});}catch{verified=false;}
    if(!verified){await control.recordWebhookEvent({guildId,integrationKey,action:'WEBHOOK_REJECTED',detail:'Webhook signature verification failed',deliveryId:externalDeliveryId}).catch(()=>undefined);return reply.status(401).send({error:'WEBHOOK_SIGNATURE_INVALID'});}
    const correlationId=newCorrelationId();const reserved=await deliveries.reserve({guildId,integrationKey,externalDeliveryId,correlationId,bodyHash:webhookDigest(raw),signatureHash:webhookDigest(signature)});
    if(!reserved.accepted)return reply.status(202).send({accepted:false,duplicate:true,correlationId});
    try{
      const events=await binding.transform({rawBody:raw,headers});if(events.length>100)throw new Error('WEBHOOK_EVENT_BATCH_TOO_LARGE');
      const ingress=new DurableEventIngress(input.database);let accepted=0;
      for(let index=0;index<events.length;index++){
        const event=events[index]!;if(!/^[A-Za-z0-9_.:-]{1,120}$/.test(event.eventType))throw new Error('WEBHOOK_EVENT_TYPE_INVALID');
        const receipt=await ingress.receive({guildId,eventType:event.eventType,correlationId,dedupKey:event.dedupKey??`webhook:${integrationKey}:${externalDeliveryId}:${index}`,source:`webhook:${integrationKey}`,aggregateKey:event.aggregateKey,sequence:event.sequence,payload:event.payload});if(receipt.accepted)accepted++;
      }
      await deliveries.processed(reserved.deliveryId,accepted);await control.recordWebhookEvent({guildId,integrationKey,action:'WEBHOOK_ACCEPTED',detail:`Accepted ${accepted} durable event(s)`,deliveryId:externalDeliveryId});
      await new AuditRepository(input.database).record({auditId:crypto.randomUUID(),guildId,action:'WEBHOOK_INGEST',resourceType:'INTEGRATION',resourceId:integrationKey,afterState:{deliveryHash:webhookDigest(externalDeliveryId).slice(0,16),eventCount:accepted},result:'SUCCEEDED',correlationId});
      return reply.status(202).send({accepted:true,duplicate:false,eventCount:accepted,correlationId});
    }catch(error){const code=error instanceof Error?error.message.slice(0,120):'WEBHOOK_PROCESSING_FAILED';await deliveries.failed(reserved.deliveryId,code);await control.recordWebhookEvent({guildId,integrationKey,action:'WEBHOOK_REJECTED',detail:code,deliveryId:externalDeliveryId}).catch(()=>undefined);return reply.status(422).send({error:'WEBHOOK_PROCESSING_REJECTED',correlationId});}
  });
}
