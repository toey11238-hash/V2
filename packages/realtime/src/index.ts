import type { EventEnvelope, EventBus } from '@autoserver/core';

interface SocketLike {
  readyState: number;
  bufferedAmount?: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;
type EventPredicate = (event: EventEnvelope) => boolean;

export interface RealtimeHubStats {
  clients:number;
  recentEvents:number;
  backpressureDisconnects:number;
  sendFailures:number;
  deduplicatedEvents:number;
}

export class RealtimeHub {
  private clients = new Map<SocketLike, EventPredicate>();
  private recent: EventEnvelope[] = [];
  private seenEventIds = new Set<string>();
  private unsubscribe?: () => void;
  private backpressureDisconnects=0;
  private sendFailures=0;
  private deduplicatedEvents=0;

  constructor(private readonly maxRecent = 200, private readonly maxBufferedBytes = 1_048_576) {
    if(!Number.isInteger(maxRecent)||maxRecent<1||maxRecent>10_000)throw new Error('REALTIME_MAX_RECENT_INVALID');
    if(!Number.isFinite(maxBufferedBytes)||maxBufferedBytes<16_384||maxBufferedBytes>64*1024*1024)throw new Error('REALTIME_BACKPRESSURE_LIMIT_INVALID');
  }

  attach(bus: EventBus): void {
    this.unsubscribe?.();
    this.unsubscribe = bus.subscribe(async (event) => this.publish(event));
  }

  addClient(socket: SocketLike, predicate: EventPredicate = (event) => !event.guildId): () => void {
    this.clients.set(socket, predicate);
    return () => this.clients.delete(socket);
  }

  setClientPredicate(socket: SocketLike, predicate: EventPredicate): boolean {
    if (!this.clients.has(socket)) return false;
    this.clients.set(socket, predicate);
    return true;
  }

  publish(event: EventEnvelope): void {
    if (this.seenEventIds.has(event.eventId)) { this.deduplicatedEvents+=1; return; }
    this.seenEventIds.add(event.eventId);
    this.recent.unshift(event);
    if (this.recent.length > this.maxRecent) {
      const removed = this.recent.splice(this.maxRecent);
      for (const stale of removed) this.seenEventIds.delete(stale.eventId);
    }
    const payload = JSON.stringify({ type: 'event', event });
    for (const [client, predicate] of [...this.clients]) {
      if (client.readyState !== OPEN) { this.clients.delete(client); continue; }
      if (!predicate(event)) continue;
      if((client.bufferedAmount??0)>this.maxBufferedBytes){
        this.backpressureDisconnects+=1;this.clients.delete(client);
        try{client.close(1013,'Realtime backpressure; reconnect and recover recent state');}catch{/* already broken */}
        continue;
      }
      try { client.send(payload); }
      catch { this.sendFailures+=1;this.clients.delete(client);try{client.close(1011,'Realtime send failure');}catch{/* already broken */} }
    }
  }

  getRecent(limit = 50, predicate: EventPredicate = () => true): EventEnvelope[] {
    return this.recent.filter(predicate).slice(0, Math.min(Math.max(0,limit), this.maxRecent));
  }

  get clientCount(): number { return this.clients.size; }
  stats():RealtimeHubStats{return {clients:this.clients.size,recentEvents:this.recent.length,backpressureDisconnects:this.backpressureDisconnects,sendFailures:this.sendFailures,deduplicatedEvents:this.deduplicatedEvents};}

  close(): void {
    this.unsubscribe?.();
    for (const client of this.clients.keys()) client.close(1001, 'Platform shutting down');
    this.clients.clear();
    this.seenEventIds.clear();
  }
}
