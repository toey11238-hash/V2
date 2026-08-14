import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import { sleep } from '@autoserver/core';


export class JobCancelledError extends Error {
  constructor(message = 'Job cancelled') { super(message); this.name = 'JobCancelledError'; }
}

export class JobExecutionError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'JobExecutionError';
  }
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'RETRYING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'DEAD_LETTER';


export interface JobRecord<T = Record<string, unknown>> {
  jobId: string;
  guildId?: string;
  actorId?: string;
  type: string;
  status: JobStatus;
  payload: T;
  priority: number;
  correlationId: string;
  currentStep?: string;
  completedUnits: number;
  totalUnits?: number;
  retryCount: number;
  maxRetries: number;
}

export class JobRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    guildId?: string;
    actorId?: string;
    type: string;
    payload: Record<string, unknown>;
    priority?: number;
    correlationId: string;
    idempotencyKey?: string;
    totalUnits?: number;
    maxRetries?: number;
  }): Promise<string> {
    const jobId = randomUUID();
    const { rows } = await this.db.requirePool().query<{ job_id: string }>(
      `insert into jobs(job_id,guild_id,actor_id,type,priority,status,payload,correlation_id,idempotency_key,total_units,max_retries)
       values($1,$2,$3,$4,$5,'QUEUED',$6,$7,$8,$9,$10)
       on conflict (guild_id,type,idempotency_key)
       do update set updated_at=now()
       returning job_id`,
      [jobId, input.guildId ?? null, input.actorId ?? null, input.type, input.priority ?? 50, input.payload, input.correlationId, input.idempotencyKey ?? null, input.totalUnits ?? null, input.maxRetries ?? 5],
    );
    return rows[0]!.job_id;
  }

  async claimNext(workerId: string, leaseSeconds: number): Promise<JobRecord | null> {
    const client = await this.db.requirePool().connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<any>(
        `with candidate as (
           select j.*,
             case when j.guild_id is null then 0 else (select count(*)::int from jobs running where running.guild_id=j.guild_id and running.status='RUNNING') end as fairness_in_flight,
             case when j.guild_id is null then 0 else (select count(*)::int from jobs recent where recent.guild_id=j.guild_id and recent.started_at>=now()-interval '5 minutes') end as fairness_recent_starts
           from jobs j
           where j.status in ('QUEUED','RETRYING')
             and j.available_at <= now()
             and (j.lease_expires_at is null or j.lease_expires_at < now())
           order by case when j.priority>=90 then 0 when j.priority>=70 then 1 else 2 end asc, fairness_in_flight asc, fairness_recent_starts asc, j.priority desc, j.created_at asc
           for update of j skip locked
           limit 1
         ) select * from candidate`,
      );
      if (!rows[0]) {
        await client.query('commit');
        return null;
      }
      const row = rows[0];
      await client.query(
        `update jobs set status='RUNNING', lease_owner=$2, lease_expires_at=now()+make_interval(secs => $3), started_at=coalesce(started_at,now()), updated_at=now() where job_id=$1`,
        [row.job_id, workerId, leaseSeconds],
      );
      await client.query('commit');
      return this.map(row, 'RUNNING');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds: number): Promise<void> {
    await this.db.requirePool().query(
      `update jobs set lease_expires_at=now()+make_interval(secs => $3), updated_at=now() where job_id=$1 and lease_owner=$2 and status='RUNNING'`,
      [jobId, workerId, leaseSeconds],
    );
  }

  async progress(jobId: string, step: string, completedUnits: number): Promise<void> {
    await this.db.requirePool().query(`update jobs set current_step=$2, completed_units=$3, updated_at=now() where job_id=$1`, [jobId, step, completedUnits]);
  }

  async succeed(jobId: string, result: unknown): Promise<void> {
    await this.db.requirePool().query(
      `update jobs set status='SUCCEEDED', result=$2, finished_at=now(), lease_owner=null, lease_expires_at=null, updated_at=now() where job_id=$1`,
      [jobId, result],
    );
  }

  async fail(job: JobRecord, errorCode: string, safeMessage: string, retryAfterMs?: number): Promise<void> {
    const retryable = retryAfterMs !== undefined && job.retryCount < job.maxRetries;
    if (retryable) {
      await this.db.requirePool().query(
        `update jobs set status='RETRYING', retry_count=retry_count+1, available_at=now()+($2::text || ' milliseconds')::interval,
         last_error_code=$3,last_error_safe=$4,lease_owner=null,lease_expires_at=null,updated_at=now() where job_id=$1`,
        [job.jobId, retryAfterMs, errorCode, safeMessage],
      );
    } else {
      await this.db.requirePool().query(
        `update jobs set status=case when retry_count >= max_retries then 'DEAD_LETTER' else 'FAILED' end,
         last_error_code=$2,last_error_safe=$3,finished_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now() where job_id=$1`,
        [job.jobId, errorCode, safeMessage],
      );
    }
  }


  async recoverExpiredRunning(): Promise<number> {
    const { rowCount } = await this.db.requirePool().query(
      `update jobs set
       status=case when retry_count+1 > max_retries then 'DEAD_LETTER' else 'RETRYING' end,
       retry_count=retry_count+1,
       available_at=now(),
       lease_owner=null,
       lease_expires_at=null,
       finished_at=case when retry_count+1 > max_retries then now() else finished_at end,
       last_error_code='WORKER_LEASE_EXPIRED',
       last_error_safe='Worker lease expired; job scheduled for recovery',
       updated_at=now()
       where status='RUNNING' and lease_expires_at < now()`,
    );
    return rowCount ?? 0;
  }

  async cancel(jobId: string): Promise<boolean> {
    const { rowCount } = await this.db.requirePool().query(
      `update jobs set status='CANCELLED', finished_at=now(), lease_owner=null, lease_expires_at=null, updated_at=now()
       where job_id=$1 and status in ('QUEUED','RUNNING','RETRYING')`,
      [jobId],
    );
    return (rowCount ?? 0) > 0;
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const { rows } = await this.db.requirePool().query<{ status: JobStatus }>('select status from jobs where job_id=$1', [jobId]);
    return rows[0]?.status === 'CANCELLED';
  }

  async fairnessSnapshot(limit = 50): Promise<Array<{ guildId: string; running: number; queued: number; retrying: number; recentStarts: number }>> {
    const { rows } = await this.db.requirePool().query<any>(
      `select guild_id,
         count(*) filter(where status='RUNNING')::int as running,
         count(*) filter(where status='QUEUED')::int as queued,
         count(*) filter(where status='RETRYING')::int as retrying,
         count(*) filter(where started_at>=now()-interval '5 minutes')::int as recent_starts
       from jobs where guild_id is not null and (status in ('QUEUED','RUNNING','RETRYING') or started_at>=now()-interval '5 minutes')
       group by guild_id
       order by running desc, recent_starts desc, queued desc
       limit $1`,
      [Math.max(1, Math.min(250, Math.trunc(limit)))],
    );
    return rows.map((row:any)=>({guildId:String(row.guild_id),running:Number(row.running??0),queued:Number(row.queued??0),retrying:Number(row.retrying??0),recentStarts:Number(row.recent_starts??0)}));
  }

  async latestForGuild(guildId: string): Promise<JobRecord | null> {
    const { rows } = await this.db.requirePool().query<any>(
      `select * from jobs where guild_id=$1 order by created_at desc limit 1`,
      [guildId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async get(jobId: string): Promise<JobRecord | null> {
    const { rows } = await this.db.requirePool().query<any>('select * from jobs where job_id=$1', [jobId]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  private map(row: any, statusOverride?: JobStatus): JobRecord {
    return {
      jobId: row.job_id,
      guildId: row.guild_id ?? undefined,
      actorId: row.actor_id ?? undefined,
      type: row.type,
      status: statusOverride ?? row.status,
      payload: row.payload,
      priority: row.priority,
      correlationId: row.correlation_id,
      currentStep: row.current_step ?? undefined,
      completedUnits: row.completed_units ?? 0,
      totalUnits: row.total_units ?? undefined,
      retryCount: row.retry_count ?? 0,
      maxRetries: row.max_retries ?? 5,
    };
  }
}

export type JobHandler = (job: JobRecord) => Promise<unknown>;

export class DurableJobWorker {
  private running = false;
  private readonly workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  private handlers = new Map<string, JobHandler>();

  constructor(
    private readonly repo: JobRepository,
    private readonly pollIntervalMs: number,
    private readonly leaseSeconds: number,
  ) {}

  register(type: string, handler: JobHandler): void {
    if (this.handlers.has(type)) throw new Error(`Job handler already registered: ${type}`);
    this.handlers.set(type, handler);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      await this.repo.recoverExpiredRunning().catch(() => 0);
      const job = await this.repo.claimNext(this.workerId, this.leaseSeconds).catch(() => null);
      if (!job) {
        await sleep(this.pollIntervalMs);
        continue;
      }
      const handler = this.handlers.get(job.type);
      if (!handler) {
        await this.repo.fail(job, 'NO_HANDLER', `No worker handler is registered for ${job.type}`);
        continue;
      }
      const heartbeatEveryMs = Math.max(1_000, Math.floor(this.leaseSeconds * 1_000 / 3));
      const heartbeat = setInterval(() => void this.repo.heartbeat(job.jobId, this.workerId, this.leaseSeconds).catch(() => undefined), heartbeatEveryMs);
      try {
        if (await this.repo.isCancelled(job.jobId)) throw new JobCancelledError();
        const result = await handler(job);
        if (!(await this.repo.isCancelled(job.jobId))) await this.repo.succeed(job.jobId, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown worker error';
        if (error instanceof JobCancelledError || await this.repo.isCancelled(job.jobId)) {
          // Cancellation is terminal and intentionally does not transition to FAILED.
        } else if (error instanceof JobExecutionError) {
          await this.repo.fail(job, error.code, message, error.retryable ? (error.retryAfterMs ?? 1_500 * Math.pow(2, Math.min(job.retryCount, 5))) : undefined);
        } else {
          console.error('[job-handler-error]', { jobId: job.jobId, type: job.type, correlationId: job.correlationId, name: error instanceof Error ? error.name : 'UnknownError', message });
          await this.repo.fail(job, 'JOB_HANDLER_ERROR', 'Unexpected job handler failure. Use the correlation ID to inspect operator logs.', 1_500 * Math.pow(2, Math.min(job.retryCount, 5)));
        }
      } finally {
        clearInterval(heartbeat);
      }
    }
  }

  healthSnapshot(){ return { running:this.running, workerId:this.workerId }; }

  stop(): void {
    this.running = false;
  }
}

export { compareJobFairness, jobPriorityBand, type JobFairnessSignals } from './fairness.ts';
