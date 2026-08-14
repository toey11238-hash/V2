import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@autoserver/core';
import { EventInboxRepository, type Database } from '@autoserver/database';

export interface InboundEventInput<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId?: string;
  guildId?: string;
  eventType: string;
  correlationId: string;
  dedupKey?: string;
  source?: string;
  aggregateKey?: string;
  sequence?: number;
  payload: T;
}

/**
 * Durable entry point for adapters/webhook validators. Validation/authentication happens
 * before this class. Accepted records survive process restarts and are consumed by the
 * inbox worker; this class never treats in-memory state as the source of truth.
 */
export class DurableEventIngress {
  private readonly inbox: EventInboxRepository;
  constructor(database: Database) { this.inbox = new EventInboxRepository(database); }

  async receive<T extends Record<string, unknown>>(input: InboundEventInput<T>): Promise<{accepted:boolean;eventId:string}> {
    const eventId=input.eventId??randomUUID();
    const accepted=await this.inbox.receive({
      eventId,
      guildId:input.guildId,
      eventType:input.eventType,
      schemaVersion:1,
      payload:input.payload,
      correlationId:input.correlationId,
      source:input.source,
      aggregateKey:input.aggregateKey,
      sequence:input.sequence,
      attempts:0,
      dedupKey:input.dedupKey,
    });
    return {accepted,eventId};
  }

  static envelope<T extends Record<string, unknown>>(event:InboundEventInput<T>&{eventId:string}):EventEnvelope<T>{
    return {eventId:event.eventId,schemaVersion:1,type:event.eventType,guildId:event.guildId,correlationId:event.correlationId,dedupKey:event.dedupKey,source:event.source,aggregateKey:event.aggregateKey,sequence:event.sequence,occurredAt:new Date().toISOString(),payload:event.payload};
  }
}
