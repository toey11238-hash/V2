# Phase 23 — Experience & Orchestration Expansion

Status: **SOURCE/STATIC TESTING**. This phase expands existing Canon domains without changing the two-root slash-command limit and without weakening live-evidence gates.

## 1. Setup impact analysis
- `/setup` scan/preview computes a bounded, deterministic impact report from the actual desired-state action plan.
- Impact evidence includes mutation count, high-risk actions, unresolved/required conflicts, affected modules/resource kinds, score, level and rationale.
- Impact is advisory evidence. It never bypasses stale-plan checks, explicit approvals, permission checks or durable job execution.
- Change Control reuses the same impact model so Discord setup preview, Dashboard preview and change risk do not diverge.

## 2. Gaming availability and scheduled sessions
- `game-sessions` is a first-class `/setup` module in Full Platform and Gaming Max footprints.
- Members can store bounded weekly availability by enabled game and IANA timezone. Raw availability is private member scheduling data: audit/operator views expose only game/timezone/window counts or guild aggregates, not raw windows.
- Scheduled gaming sessions persist host, game, timestamp, duration, capacity and OPEN → READY → ACTIVE → COMPLETED/CANCELLED state.
- Session joins are capacity-checked under row lock and idempotent. Players can leave before activation; the host must cancel instead of silently leaving ownership orphaned.
- Session create emits real event-topic fanout and schedules a bounded 15-minute reminder when enough lead time exists. Terminal state cancels the pending reminder.
- Gaming session actions feed progression/XP and analytics evidence. Competition/reward behavior remains non-wagering under Canon.
- Migration `052_gaming_sessions_orchestration.sql` is authored only until run on an explicitly approved disposable DB.

## 3. Automation dry-run / explain
- Operators can simulate the current persisted automation rule against a supplied event type and bounded payload without executing actions, scheduling tasks or writing automation execution evidence.
- Simulation reports event-match, condition evidence and safe action intents only when all conditions match.
- The simulation route remains guild-scoped and read-only; it is explicitly labelled `read-only-no-side-effects` and is not presented as a real execution.

## 4. Analytics trend/health primitives
- Dimensionless daily metrics can produce previous-vs-current trend evidence with sample sufficiency, direction, percentage change and HEALTHY/WATCH/DEGRADED/UNKNOWN state.
- Trend policy supports higher-is-better and lower-is-better metrics. It does not infer causality.
- Gaming session creation/completion/join metrics enter the existing aggregate analytics pipeline.

## 5. Evidence and limits
- `npm run test:phase23-experience-expansion` is dependency-free source/pure evidence only.
- Migration 052, concurrent session joins, notification fanout, Dashboard/Discord interaction behavior and real analytics data still require approved DB/Discord/deployment targets before VERIFIED.
- QA-003 remains blocked until a reviewed `package-lock.json` enables project-pinned typecheck/Vitest/build/audit/SBOM.
