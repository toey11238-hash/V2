# REQUIREMENT TRACEABILITY

Canonical chain: `Requirement -> Feature ID -> Module -> File -> Database/Event/UI -> Test -> Verification Evidence`.

`REQUIREMENT_CATALOG.md` retains the 204 numbered Master Spec groups. Leaf-level mapping remains IN_PROGRESS; no unmapped leaf is removed from scope and no source-only feature is considered VERIFIED.

| Requirement areas | Feature IDs | Main implementation | Data/UI/evidence | Status |
|---|---|---|---|---|
| Canon/session/completion control | CN-001..003, OBS-001 | project-control files, `scripts/canon-audit.mjs` | structural audit + registries | TESTING |
| Universal setup/scan/plan/idempotency | SU-001..007, SC-001, PL-001/002 | setup Discord route, setup/blueprints/control-center | setup sessions, plan hashes, jobs, journal | INTEGRATED |
| Roles/channels/Forums/permissions | RL-001..006, CH-001..003, FRM-001/002, PM-001..004 | setup/permissions/forums/member events/visual-system | mappings, overwrite drift/approval/repair, capability-aware role visuals | INTEGRATED / TESTING |
| Panels/interactive/media | PN-001..010, UX-001..003, AN-001, ASSET-001..006 | panels/assets/visual-system/visual-experience/actions | 87 panels, 103 panel media + 230 theme media, Components V2 renderer, living state, lifecycle/history/repair/rollback | INTEGRATED / TESTING |
| Queue/realtime/scheduler/watchdog | QU-001..005, RT-001..009, DG-001/002, CACHE-001 | jobs/realtime/scheduler/inbox/outbox/cache/bootstrap/visual-experience | leases, stream heads, heartbeats, realtime feed, durable Server Pulse revisions | INTEGRATED / TESTING |
| Dashboard/auth/control plane | API-001/002, DS-001..004, BP-004 | HTTP auth/server + React consoles | OAuth session, CSRF, guild scope, visual composer | INTEGRATED |
| Tickets/workflows/events | TK-001/002, WF-001..004, EVT-001, HELP-001 | tickets/workflows/events/operator actions | claims/SLA/transcripts/review/reminders | INTEGRATED |
| Notifications/temp voice/temp roles | NT-001/002, VC-001, RL-003 | notifications/scheduler/voice/member actions | quiet hours, delivery receipts, grant expiry | INTEGRATED |
| Security/moderation/governance | MD-001, SEC-001..004, GOV-001..004, OPS-001 | moderation/security/governance/maintenance | observations, approvals, retention, maintenance events | INTEGRATED / TESTING |
| Backup/repair/restore/change | BK-001..003, RC-001/002 | backups/recovery/repair/change-control workers | snapshots, PRE_* backup, approval, verify | INTEGRATED / real drill pending |
| Gaming core and recruitment | GM-* | gaming package/actions, migrations 002/005/015/031 | profile/LFG/team/clan/recruitment/scrim/tournament/progression | INTEGRATED / provider-E2E pending |
| Free-entry community rewards | GIV-001, SEC-001 | giveaways/actions/scheduler, migration 026 | free-entry check, dedup, close/draw/reroll audit | INTEGRATED / NOT VERIFIED |
| Creator/Education/Business | CRT-*, EDU-*, BUS-* | vertical packages + domain actions | persisted workflows/panels | INTEGRATED |
| Plugins/integrations | PLUG-001/002, IN-* | plugins/integrations/execution policy | registered-adapter-only enable, redacted health/history, trust/isolation gate | PARTIAL / provider adapters and third-party isolation pending |
| Analytics/growth/recommendations | ANL-*, GROW-001 | analytics/growth/recommendations | daily aggregates + live signals + deterministic advisor | INTEGRATED / TESTING |
| Compatibility/documentation | COMP-001, DOC-001 | compatibility/documentation packages + API/scripts | runtime report, upgrade plan, repository/blueprint reports | TESTING |
| Deployment | DEP-* | Dockerfile, render.yaml, GitHub Actions, docs | zero-mandatory-cost profile artifacts | IMPLEMENTED / live deploy pending |
| Verification | QA-* | tests/audit/checklists | 25-domain + 17-fault-model/structural evidence; full npm/DB/Discord gate blocked | BLOCKED/TESTING |

## Master Spec 183-199 focus mapping
| Master Spec group | Feature path | Current evidence | Status |
|---|---|---|---|
| 183 API Compatibility Layer | COMP-001 | `packages/compatibility`, `/api/compatibility` | TESTING |
| 184 Library Upgrade Safety | COMP-001 | compatibility rules + `planLibraryUpgrade` | TESTING |
| 185 Documentation Generator | DOC-001 | `scripts/generate-docs.mjs`, documentation package | TESTING |
| 186 Human-readable Blueprint Report | DOC-001 | `generateServerBlueprintReport` + guild API | TESTING |
| 187 Channel Recommendation Score | GROW-001 | deterministic channel scoring | TESTING |
| 188 Role Recommendation Score | GROW-001 | deterministic role scoring | TESTING |
| 189 Room Visibility Profiles | PM-001 | setup permission profiles + report notes | INTEGRATED |
| 190 Voice Profiles | VC-001 / BP-* | voice blueprints/temp voice lifecycle | INTEGRATED |
| 191 Forum/Thread Strategy | FRM-001/002 | native Forum desired state + thread tracking | INTEGRATED |
| 192 Thread Management | FRM-002 | gateway lifecycle persistence | INTEGRATED |
| 193 Archive Strategy | GOV-001 / TK-002 | ticket/archive/retention policy | INTEGRATED |
| 194-196 Growth Modes | GROW-001 | live capacity assessment modes + dashboard | TESTING |
| 197 Enterprise Mode | GROW-001 / BP-* | enterprise complexity/control recommendations | TESTING |
| 198 Custom Blueprint Wizard | BP-002/BP-004 | visual composer + version/checksum validation | INTEGRATED |
| 199 Blueprint Preview | BP-004/SU-003 | hierarchy preview + scanner/plan preview | INTEGRATED |

## Evidence boundary
- Source presence supports IMPLEMENTED only.
- Runtime wiring supports INTEGRATED only.
- Structural/domain smoke supports TESTING only for the contracts executed.
- `VERIFIED` requires applicable dependency-backed tests, real integrations, documentation, security/performance review and recorded evidence.

## Phase 5 operator/governance focus mapping
| Requirement focus | Feature IDs | Code/evidence | State |
|---|---|---|---|
| Feature Flags / Canary / Safe Rollout | GOV-003, FF-002 | `packages/feature-flags`, migration 032, Governance UI/API | TESTING |
| Import/Export + Versioning | CFG-002/003 | portable-config v2 migration/checksum + migration 034 | TESTING |
| Staff workflow review | OP-003, WF-001..003 | whitelisted transition API + Operational Deck | INTEGRATED |
| Scheduler controls | OP-004, RT-005 | shared cancellability contract + guild/CSRF permission checks | INTEGRATED |
| Integrations / health | IN-003 | migration 033, registry-only enable, redacted health/history | INTEGRATED foundation |
| Release compatibility warning | COMP-001, QA-007 | `scripts/release-readiness.mjs` | TESTING / currently BLOCKED |
| Failure/replay contracts | QA-006 | `scripts/fault-model-smoke.mjs` | TESTING; not a substitute for real chaos/load tests |


## Phase 6 traceability additions
| Requirement/Canon | Feature | Module/File | Data/Event | UI/Interaction | Test/Evidence |
|---|---|---|---|---|---|
| rate-limit/security/tenant isolation | SEC-005 | `http-security`, `http/server.ts`, operational views | migration 035 / diagnostics | Dashboard/API mutations + Security view | Phase6 test + 37/23/9 smoke gates |
| Creator scheduling | CRT-003 | `vertical-ops`, creator repo, scheduled worker | migration 036 / `creator.content.published` | Creator panel + Operator Deck | authored Phase6 suite; live Discord pending |
| Mentor scheduling | EDU-003 | `vertical-ops`, education repo, scheduled worker | migration 036 / `education.mentor.reminder` | Education panel + Operator Deck | authored Phase6 suite; live DM pending |
| Business support SLA | BUS-003 | business repo, `vertical-ops`, scheduled worker | migration 036 / SLA alert evidence | Business panel + Operator Deck | source/smoke; live Discord pending |
| restart/partial schedule recovery | RT-007 | scheduler `ensureScheduled`, scheduled worker reconciler | scheduled_tasks / `scheduler.vertical.reconciled` | Diagnostics/operations evidence | deterministic source gates; DB concurrency pending |
| external outage recovery | IN-004 | integrations `CircuitBreaker` / safe HTTP client | in-process circuit snapshot | adapter runtime only | domain/fault/stress-model smoke; provider E2E pending |

## Phase 7 traceability additions
| Requirement | Feature | Module / File | Data / Event | Surface | Evidence |
|---|---|---|---|---|---|
| Audit/log search + correlation + secret safety | OBS-002 | `packages/audit-log`, `AuditExplorer.tsx` | `audit_events`, migration 038 | `/api/guilds/:guildId/audit` | domain/fault smoke + syntax; DB query plans pending |
| Webhook signature + replay protection | IN-005 | `packages/integrations`, `webhook-routes.ts` | `webhook_deliveries`, `event_inbox`, migration 037 | generic signed ingress | domain/fault smoke; live concurrent replay pending |
| Integration capability truthfulness | IN-006 | default IntegrationRegistry + setup seed | `integrations` | `/setup` + Integration operator deck | source/smoke; provider-specific adapters pending |
| Multi-language + accessibility foundations | DS-005 | dashboard `i18n.ts`, CSS, localization | no authoritative state change | TH/EN switch + responsive/focus/reduced-motion | 11 static assertions; browser E2E pending |
| Production readiness truth | OP-006 | `packages/release-truth`, ReleaseTruthConsole | package/migration metadata | CLI + Dashboard | release gate correctly BLOCKED |

## Phase 8-9 traceability additions
| Requirement / Canon focus | Feature | Module / File | Data / Event | Surface | Evidence |
|---|---|---|---|---|---|
| integration adapters / capability truth | IN-002, IN-007 | `packages/integrations/src/providers/*`, `sync.ts`, setup/scheduler/HTTP runtime | migration 039 / `integration.content.synced` | `/setup` Integrations + Dashboard operator controls | domain/fault/static gates; real provider/network E2E pending |
| realtime truth / reconnect / resource bounds | RT-008 | `packages/realtime`, runtime readiness + HTTP probes | durable recent/outbox state + current worker snapshots | `/live`, `/ready`, `/health`, `/ws` | fault 35 + stress 13; real soak/load pending |
| scale/sharding/cache/database pressure | SCALE-001, CACHE-001 | config/bootstrap/cache/database | non-authoritative cache + pool counters | health/capabilities/env | deterministic stress + syntax; multi-instance/load pending |
| canary outcome evidence / human approval | GOV-003, GOV-005 | `packages/feature-flags`, Governance console | migration 040 outcomes linked to rollout observations | outcome review GET; no auto mutation endpoint | domain 56; DB/concurrency/live telemetry pending |
| deployment/release evidence | DEP-005, QA-010 | Dockerfile, CI/live workflows, live gate scripts, release manifest | clean Git tree + disposable target evidence | manual workflow only | source contracts PASS; npm/live targets blocked |
| plugin trust boundary | PLUG-002 | plugin runtime + `plugin-isolation-probe.mjs` | probe evidence only | operator diagnostics/docs | network namespace proven; full OS isolation remains BLOCKED |


## Server Fabric / UI V2 traceability additions
| Requirement / Canon focus | Feature | Module / File | State / Data | Surface | Evidence |
|---|---|---|---|---|---|
| broad non-Gaming rooms/categories | CH-002 | `packages/blueprints/src/index.ts` | stable desired logical resources | `/setup` blueprint/profile | UI V2 smoke + Canon duplicate-key audit; live guild pending |
| expanded role taxonomy | RL-004 | `packages/blueprints/src/index.ts`, permissions/setup | role logical keys + hierarchy policy | `/setup` desired-state plan | Hybrid 29 / Omni 79 source evidence; live hierarchy pending |
| Components V2 managed panels | PN-006 | `packages/panels/src/index.ts` | message flag + component JSON/hash | managed panels + `/setup` wizard | Discord/docs contract + syntax/UI V2 smoke; live Discord pending |
| Platform runtime Components V2 coverage | PN-008 | `apps/platform/src/discord/*`, `runtime/scheduled-worker.ts` | V2 helper payloads + static legacy guard | domain/operator/recovery/ticket/gaming/moderation/workflow/background delivery | syntax/UI V2 smoke; live Discord pending |
| expanded panel catalog | PN-007 / PN-009 | panels + panel registry | 82 stable panel IDs/targets | 82 managed surfaces | Canon media-reference audit + UI V2 smoke |
| deterministic media breadth | AS-001 | assets package/generator + bundled media | manifest SHA-256/dimensions/frames | Discord panel media + Dashboard gallery | 72 manifest assets + Canon audit |
| Dashboard visual/topology V2 | UX-002 | `apps/dashboard/src/App.tsx`, `styles.css`, `/api/blueprints` | real blueprint resource summary | Command Bridge | source/static smoke; browser E2E pending |

## Server Fabric V3 traceability additions
| Requirement | Feature ID | Module/file | DB/Event | UI/Discord | Test/evidence |
|---|---|---|---|---|---|
| Fabric V3 topology and module completeness | CH-003 / SU-008 | `packages/blueprints`, `packages/control-center` | n/a | `/setup` preview/apply + Dashboard topology | `test:ui-v2` 407 Omni resources; default Hybrid no-drop invariant |
| Fabric roles/channels/panels/media | RL-005 / PN-009 / ASSET-005 | blueprints/panels/assets | mappings/panel registry | 20 new managed panel hubs, 8 domain/ops families | UI V2 smoke 82 panels / 97 media refs |
| Durable Community Fabric workflow | WF-005 | `packages/community-fabric`, `fabric-actions.ts`, HTTP operational view | migration 041 + work events + general audit | Discord intake/list/review + Dashboard Workflows + Fabric | domain smoke + authored Vitest; live DB pending |
| Member Care privacy boundary | SEC-010 | `packages/community-fabric` | visibility=PRIVATE + RLS | no public MEMBER_CARE list | domain smoke privacy/metadata guards |
| Dashboard Fabric review | DS-009 | `OperationalDeck.tsx`, `server.ts`, `operational-views.ts` | same repository/audit as Discord | finite state buttons, CSRF/live permission | syntax/static + domain state-machine evidence; browser/live E2E pending |
## Phase 9 operations-evidence traceability
| Requirement | Feature | Module / runtime | Database / events | UI / API | Evidence |
|---|---|---|---|---|---|
| Operational incident chronology / recovery evidence | SEC-011 | `packages/incidents`, operator actions | migrations 042 + audit correlation | Incident Timeline V2 + Dashboard incidents + incident APIs | domain smoke + authored Vitest; live guild/DB pending |
| Capacity/growth pressure must be evidence-backed, not fabricated | GROW-002 | `packages/capacity`, realtime stats | migration 043 snapshots | Capacity Operational Deck + assessment API | domain smoke; real load evidence pending |
| Disaster recovery claims require actual drill evidence | RC-003 | `packages/recovery-drills` | migration 044 drill/event history | Recovery Drills V2 + Dashboard/API | evidence-gate smoke/Vitest authored; live restore drill pending |
| Release artifact must be tied to actual source/evidence | DEP-006 | `scripts/release-provenance.mjs` | n/a | CLI artifact | Git/tree/Canon/Spec/migration/asset hashes; lockfile/SBOM blocker explicit |

## Phase 10 traceability additions
| Requirement | Feature IDs | Module / files | Durable state / event | UI / operator surface | Evidence |
|---|---|---|---|---|---|
| Multi-guild worker fairness without sacrificing critical priority | SCALE-002 | `packages/jobs/src/fairness.ts`, `packages/jobs/src/index.ts` | `jobs` leases/start history | Jobs/Capacity evidence | dependency-free fairness assertions; live contention test pending |
| Durable optional-work resource budgets | OPS-002 | `packages/budgets`, scheduled/provider/automation integrations | `resource_budget_policies/windows/events` | Dashboard Budgets + Discord Capacity/Automation panels | migration 045 authored; domain/UI V2 source contracts |
| `/setup` configures budgets | SU-009 | control-center, setup interaction, setup worker | setup session + guild config + budget policies | `/setup` Budgets modal | UI V2/static contract; live guild pending |
| Safe event-backed generic automation | AUTO-001 | `packages/automation`, `runtime/automation-worker.ts` | automation rules/receipts/executions + scheduler/audit | Automation Lab + Dashboard Automation | migration 046 authored; domain source contracts |
| Runtime entrypoint actually wires platform loops | OP-007 | `apps/platform/src/index.ts`, `http/server.ts`, runtime workers, Discord binders | service heartbeats + job/task/event leases | `/live`, `/ready`, `/health` | bootstrap static contract + syntax/fault readiness model; live process pending |

## Phase 11 admission-control traceability additions
| Requirement | Feature IDs | Module / files | Durable state / events | UI / operator surface | Evidence |
|---|---|---|---|---|---|
| preserve safety/support under overload while shedding optional work | OPS-003 / SCALE-003 | `packages/admission-control`, scheduled/automation/setup runtime | migration 047 policies/decisions + admission-deferred domain events | Capacity panel + Operational Deck Admission | domain 89 / fault 39; live pressure test pending |
| `/setup` configures all control-plane policy | SU-010 | control-center + `discord/setup.ts` + setup worker | setup session/profile + admission policy | `/setup` Advanced governance | UI V2/static; live guild pending |
| alternate enqueue paths cannot bypass overload policy | SCALE-003 | Discord setup, HTTP setup/change, setup worker | admission decisions + job correlation | setup/change operator flows | source guards + syntax; live race pending |
| no automatic scope destruction from capacity pressure | OPS-003 | admission pure contract / capacity | decision evidence only | diagnostics/operator evidence | protected operation assertions; live recovery drill pending |


## Phase 12 truth / leaf traceability additions
| Requirement / Canon focus | Feature | Module / File | Evidence | State |
|---|---|---|---|---|
| no silent requirement loss / leaf tracking | QA-015 | `scripts/requirement-traceability.mjs`, `docs/generated/REQUIREMENT_LEAF_TRACEABILITY.md` | deterministic Canon + Master Spec bullet coverage; stale output fails `npm run test:traceability` | TESTING |
| authoritative current-state consistency | QA-014 | `scripts/project-truth-audit.mjs` | current migration/registry/checkpoint drift fails `npm run test:project-truth` | TESTING |

Phase 12 does not reinterpret a mapped leaf as implemented or VERIFIED; feature state remains sourced from `FEATURE_REGISTRY.md` and live evidence gates remain unchanged.


## Phase 13 external AI traceability
| Requirement | Registry | Implementation | Evidence / gate | State |
|---|---|---|---|---|
| Zero-cost AI default remains local | AI-001 / GOV-004 | `packages/ai-hooks`, config defaults | `test:domain-smoke`, `test:external-ai` | TESTING |
| External provider explicit server allowlists/secret | AI-002 / SEC-012 | `packages/config`, `packages/ai-hooks` | `test:external-ai` | TESTING |
| Per-guild provider selection through universal `/setup` | SU-011 | control-center + Discord setup + Dashboard + Setup Worker | `test:external-ai`, UI V2 source gate | TESTING |
| External Dashboard execution rechecks guild opt-in + live permission | SEC-012 | HTTP AI route | `test:external-ai`; live Discord E2E pending | TESTING |
| Fixed OpenAI Responses egress / no arbitrary provider URL | AI-002 | `createOpenAiResponsesProvider` | `test:external-ai`; live provider E2E pending | TESTING |
| Secret/data-class/input bounds fail closed | AI-001 / AI-002 | AI hook validators | `tests/ai-hooks.test.ts`, domain/external-AI smoke | TESTING |


## Phase 14 durable data-governance traceability
| Requirement | Registry | Implementation | Durable evidence | Operator surface | Evidence / gate |
|---|---|---|---|---|---|
| durable legal holds / no implicit release | GOV-001 / GOV-006 | `packages/governance`, migration 048 | `retention_legal_holds`, governance revision | `PANEL_PRIVACY` hold/list/release-request | `test:data-governance`; live DB/operator flow pending |
| stale destructive approval invalidation | GOV-006 | retention service + target policy hash | approval payload `planHash/policyHash/governanceRevision` | retention request/approve/execute | source contract PASS; rolling-deploy/live race pending |
| atomic bounded retention | GOV-006 | retention transaction + advisory lock | `retention_runs` plan/policy/error evidence | privacy execute | source contract; rollback/concurrency injection pending |
| privacy export confidentiality/integrity | GOV-002 | privacy export service + scheduler reconciliation | request/artifact hash/expiry state | privacy export | repeatable/bounded/canonical-hash source contracts; live DB pending |
| current-state truth for migration 048 | QA-014 / QA-017 | project-truth + Phase 14 smoke | generated traceability/current docs | CLI gates | `test:project-truth`, `test:traceability`, `test:data-governance` |

## Phase 15 audit-integrity traceability
| Requirement theme | Feature path | Implementation | Durable evidence | UI/operator path | Test/evidence |
|---|---|---|---|---|---|
| chained audit history / tamper evidence | OBS-003 / SEC-013 | `packages/audit-log`, `AuditRepository`, migration 049 | `audit_integrity_heads`, `audit_integrity_entries` | Audit Explorer + `status:audit-integrity` | `test:audit-integrity`; live DB pending |
| atomic same-scope audit sequencing | OBS-003 | DB transaction + `FOR UPDATE` integrity head | sequence/previous/payload/event hashes | read-only evidence | source contract PASS; contention test pending |
| retention-compatible continuity | GOV-006 / OBS-003 | detailed audit DELETE + independent integrity entries | hash-only continuity after content retention | verifier coverage state | authored live DB gate; not executed |
| bypass/tamper visibility | SEC-013 | bounded verifier + detailed-audit UPDATE guard | mismatches/post-start unchained evidence | Dashboard/Discord status | source contract PASS; live tamper test pending |
| current-state truth for migration 049 | QA-014 / QA-018 | project-truth + Phase15 smoke | generated traceability/current docs | CLI gates | `test:project-truth`, `test:traceability`, `test:audit-integrity` |

## Phase 18 plugin sandbox / executable live-QA traceability
| Requirement theme | Feature path | Implementation | Durable evidence | Live/operator path | Test/evidence |
|---|---|---|---|---|---|
| fail-closed untrusted plugin kernel boundary | PLUG-002 | `packages/plugins/src/external.ts`, config/runtime startup probe | migration 051 `plugin_execution_runs.isolation_profile` | startup + plugin execution runtime | `security:plugin-isolation-gate`, `test:phase18-plugin-sandbox`; deployment re-probe pending |
| exact disposable DB verification | QA-004 | `scripts/live-db-gate.ts` | exact migration set, transaction/advisory-lock/RLS + governance/audit/backup/plugin evidence | manual workflow DB switch | authored only; approved DB execution pending |
| deployed HTTP security/load/soak/fault evidence | QA-005 | `scripts/live-http-gate.mjs` | emitted evidence JSON | manual workflow HTTP switch | synthetic self-test PASS; deployed target pending |
| browser mobile/a11y/runtime evidence | QA-005 | `scripts/live-browser-gate.mjs` | emitted CDP evidence JSON | manual workflow browser switch | synthetic CDP document self-test PASS; deployed target pending |
| approved Discord mutation evidence | QA-005 | `scripts/live-discord-gate.ts` | disposable resource IDs/attribute verification | manual workflow Discord switch | authored; approved guild execution pending |
| Phase 18 source contract | QA-020 | `scripts/phase18-plugin-sandbox-smoke.mjs`, `scripts/phase18-live-qa-smoke.mjs` | source/static/current-host evidence | CLI gates | 42 + 49 assertions PASS; does not replace live integration |

## Phase 28 extreme visual/system traceability
| Requirement theme | Feature path | Implementation | Runtime/evidence path | Test/evidence |
|---|---|---|---|---|
| adaptive realtime 3D/motion/emoji | UX-004 | `packages/visual-system`, `RealtimeVisualStage.tsx` | WebSocket/runtime event -> visual directive -> bounded Canvas/CSS-3D stage | `test:phase28-extreme-overhaul`; deployed GPU/mobile pending |
| actual event-to-FX contract | RT-010 | ticket/event/Gaming/member/security/job publishers + visual mapping | successful domain transition -> event publisher -> realtime/living visual consumer | Phase 28 event-name/source assertions; live reconnect/burst pending |
| deterministic governed media | ASSET-007 | `packages/assets`, offline visual generator, panel/theme manifests | stable logical asset path -> final bytes -> SHA/dimension/frame manifest | Phase 28 byte/hash/frame assertions; CDN/canonical renderer pending |
| Thai source-of-truth presentation | UX-004 / QA-030 | `packages/panels`, `packages/localization`, Dashboard/Discord presentation maps | Thai catalog/resource/UI source -> renderer/action response | `test:thai-presentation` PASS 5,818 |
| safe user error presentation | SEC-015 | `safeDiscordError`, `safeHttpFailure` | raw exception -> operator log; bounded Thai fallback/code -> user | Thai audit direct-error-exposure guards; live fault injection pending |
| Phase 28 closure contract | QA-030 | Phase 28 + Thai + parser + preflight gates | source/static evidence only | Phase 28 PASS 5,762; offline preflight PASS 31; release blocked by `lockfile.missing` |

## Phase 29 production reality / operations intelligence traceability
| Requirement theme | Feature path | Implementation | Runtime/evidence path | Test/evidence |
|---|---|---|---|---|
| setup-derived read-only Digital Twin | SU-015 | `packages/digital-twin`, setup preview, `DigitalTwinConsole.tsx` | canonical setup plan -> topology/mutation/conflict/API-pressure evidence -> approval path; no Discord write | `test:phase29-production-intelligence`; live setup preview pending |
| evidence-backed operations synthesis | OPS-004 | `packages/operations-intelligence`, `phase29-views.ts`, Operations Intelligence Dashboard | jobs/outbox/inbox/heartbeats/incidents/SLO + Discord/realtime stats -> bounded health/signals | Phase 29 pure/source assertions; deployed DB/runtime evidence pending |
| durable + live read-only replay | RT-011 / SEC-016 | `packages/event-replay`, replay API/UI | outbox + recent realtime -> de-dup/order/redaction -> read-only inspector; no republish/mutation | production-intelligence + chaos/replay gates; live auth/data evidence pending |
| fail-closed Recovery Evidence V2 | RC-004 / QA-031 | `packages/recovery-evidence`, `phase29-views.ts`, `RecoveryConsole.tsx` | backup + integrity + approval + restore + RESTORE_VERIFY + drill -> cross-proof timeline; no restore mutation | production-intelligence fault harness; live restore drill pending |
| priority-aware visual scheduling | UX-005 | `packages/visual-system`, `RealtimeVisualStage.tsx` | real event -> directive -> START/PREEMPT/SUPPRESS/MERGE/DUPLICATE -> bounded stage | deterministic branch proof + 2000-event source stress; deployed GPU/WebSocket pending |
| sustained performance adaptation | UX-005 | visual performance governor | FPS/device/visibility/reduced-motion evidence -> hysteresis tier selection | anti-flap/hidden/reduced-motion source assertions; representative device profiling pending |
| Phase 29 closure contract | QA-031 | Phase 29 gates + offline preflight + project truth/traceability | source/static/model evidence only | production-intelligence PASS 51; chaos/replay PASS 4016; dependency/live evidence remains separate |
