import { createHash, randomUUID } from 'node:crypto';

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type GuildId = Brand<string, 'GuildId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

export const newCorrelationId = (): CorrelationId => randomUUID() as CorrelationId;
export const nowIso = (): string => new Date().toISOString();
export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface EventEnvelope<T = unknown> {
  eventId: string;
  schemaVersion: 1;
  type: string;
  guildId?: string;
  actorId?: string;
  correlationId: string;
  dedupKey?: string;
  source?: string;
  aggregateKey?: string;
  sequence?: number;
  occurredAt: string;
  payload: T;
}

export const makeEvent = <T>(input: Omit<EventEnvelope<T>, 'eventId' | 'schemaVersion' | 'occurredAt'>): EventEnvelope<T> => ({
  ...input,
  eventId: randomUUID(),
  schemaVersion: 1,
  occurredAt: nowIso(),
});

export type EventListener = (event: EventEnvelope) => void | Promise<void>;

export interface EventBus {
  subscribe(listener: EventListener): () => void;
  publish(event: EventEnvelope): Promise<void>;
}

export class InProcessEventBus implements EventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: EventEnvelope): Promise<void> {
    await Promise.allSettled([...this.listeners].map((listener) => listener(event)));
  }
}


export interface EventSequenceHead { sequence: number; eventId: string; }
export interface EventSequenceDecision { accepted: boolean; duplicate: boolean; stale: boolean; previousSequence?: number; }
export function decideEventSequence(previous: EventSequenceHead | null, current: EventSequenceHead): EventSequenceDecision {
  if (!Number.isSafeInteger(current.sequence) || current.sequence < 0) throw new Error('EVENT_SEQUENCE_INVALID');
  if (!previous) return { accepted:true, duplicate:false, stale:false };
  if (previous.eventId === current.eventId) return { accepted:false, duplicate:true, stale:false, previousSequence:previous.sequence };
  if (current.sequence <= previous.sequence) return { accepted:false, duplicate:false, stale:true, previousSequence:previous.sequence };
  return { accepted:true, duplicate:false, stale:false, previousSequence:previous.sequence };
}

export type ProgressMode = 'units' | 'phase';

export interface ProgressSnapshot {
  mode: ProgressMode;
  phase: string;
  completedUnits?: number;
  totalUnits?: number;
  percent?: number;
}

export class ProgressTracker {
  private completed = 0;
  private phaseName: string;

  constructor(private readonly totalUnits: number | null, initialPhase = 'queued') {
    if (totalUnits !== null && (!Number.isInteger(totalUnits) || totalUnits < 0)) {
      throw new Error('totalUnits must be null or a non-negative integer');
    }
    this.phaseName = initialPhase;
  }

  phase(name: string): ProgressSnapshot {
    this.phaseName = name;
    return this.snapshot();
  }

  advance(units = 1): ProgressSnapshot {
    if (this.totalUnits === null) return this.snapshot();
    this.completed = Math.min(this.totalUnits, this.completed + Math.max(0, units));
    return this.snapshot();
  }

  snapshot(): ProgressSnapshot {
    if (this.totalUnits === null) return { mode: 'phase', phase: this.phaseName };
    const percent = this.totalUnits === 0 ? 100 : Math.round((this.completed / this.totalUnits) * 100);
    return {
      mode: 'units',
      phase: this.phaseName,
      completedUnits: this.completed,
      totalUnits: this.totalUnits,
      percent,
    };
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
