import type { InProcessEventBus, EventEnvelope } from '@autoserver/core';
import { EventOutboxRepository, type Database } from '@autoserver/database';
import { randomUUID } from 'node:crypto';

export class DurableOutboxWorker {
  private readonly repository: EventOutboxRepository;
  private readonly workerId = `outbox:${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private active = false;

  constructor(database: Database, private readonly bus: InProcessEventBus, private readonly pollMs = 750) {
    this.repository = new EventOutboxRepository(database);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    void this.tick();
  }

  healthSnapshot(){ return { active:this.active, workerId:this.workerId }; }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private async tick(): Promise<void> {
    if (!this.active) return;
    try {
      const event = await this.repository.claim(this.workerId, 30);
      if (!event) return this.schedule();
      const envelope: EventEnvelope = {
        eventId: event.eventId,
        schemaVersion: 1,
        type: event.eventType,
        guildId: event.guildId,
        correlationId: event.correlationId,
        source: event.source,
        aggregateKey: event.aggregateKey,
        sequence: event.sequence,
        occurredAt: new Date().toISOString(),
        payload: event.payload,
      };
      try {
        await this.bus.publish(envelope);
        await this.repository.published(event.eventId, this.workerId);
      } catch (error) {
        const delay = Math.min(60, 2 ** Math.min(event.attempts, 5));
        await this.repository.retry(event.eventId, this.workerId, error instanceof Error ? error.name : 'OUTBOX_PUBLISH_ERROR', delay);
      }
    } catch {
      // Database/network recovery is naturally retried by the next poll.
    }
    this.schedule();
  }

  private schedule(): void {
    if (!this.active) return;
    this.timer = setTimeout(() => void this.tick(), this.pollMs);
  }
}
