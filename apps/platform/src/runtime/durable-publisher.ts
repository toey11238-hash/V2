import type { EventEnvelope, EventBus, EventListener, InProcessEventBus } from '@autoserver/core';
import { EventOutboxRepository, type Database } from '@autoserver/database';

export class DurableEventPublisher implements EventBus {
  private readonly outbox: EventOutboxRepository;
  constructor(database: Database, private readonly bus: InProcessEventBus) {
    this.outbox = new EventOutboxRepository(database);
  }

  subscribe(listener: EventListener): () => void {
    return this.bus.subscribe(listener);
  }

  async publish(event: EventEnvelope): Promise<void> {
    await this.outbox.enqueue({
      eventId: event.eventId,
      guildId: event.guildId,
      eventType: event.type,
      schemaVersion: event.schemaVersion,
      payload: event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : { value: event.payload },
      correlationId: event.correlationId,
      source: event.source,
      aggregateKey: event.aggregateKey,
      sequence: event.sequence,
    });
    await this.bus.publish(event);
    await this.outbox.markPublishedDirect(event.eventId);
  }
}
