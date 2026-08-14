# PERFORMANCE CHECKLIST

## Implemented performance/safety primitives
- [x] Heavy setup/repair/restore/change work leaves interaction/HTTP handlers through durable jobs.
- [x] Job and scheduled-task claims use `FOR UPDATE SKIP LOCKED` with leases/heartbeat/stale recovery.
- [x] Guild mutation locks prevent concurrent structural writers.
- [x] Progress comes from actual work units/phases; no synthetic per-second Discord progress.
- [x] Dashboard one-second clock is local rendering; Discord message edits remain event/rate-limit aware.
- [x] PostgreSQL pool limits and core indexes exist in authored schema.
- [x] Realtime recent-event memory is bounded and durable outbox isolates persistence/fanout.
- [x] Scheduler claim batches are bounded and retry loops are bounded.
- [x] Notification fanout is paged/bounded and delivery uses dedup receipts plus quiet-hour deferral.
- [x] Panel deployment edits managed messages where possible instead of reposting on restart.
- [x] Scheduled backup default is weekly in the free profile, reducing unnecessary storage/CPU churn.
- [x] Asset manifest/content hashes avoid unnecessary republish.
- [x] Shared L1/L2 cache has TTL, bounded in-process size, prefix invalidation and single-flight; cache is never authoritative.
- [x] Durable inbound event ordering stores one compact stream head per ordered aggregate instead of replaying full history.
- [x] Growth assessment uses aggregated activity and Discord counts rather than high-frequency polling.

## Missing executed evidence
- [ ] Discord REST large-blueprint rate-limit/load behavior.
- [ ] Queue wait/job duration/Discord REST latency persisted dashboards and SLO review.
- [ ] Inbox/outbox/notification/WebSocket throughput, stream-contention and backpressure tests.
- [ ] Cache stampede/expiry/index/query-plan tests under multi-worker load.
- [ ] Real DB query-plan/index review after realistic data generation.
- [ ] Gaming/LFG/tournament/progression concurrent large-guild load tests.
- [ ] Multi-instance/sharding/distributed lock failover tests.
- [ ] Asset render CPU/memory budget and CDN failure tests.
- [ ] Memory leak/background task cleanup soak test.
- [ ] Render cold-start and free-tier behavior measurements from a live deployment.

## Phase 5 additions
- [x] Feature rollout decisions remain deterministic and observation writes are explicit POST-side effects, not GET mutations.
- [x] Operational integration history is bounded by query limits.
- [x] Scheduler cancellation reuses indexed task identity/state rather than scanning arbitrary jobs.
- [ ] Load evidence for rollout observation volume, operator mutations and integration health fanout remains pending.


## Phase 6 additions
- [x] Mutation limiting uses fixed windows and bounded local subject memory; durable backend is indexed by Guild/route/time.
- [x] Integration circuit recovery admits one HALF_OPEN probe instead of releasing concurrent probes after cooldown.
- [x] Vertical scheduler reconciliation runs periodically with bounded `LIMIT 100` scans over indexed scheduled/SLA columns and only creates missing deduplicated tasks.
- [x] Deterministic stress-model checks cache single-flight/event ordering/rate-limit/circuit invariants without pretending to measure production throughput.
- [ ] Real throughput/query-plan/Render proxy/Discord REST/load/soak evidence remains required.

## Phase 7 performance additions
- Audit queries are limit bounded (max 100), cursor based and backed by guild/action/result/resource/correlation indexes.
- Webhook request bodies are capped at 1 MiB by default and transformed event batches at 100 events.
- Webhook receipts expire and are pruned in bounded batches; body/signature content is stored as SHA-256 fingerprints, not raw payload copies.
- Real webhook burst/load and audit query-plan evidence is still pending; deterministic/static checks are not throughput benchmarks.

## Phase 8-9 performance additions
- [x] WebSocket sends enforce a buffered-byte ceiling and slow clients are disconnected/reconnectable rather than accumulating unbounded memory.
- [x] L1 TTL cache has a bounded entry count; single-flight loaders have a bounded in-flight cardinality and deterministic stress assertions.
- [x] PostgreSQL pool maximum/connect timeout/statement timeout/query timeout are bounded configuration and health reports total/idle/waiting pressure.
- [x] Discord shard mode supports single/auto/manual while default remains single for small/free deployments.
- [x] Provider sync is scheduled at coarse durable cadence with bounded snapshot retention rather than high-frequency polling.
- [x] Graceful shutdown is bounded by a configurable deadline and records non-zero failure truth.
- [ ] Real WebSocket slow-client/soak, shard/multi-instance, DB pool saturation, provider burst/rate-limit and cache stampede load evidence remains required.


## Server Fabric / UI V2 performance additions
- [x] Blueprint expansion is footprint-aware; Compact/Standard/Advanced/Enterprise profiles do not blindly provision Omni breadth.
- [x] Dashboard topology summary uses one blueprint API payload rather than per-resource polling.
- [x] Managed panels remain bounded Components V2 compositions and use hash/version/update-in-place semantics instead of rapid reposting.
- [x] Background notification/scheduler messages share the bounded V2 notice renderer rather than introducing a second legacy presentation path or extra polling loop.
- [x] Role visual changes reuse scanner/diff/apply batching and do not introduce an independent high-frequency updater.
- [ ] Measure large-blueprint Discord REST rate-limit behavior and panel V2 payload/edit latency in a test guild before production sizing claims.

## Server Fabric V3 performance additions
- [x] UI V2 smoke enforces blueprint footprint headroom (<=450 non-role resources and <=200 roles per built-in blueprint) instead of allowing unbounded catalog growth.
- [x] Default setup module-completeness check prevents hidden partial blueprints that would require repeated reconcile passes.
- [x] Community Fabric staff queue/public lists are bounded and indexed; public list caps at 20 and staff queue at 25 per repository call.
- [x] Dashboard Workflow view remains bounded (220 rows) and reuses one operational query instead of per-item polling.
- [ ] Measure actual Discord REST creation/edit rate limits for the 407-resource Omni footprint and DB query plans for Fabric queues under realistic data.
## Capacity evidence guard
- [x] Capacity pressure is derived from bounded current evidence rather than fabricated progress.
- [x] Internal soft ceilings are configurable and explicitly not Discord hard-limit claims.
- [x] Capacity assessment is advisory; it does not silently delete channels/roles or disable required modules.
- [ ] Validate pressure thresholds against real load/soak evidence before treating them as production tuning values.

## Phase 10
- [x] Tenant-fair job claim model preserves critical priority lanes and considers same-guild in-flight/recent starts.
- [x] Optional/background resource budgets use bounded deterministic windows and durable retry-at evidence.
- [x] Generic automation caps rules/actions and stores durable claim/retry state rather than unbounded in-memory work.
- [ ] Run real PostgreSQL contention/load tests for fair claim query and budget row locks on approved disposable DB.
- [ ] Run real multi-worker throughput/latency/soak evidence before tuning default fairness/budget values.

## Phase 11 overload / admission
- [x] Fresh capacity snapshots are reused for up to 15 minutes; stale evidence falls back to bounded durable counters instead of fake realtime metrics.
- [x] Optional background/provider/bulk operations can defer before consuming budget/external work.
- [x] Safety/support/diagnostic operations stay available regardless of overload preset.
- [ ] Measure admission-query overhead, retry convergence and queue drain under real PostgreSQL contention/load.
- [ ] Validate free-tier behavior/cold-start impact on observed pressure before tuning defaults.

## Phase 15 audit-integrity performance
- [x] Integrity verification clamps requested chain tails to 10..2000 entries.
- [x] Legacy evidence scan is capped at 1000 reported rows and post-chain bypass evidence at 100, with explicit capped flags rather than unbounded full-guild scans.
- [x] Write serialization is scoped to the guild/global chain-head row rather than one platform-global audit lock.
- [ ] Measure same-guild audit write throughput/lock wait under realistic concurrent load on approved PostgreSQL.
- [ ] Capture query plans/index behavior for large audit-integrity tails and retained-audit joins before making scale claims.

## Phase 16 backup/restore evidence performance
- Canonical hashing and storage read-back add bounded work proportional to snapshot size; representative large-guild latency/size must be measured live.
- Restore plan hashing is deterministic and bounded by the preview change set; no unbounded history scan is introduced.
- Verification evidence indexes are guild/recent and backup/restore scoped.
- NOT VERIFIED: backup capture latency, restore verification latency and storage growth under representative Omni-scale guilds.

## Phase 18 plugin / live-QA performance evidence
- [x] Third-party runner bounds wall-clock timeout, output bytes, file descriptors, CPU time, V8 heap and ephemeral tmp space.
- [x] V8 heap budget is explicitly not claimed as a hard RSS/cgroup boundary.
- [x] HTTP live gate supports bounded request count/concurrency, configurable error-rate/p95 thresholds, optional bounded soak duration and client-abort evidence.
- [x] HTTP harness synthetic self-test executes both burst and soak paths; this validates the harness, not platform capacity.
- [x] Browser harness checks desktop/mobile overflow and runtime errors using one bounded Chromium/CDP session.
- [ ] Capture production-target RSS/PID containment evidence for untrusted plugins before enabling them on a deployment target.
- [ ] Run representative Discord/API/DB/browser sustained load, restart, rate-limit and chaos scenarios before capacity/SLA claims.

## Phase 23 bounded orchestration
- Setup impact: maximum 5,000 plan actions.
- Availability: maximum 14 weekly windows/member/game and 100 users for pure overlap calculation; overlap output capped at 50 windows.
- Sessions: capacity 2-100, duration 15-720 minutes, upcoming lists capped at 50 and Discord display capped further.
- Automation simulation: maximum 20 conditions, 10 actions and bounded condition-set cardinality.
- Analytics trend evaluation is O(1) per comparable metric pair and operational rows remain bounded by existing query limits.

## Phase 27 visual/motion budgets
- [x] Ordinary living-panel edits are product-coalesced (15s default) and urgent incident/recovery states use shorter bounded delays; this is not a hard-coded Discord rate-limit assumption.
- [x] State updates edit the owned managed message rather than fan out a new message per event.
- [x] Durable event de-dup prevents repeat delivery from causing repeat visual edits/revisions.
- [x] Animated media has static fallback and `MINIMAL`/reduced-motion policy can suppress animation.
- [x] Dashboard CSS respects `prefers-reduced-motion` and responsive layouts.
- [x] Theme media manifests expose bytes/frame counts so asset size regressions can be budgeted.
- [ ] Measure actual Discord edit buckets, CDN/media transfer, dashboard animation CPU/GPU and mobile rendering on deployed targets before production tuning claims.

## Phase 28 realtime visual performance budgets
- [x] Realtime visual stage uses one governed animation loop rather than unbounded per-widget loops.
- [x] Particle/DPR work is bounded and the stage reacts to resize/visibility/reduced-motion.
- [x] Sustained low-FPS or constrained-device evidence can reduce visual tier instead of continuing maximum effects.
- [x] Mobile/responsive layout and reduced-motion contracts are covered by source/static gates.
- [x] Discord living-panel updates remain event-de-duplicated and product-coalesced; web animation cadence is never translated into per-frame Discord writes.
- [x] Governed visual loading budget is regression-checked: max static asset 320 KiB, max motion asset 768 KiB, total governed visual corpus 120 MiB, and Dashboard does not eagerly import both full asset manifests.
- [ ] Measure deployed desktop/mobile CPU/GPU/frame-time, battery impact, memory, Canvas decode/media transfer and long-session WebSocket behavior before production performance claims.
- [ ] Capture real Discord edit-bucket/rate-limit behavior under bursty Phase 28 event traffic on an approved test guild.

## Phase 29 operations/replay/visual orchestration budgets
- [x] Event Replay API clamps requested timeline size to 1-500 and the pure replay model bounds payload depth, arrays, object keys and string length.
- [x] Digital Twin rejects plans above its bounded action ceiling and derives API-pressure units only from actual Discord CREATE/UPDATE mutations.
- [x] Operations Intelligence uses bounded aggregate queries/recent evidence rather than loading unbounded job/event/incident history into the Dashboard.
- [x] Visual Orchestrator keeps a bounded recent-event dedup window, caps merged particle work and duration, and can suppress lower-priority presentation under urgent scenes.
- [x] Performance governor uses sustained low/high FPS hysteresis to avoid visual-tier flapping while hidden/reduced-motion overrides remain immediate.
- [x] Deterministic Phase 29 stress covers 700 replay inputs, 1,200 Digital Twin actions and 2,000 visual events with budget assertions.
- [ ] Measure Operations Intelligence SQL query plans/latency at representative database cardinality and add indexes only from measured evidence.
- [ ] Measure deployed replay payload transfer/render cost and long-timeline interaction on mobile/low-memory browsers.
- [ ] Measure real visual preemption/merge behavior under deployed WebSocket burst/jitter and representative GPU/frame-time/battery constraints.

- [x] Recovery Evidence V2 reads bounded rows (50 backups / 80 runs / 80 approvals / 120 verification records / 60 drills) and caps the rendered evidence timeline; it does not stream unbounded historical recovery data.
