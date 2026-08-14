# PROJECT CANON SYSTEM - DISCORD AUTO SERVER PLATFORM

Status: CANONICAL / AUTHORITATIVE
Authority: Highest project-level source of truth
Applies to: Requirements, architecture, features, UI/UX, Discord structures, roles, channels, panels, behavior, data, tests, deployment, operations, security, gaming, assets, animation, and future extensions.

## 1. Source-of-Truth Hierarchy

The project MUST use this authority chain:

CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION

- `CANON.md` = immutable project laws and durable truth.
- `MASTER_SPEC.md` = complete detailed specification under Canon.
- `FEATURE_REGISTRY.md` = feature inventory, status, dependencies, evidence.
- `PROJECT_MEMORY.md` = latest verified project state and continuation context.
- `DECISIONS.md` = approved decisions and conflict resolutions.
- CODE = actual implementation.
- TEST = verification evidence.
- INTEGRATION = proof that components work together in the real system.

When two sources disagree, the higher source wins unless the user explicitly approves a Canon change.

## 2. Canon Immutability

AI/agents MUST NOT:
- modify Canon to make implementation easier;
- reduce scope to make tests pass;
- delete requirements to claim completion;
- reinterpret an explicit Canon rule into a weaker version;
- silently replace a real feature with a placeholder/mock;
- treat a new chat message as automatically overriding Canon;
- invent new Canon from assumptions.

A Canon change is allowed only through the Canon Change Process defined below.

## 3. Canon Change Process

Every new user requirement is initially `PROPOSED_CANON_CHANGE`.

If it does not conflict with Canon:
1. record it in `DECISIONS.md` or Canon change history;
2. add/update the relevant Canon clause when it materially changes durable project truth;
3. expand `MASTER_SPEC.md`;
4. map it into `FEATURE_REGISTRY.md` and traceability;
5. implement and verify normally.

If it conflicts with Canon:
1. mark `CONFLICT`;
2. inspect `DECISIONS.md`;
3. do not silently choose a side;
4. preserve the existing Canon until the user explicitly resolves the conflict.

## 4. No Conversational-Memory Dependency

Chat history or AI memory MUST NOT be the primary project state store.

At the start of every implementation session, the agent MUST read at minimum:
- `CANON.md`
- `MASTER_SPEC.md`
- `PROJECT_MEMORY.md`
- `FEATURE_REGISTRY.md`
- `DECISIONS.md`
- `PROJECT_STATUS.md` when present
- `TODO.md` when present
- `BLOCKED.md` when present
- `CHANGELOG.md`
- relevant registries and architecture documents

If context is lost, work resumes from workspace files, not guessed recollection.

## 5. Session-End Truth Maintenance

After material work, the agent MUST:
- verify the change against Canon;
- update feature status based on evidence, not optimism;
- update `PROJECT_MEMORY.md`;
- update `CHANGELOG.md`;
- update relevant registries;
- record blockers/conflicts/decisions;
- record tests run and failures;
- record migrations/recovery/security/performance impact when applicable.

## 6. Product Identity Canon

This product is a production-grade `Discord Auto Server Platform`, not a simple command bot.

It MUST remain modular, maintainable, secure, observable, recoverable, idempotent, multi-guild isolated, rate-limit aware, event-driven where appropriate, restart-safe, and extensible.

The platform MUST continue to expand beyond the baseline Master Spec. Existing requirements are minimum scope, not a ceiling.

## 7. Slash Command Canon

There may be no more than TWO top-level slash commands unless the user explicitly changes this Canon.

Current canonical command model:
- `/setup` = the universal configuration and provisioning command for EVERYTHING.
- the second top-level command is reserved for runtime/control-center operations and may be finalized through an approved decision without exceeding the two-command limit.

No module may introduce a new top-level slash command by itself.

Deep functionality MUST use:
- subcommands/subcommand groups where Discord supports them;
- interactive panels;
- buttons;
- select menus;
- modals;
- dashboard controls;
- context-aware control centers.

## 8. `/setup` Universal Configuration Canon

`/setup` is the central configuration surface for the entire platform, including but not limited to:
- server type, size, language, timezone, theme;
- templates and blueprints;
- categories/channels/roles/permissions;
- panels and interaction packs;
- welcome/verification/onboarding;
- tickets/forms/reports/suggestions;
- moderation/security/anti-abuse;
- events/announcements/scheduler;
- backup/restore/repair/sync/drift policies;
- analytics/observability;
- integrations;
- ALL Gaming systems;
- feature flags and module dependencies;
- media/assets/animation behavior;
- dashboard configuration.

Gaming configuration MUST NOT be separated into an independent top-level `/game` command.

## 9. Gaming Is a First-Class Platform Domain

Gaming is not merely a channel template. It MUST be treated as a first-class platform domain with extensive modular systems.

Canonical Gaming families include at minimum:
- Game Registry and per-guild game enablement;
- Dynamic Game Modules;
- game-specific channels, categories, panels, roles, notifications and themes;
- player profiles;
- platform/region/game-role preferences;
- LFG;
- party finder;
- squads/teams;
- clans/guilds;
- recruitment;
- scrims;
- competitive matches;
- non-wagering tournaments;
- events/game nights/raids/community sessions;
- check-in/attendance/waitlist;
- match/result workflow;
- dispute/review workflow;
- leaderboards where based on legitimate gameplay/community metrics;
- achievements/badges;
- XP/levels with anti-farming controls;
- quests/missions;
- seasonal progression when enabled;
- temporary voice and join-to-create voice;
- team/clan/private voice and channel isolation;
- coaching/mentor systems;
- guides/builds/knowledge center;
- clips/highlights/creator media;
- game news/patch notes/status integrations;
- game adapter/capability architecture;
- game analytics;
- game event automation;
- game-specific feature flags;
- game-specific audit/security policies;
- scalable storage models for players, teams, clans, matches, events and achievements.

Gaming MUST be expanded beyond these items when useful, provided additions remain Canon-compatible and production-viable.

## 10. Absolute No-Gambling Canon

The platform MUST NOT implement, promote, facilitate, or optimize gambling, betting, casino behavior, wagering, paid games of chance, sportsbook-like mechanics, or equivalent grey-market systems.

Gaming competition/tournament systems MUST be non-wagering. Competitive scoring, rankings, rewards, badges, titles, participation rewards, and legitimate event prizes may exist only when they do not implement gambling/betting mechanics.

No feature may disguise betting as prediction, odds, staking, chance-based investment, or similar mechanics.

## 11. Real-Time Canon

Real-time behavior MUST be real, event-backed, and measurable.

- Event/state updates must originate from real events/state transitions.
- Fake progress percentages are forbidden.
- If total work is known, progress may be computed from actual work units.
- If total work is unknown, phase/state progress MUST be used instead of fabricated precision.
- Dashboard/client clock, timers and countdowns may render at true 1-second resolution locally where appropriate.
- Discord message edits MUST remain rate-limit aware; do not edit Discord messages every second merely to simulate real-time.
- Use push/WebSocket/event streams where appropriate instead of wasteful polling.
- Last-event, heartbeat, stale-state and reconnect behavior MUST be observable.

## 12. Animation and Premium Visual Canon

The platform MUST pursue a high-end, premium, modern visual system while remaining compatible with actual Discord/API constraints.

Required capabilities include:
- animated state transitions;
- loading/success/warning/error/retry states;
- progress visualization;
- animated/looping media assets where supported;
- GIF/animated image/banner support;
- motion-ready dashboard UI;
- component state transitions;
- skeleton/loading UX;
- responsive/mobile-friendly layouts;
- accessibility fallback when animation/media is unavailable;
- reduced-motion support on web dashboard when applicable;
- consistent theme tokens and visual language.

Discord-native components do not support arbitrary web-style animation. The implementation MUST use the closest supported method without pretending unsupported behavior exists.

## 13. Automatic Asset Generation Canon

The architecture MUST include an `Asset Generation & Media Pipeline` capable of automatically producing and managing project visuals where configured.

It SHOULD support:
- generated banners;
- thumbnails;
- panel art;
- game/event cards;
- achievement/badge visuals;
- status illustrations;
- animated GIF/WebP/video-derived loop assets where the deployment target supports them;
- render templates;
- game/theme variants;
- localization variants;
- responsive crops/sizes;
- fallbacks;
- versioning and content hashes;
- storage/CDN abstraction;
- asset registry;
- render job queue;
- retry/failure handling;
- moderation/safety checks for generated media where required;
- cache invalidation;
- stale/orphan cleanup.

During implementation, assets should be generated into project/storage/deployment paths and wired into the relevant panel/dashboard automatically. They do not need to be pasted into chat unless the user explicitly asks for a preview.

## 14. Technology and Architecture Expansion Canon

The project SHOULD continuously consider production-grade additions when they improve reliability, security, UX, scalability, or maintainability, including:
- typed schema validation;
- migration framework;
- event bus;
- durable queue;
- distributed locks;
- outbox/inbox pattern where appropriate;
- idempotency store;
- optimistic concurrency;
- WebSocket/SSE gateway as appropriate;
- background render workers;
- object storage/CDN abstraction;
- tracing/metrics/error tracking;
- feature flags;
- plugin SDK;
- integration adapters;
- sharding/multi-instance readiness;
- safe rollout/canary capability;
- chaos/failure tests;
- security posture checks;
- policy engine;
- configuration diff and preview;
- automated documentation generation.

No technology may be added solely for fashion; it must have a clear operational purpose.

## 15. Roles, Channels and Structure Expansion Canon

The system MUST support significantly richer role/channel structures than the baseline examples while avoiding unnecessary clutter.

The Blueprint Engine must choose structures based on:
- server type;
- size;
- enabled modules;
- gaming profile;
- operational complexity;
- privacy/security requirements;
- growth mode;
- staff model.

Roles/channels/resources MUST use stable logical identities and ownership boundaries instead of relying on mutable names.

## 16. Premium Setup UX Canon

`/setup` MUST feel like a guided control system, not a raw command list.

It SHOULD provide:
- preflight checks;
- server scan;
- detected configuration summary;
- wizard/panel navigation;
- smart defaults;
- dependency-aware module selection;
- visual preview;
- blueprint tree;
- permission preview;
- risk classification;
- execution plan;
- dry run;
- approval boundaries;
- actual progress;
- completion report;
- repair recommendations;
- rollback/recovery path.

## 17. No Silent Scope Reduction

A requirement is not complete merely because a file, command, table, panel, or class exists.

No feature may be marked `VERIFIED` without applicable evidence across implementation, integration, error paths, authorization, persistence, logging, tests, security, performance, documentation and recovery.

## 18. Canon Conflict Handling

When uncertain:
1. inspect Canon;
2. inspect Registry;
3. inspect Decisions;
4. inspect Code and tests;
5. if still unresolved, mark `UNKNOWN` or `CONFLICT`;
6. do not guess.

If previously implemented code violates Canon, the project must schedule correction back to Canon-compliant behavior and downgrade affected verification status as needed.

## 19. Canon Audit Gate

Before claiming a feature or release complete, audit:

CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION

The audit MUST check for:
- missing requirements;
- contradictions;
- scope reduction;
- placeholders;
- unwired modules;
- fake real-time behavior;
- duplicate resources;
- insecure shortcuts;
- missing recovery paths;
- untested migration/restore;
- UI/behavior inconsistent with Canon;
- undocumented blockers.

## 20. Production Maturity Canon

Use maturity levels:
- LEVEL 0 Prototype
- LEVEL 1 Functional
- LEVEL 2 Integrated
- LEVEL 3 Tested
- LEVEL 4 Hardened
- LEVEL 5 Production Ready

No component may be called production-ready solely because it runs.

## 21. Absolute Rule

THE PROJECT IS NOT DONE BECAUSE AN AI THINKS IT IS DONE.

It is complete only when Canon, Spec, Registry, Code, Tests, Integration, documentation, security, performance, recovery and verification evidence agree.

## 22. Zero-Cost Deployment Profile Canon (User-approved 2026-08-14)

The repository MUST include a GitHub-ready and Render Free-compatible deployment profile with zero mandatory infrastructure spend for development/hobby deployment.

- Primary free deployment target: GitHub source control + Render Free web service/static site.
- Durable free data/storage may use an external free-tier provider such as Supabase when Render Free persistence is insufficient.
- The architecture MUST remain portable to paid/always-on infrastructure without rewriting business logic.
- Free-tier platform limits (sleep, quota, expiry, storage, availability) MUST be documented honestly and MUST NOT be hidden behind keepalive hacks or fake production-readiness claims.
- Secrets MUST be supplied through deployment environment variables, never committed.

## 23. Breadth Expansion Canon (User-approved 2026-08-14)

Expansion is not limited to Gaming. The platform MUST continue expanding non-Gaming domains including community, creator, education, support, staff operations, moderation, security, onboarding, automation, analytics, integrations, accessibility, internationalization, backup/recovery, templates, panels, roles, voice, events, content workflows and operator tooling when additions are production-viable and Canon-compatible.


## 24. Server Fabric and UI V2 Canon (User-approved 2026-08-14)

The platform MUST treat Discord structure and presentation as one governed Server Fabric, not as a Gaming-only layout.

- `/setup` MUST remain the configuration center for categories, channels, roles, permissions, panels, media, modules, themes and vertical domains.
- Built-in blueprints MUST provide substantial non-Gaming breadth across community, knowledge, member services, partnerships, creator, education, business/support, trust/safety, automation, analytics/data, release/change, accessibility, internationalization, voice and operations where the selected footprint allows it.
- Managed roles MUST carry deterministic visual desired state (for example color, explicit hoist policy and safe mentionability defaults) in addition to hierarchy/permission policy, so drift can be scanned and repaired instead of relying on manual styling.
- Managed panel/message surfaces SHOULD use Discord Components V2 (`IS_COMPONENTS_V2`) with supported top-level components when the pinned Discord API/library supports the required behavior. Native modals remain native Discord modals.
- Platform-owned Discord interaction responses, managed operational/status messages and scheduled/background delivery SHOULD follow the same Components V2 visual contract unless a specific Discord capability requires another supported format. Any exception MUST be explicit in Registry/Known Issues and MUST NOT be falsely counted as V2 coverage.
- Legacy-to-V2 edits MUST clear incompatible legacy content/embed fields before applying the V2 flag, preserve stable managed-message identity when possible, and remain repair/rollback aware.
- The Dashboard MUST use the Command Bridge UI V2 design system with responsive/mobile behavior, keyboard-visible focus, reduced-motion handling and topology/health values derived from real source/runtime state rather than decorative fake metrics.
- Panel media MUST be generated/versioned into repository/storage paths and wired to the corresponding panels; users do not need asset previews pasted into chat unless requested.

## 25. Extreme Visual, Motion, 3D and Thai Presentation Canon (User-approved 2026-08-15)

The Phase 28 visual/system overhaul is a durable product law, not a preview-only redesign.

- Every platform-owned user-visible surface MUST use Thai as its source-of-truth presentation language: Discord panels/messages/buttons/modals/notifications/audit reasons, Dashboard copy/statuses/errors, managed resource descriptions and generated visual metadata. Exact API/provider/enum/key values MAY remain technical when operationally required, but they MUST be surrounded by clear Thai context and MUST NOT replace the Thai explanation.
- Static identity, motion identity and 3D identity MUST share one governed design language. Dashboard/web surfaces MAY use Canvas, CSS 3D, perspective, hologram/crystal depth, particles, parallax, orbit, ripple, energy and emoji motion; Discord-native surfaces MUST use only capabilities actually supported by Discord such as Components V2, media, role/channel presentation and rate-limit-aware message updates. The product MUST NOT claim arbitrary WebGL/Canvas/3D animation inside native Discord messages.
- Realtime visual feedback MUST be driven by actual emitted domain/runtime events or durable state evidence. Join, progression, ticket, security, status, community-event and job/setup/recovery feedback MUST NOT be advanced by decorative timers, fake percentages or fabricated success events.
- The realtime visual runtime MUST bind only to event names that actually exist in the event bus/runtime path, and event-to-effect mappings MUST be regression-tested so a renamed/missing event cannot silently fall back to misleading feedback.
- Motion MUST be bounded by an explicit performance governor: respect `prefers-reduced-motion`, pause or suppress ambient work while hidden, cap device-pixel-ratio/particle work, degrade visual tier on constrained devices or sustained low FPS, and preserve a responsive usable mobile layout.
- Generated media MUST be deterministic/governed by stable logical paths plus manifest evidence for byte size, SHA-256, dimensions and animation frame count where applicable. Low-quality or obsolete assets MUST be replaced rather than silently retained beside the new identity.
- User-facing failures MUST use stable Thai guidance plus a safe technical code/reference when useful. Raw backend exception text, stack detail, provider payloads or implementation internals MUST stay in server/operator logs and MUST NOT be echoed directly to Discord or Dashboard users.
- Visual, motion, emoji or 3D feedback MUST remain accessibility-aware and MUST never obscure operational truth, security severity, recovery evidence or actionable text.
- No visual/system expansion may weaken the absolute anti-gambling rule. Free-entry community rewards remain non-wagering and no casino, betting or stake-based mechanic may be introduced through themes, events, rewards or visual effects.

## 26. Production Reality, Digital Twin and Operations Intelligence Canon (User-approved continuation 2026-08-15)

Phase 29 extends the platform by increasing production truth and operator intelligence without creating a second control plane.

- The server Digital Twin MUST be derived from the same deterministic `/setup` scan/plan desired-state path used for real changes. It MUST remain read-only, preserve logical parent/module topology, distinguish Discord mutations from mapping-only adoption, surface conflicts before approval, and MUST NOT execute Discord writes or fabricate rollback/timing certainty.
- Operations Intelligence MUST synthesize only observable evidence from durable queues/outbox/inbox, component heartbeats, incidents, SLO/error-budget results, Discord readiness and realtime hub statistics. Missing evidence MUST fail closed to an explicit unknown/degraded state rather than a decorative healthy state.
- Event Replay MUST be a read-only evidence sandbox over durable event-outbox history plus bounded realtime history. It MUST de-duplicate event identity, expose ordering gaps/stale sequences, recursively redact secret-bearing fields, remain tenant-scoped and MUST NOT republish events, call Discord mutations or mutate the database.
- Realtime visual orchestration MUST prioritize operational meaning. Security/critical incident feedback MAY preempt lower-priority presentation; compatible same-domain bursts SHOULD merge under bounded particle/duration budgets; lower-priority decorative work MAY be suppressed while urgent evidence is active. Presentation scheduling MUST NOT mutate domain state.
- The adaptive visual performance governor MUST use sustained evidence/hysteresis before degrading/restoring tiers so a single noisy FPS sample cannot cause oscillation. Reduced-motion and hidden-page states remain immediate hard overrides.
- Recovery evidence presentation MUST derive from the existing backup/restore/approval/verification/drill chain and MUST fail closed. A backup status alone MUST NOT be presented as a verified restore; verification requires a linked SUCCEEDED restore run plus matching RESTORE_VERIFY/PASS evidence for the same backup hash/algorithm, while contradictory evidence MUST be surfaced explicitly.
- Phase 29 operator surfaces MUST keep Thai as presentation source-of-truth, including topology, health, replay and runtime component labels. Technical event IDs, correlation IDs, API/provider names and exact enum/key values MAY remain technical where operationally required.
- Phase 29 source/chaos gates MUST prove read-only boundaries, redaction, deterministic conflict blocking, realtime dedup/backpressure bounds, event replay ordering, visual priority semantics, particle/duration caps and performance-governor hysteresis.
- No Digital Twin, Operations Intelligence, replay, visual or chaos source evidence may upgrade release maturity by itself. Missing reviewed dependency lock, unexecuted migrations, unavailable approved Discord/DB/browser targets and deployment-specific performance/security evidence remain explicit blockers.
