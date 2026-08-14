# DECISIONS

Only approved or currently canonical project decisions belong here.

## DEC-001 - Master V2 remains baseline specification
- Date: 2026-08-14
- Status: ACCEPTED
- Decision: The user-provided V2 Master Prompt remains the baseline detailed specification and must not be silently reduced.

## DEC-002 - Maximum two top-level slash commands
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: The platform may expose no more than two top-level slash commands unless the user explicitly changes Canon.

## DEC-003 - `/setup` configures everything
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: `/setup` is the universal configuration/provisioning surface, including ALL Gaming systems and all other modules.

## DEC-004 - Gaming becomes a first-class domain
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Gaming must be expanded significantly beyond the baseline Master Spec with LFG, party, team, clan/guild, recruitment, scrim, tournament, match, profiles, XP, quests, achievements, voice, events, analytics, integrations and related production systems.

## DEC-005 - Canon System is the highest project authority
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: `CANON.md` is the project Source of Truth. Use CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION.

## DEC-006 - No conversational-memory dependency
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Project state must live in workspace files. AI memory/chat is supplemental only.

## DEC-007 - Real-time means real state, not fake progress
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Timers/countdowns can render at true 1-second resolution in dashboard/client contexts. Discord updates must remain rate-limit aware and must not fake per-second server state.

## DEC-008 - Automatic media/animation asset pipeline
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Architecture must support automatic generation, versioning, storage and deployment of static and animated assets. Assets should be wired directly into product surfaces; chat previews are optional, not required.

## DEC-009 - Premium visual/technology direction
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Product should pursue a premium/high-end visual system and modern production technology where technically justified and Discord-compatible.

## DEC-010 - No gambling/betting mechanics
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Gaming and tournament modules must remain non-wagering and must not implement gambling, betting or casino-style systems.

## DEC-011 - GitHub + Render Free deployment profile
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: The repository must ship with a zero-mandatory-cost GitHub/Render Free deployment profile. Free-tier limitations must be explicit; no keepalive circumvention or false 24/7 guarantee.

## DEC-012 - Begin implementation in this session after design gate refresh
- Date: 2026-08-14
- Status: ACCEPTED
- Decision: The user's current instruction explicitly starts implementation now. The agent must first refresh the architecture/design gate in the workspace, then may implement Phase 1 in the same session. Unimplemented Master Spec requirements remain mandatory and must stay tracked; implementation does not imply scope reduction.

## DEC-013 - Non-Gaming expansion is mandatory
- Date: 2026-08-14
- Status: ACCEPTED / CANONICAL
- Decision: Expansion must cover the full platform, not Gaming alone, including community/creator/education/support/moderation/security/automation/analytics/integrations/recovery/operator UX.

## DEC-014 - Native Forum and managed Thread resources
- Date: 2026-08-14
- Status: ACCEPTED
- Decision: Forum channels are first-class desired resources where Discord supports them. Thread lifecycle is event-driven and persisted; scheduler work is limited to time-based archive/cleanup policy.

## DEC-015 - Free-profile scheduled backup default
- Date: 2026-08-14
- Status: ACCEPTED
- Decision: Scheduled backup policy is configured through `/setup`. The zero-cost default is WEEKLY at a guild-local hour to limit free-tier resource consumption; admins may choose OFF or DAILY.

## DEC-016 - Safe migration/rebuild is non-destructive by default
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Template migration/rebuild reuses the setup planner, requires preview/hash and approval when risky, creates a PRE_MIGRATION backup, preserves USER_OWNED/LOCKED resources and never auto-deletes retirement candidates.

## DEC-017 - Community rewards are free-entry only
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Community reward/giveaway workflows may exist only when entry is free and contains no purchase, fee, wager, bet, casino or equivalent mechanic. Entries and draws are auditable and the platform does not provide gambling functionality.

## DEC-018 - AI hooks have a zero-cost safe default
- Date: 2026-08-14
- Status: ACCEPTED
- Decision: AI integration is provider-based, disabled from external providers by default, data-class/secret gated and auditable by hashes/metadata. The bundled `local-rules` provider is deterministic and requires no paid API; it is not represented as a generative model.

## DEC-019 - Third-party plugin execution requires real isolation
- Date: 2026-08-14
- Status: ACCEPTED
- Decision: Manifest/dependency validation is not a security sandbox. Untrusted third-party plugin execution stays denied until a verified OS/container isolation profile exists. Trusted built-ins may run in-process under explicit policy.

## DEC-020 - Governance capabilities remain under universal setup
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Feature flags/canary, AI hooks, backup schedule, custom blueprints, retention, approvals and related governance settings remain setup-managed modules under `/setup`; they do not create new top-level slash roots.

## DEC-021 - Shared cache is never authoritative
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: L1/L2 cache may reduce database/read pressure but loss or expiry must not change correctness. Canonical state remains PostgreSQL/Discord actual state as defined by the owning domain.

## DEC-022 - Event ordering is opt-in per durable stream
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: The platform must not pretend all Discord/events have a total order. Only events carrying source + aggregate key + monotonic sequence use durable stream heads; all effects still require idempotency/deduplication.

## DEC-023 - Maintenance is a policy envelope, not an authorization bypass
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Maintenance may suppress conflicting automations/structural writes according to guild policy while diagnostics/read paths remain available. It never weakens RBAC, approval, security or recovery requirements.

## DEC-024 - Growth mode is advisory until normal change approval
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: SMALL/STANDARD/LARGE/ENTERPRISE assessment and resource recommendation scores are evidence-based recommendations only. Structural changes must still pass normal setup/change preview and approval paths.

## DEC-025 - Gaming recruitment is private-by-default for applicant notes
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Recruitment posts may be publicly browsable within the guild, but application notes are visible only to the post owner or authorized server managers. Recruitment remains free community matching with no payment/wager semantics.

## DEC-026 - Canary rollback is manual and audited
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Rollout evidence may recommend intervention, but canary rollback remains an explicit authorized operator action that creates a new revision/history record. No hidden automatic destructive rollback is introduced.

## DEC-027 - Integration capability must be runtime-real
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: A persisted integration row does not prove that a provider is usable. Enabling an integration requires a matching registered runtime adapter; absent adapters return `ADAPTER_NOT_REGISTERED/UNAVAILABLE` rather than fabricated support. Health evidence must be sanitized before persistence/display.


## DEC-028 - Mutation rate-limit evidence is tenant scoped and privacy hashed
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Dashboard/API mutation limits use Guild/route/actor-or-IP SHA-256 subject keys. Durable windows carry explicit `guild_id`; raw actor/IP is not stored in the rate-limit record.

## DEC-029 - Vertical schedules self-heal from durable domain state
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Creator/Mentor/Business scheduling re-validates durable state at execution and periodically reconciles only missing deduplicated tasks. Existing CLAIMED/RUNNING task state is never reset by reconciliation.

## DEC-030 - Integration recovery uses single-probe HALF_OPEN state
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: External integration circuit breakers transition OPEN -> HALF_OPEN with a single concurrent probe, then CLOSED on success or OPEN on failure; this is resilience only and does not imply a provider adapter exists.

## DEC-031 - Signed inbound integration is registered-adapter-only
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Public webhook ingress is unavailable unless the runtime has a matching adapter and the Guild has enabled it. Secrets remain environment values referenced by an exact derived env name; raw secrets are not stored through Dashboard/API configuration.

## DEC-032 - Generic inbound events cannot impersonate internal event families
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: The built-in zero-cost generic HMAC adapter namespaces transformed events under `integration.generic.*`, persists them through the durable inbox and uses timestamp + delivery-ID replay protection. Provider-specific adapters still require their own current documented verification rules.

## DEC-033 - Release Truth is evidence, not a promotion override
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: CLI and Dashboard share one static release evaluator. A BLOCKED result must remain visible; even a future static PASS cannot replace real database, Discord, restore, deployment, load/security or accessibility integration gates.

## DEC-034 - Accessibility/i18n static smoke is not browser E2E
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Static checks protect focus/reduced-motion/mobile/lang/key-parity contracts early, but WCAG/browser/mobile/screen-reader and localization E2E remain separate completion requirements.

## DEC-035 - Public provider adapters are capability-truthful and zero-secret by default
Decision: bundled Riot Data Dragon, GitHub Releases and Discord Status adapters may be configured under `/setup` only through their registered public capabilities. No arbitrary URL execution or fabricated unsupported capability is introduced.
Rationale: preserve zero-mandatory-cost default, provider truth and secure egress boundaries.

## DEC-036 - Liveness, readiness and diagnostics are separate contracts
Decision: `/live` reports process liveness, `/ready` reports required dependency/runtime-loop readiness and may return 503, `/health` remains diagnostic detail. Render uses `/ready`.
Rationale: deployment health must not remain green merely because the HTTP process is alive while durable workers/database/Discord requirements are unavailable.

## DEC-037 - Exact direct pins do not replace a reviewed lockfile
Decision: direct dependency `latest` ranges are exact-pinned, but release remains blocked until a real generated/reviewed `package-lock.json` exists and dependency-backed gates pass. Do not fabricate a lockfile.
Rationale: pinning top-level metadata does not prove the transitive dependency graph or build compatibility.

## DEC-038 - Canary outcome guidance is review-only
Decision: outcome metrics may produce `REVIEW_EXPAND`, `REVIEW_HOLD`, `REVIEW_ROLLBACK` or insufficient-data guidance; the system must not automatically promote or rollback from metric comparison alone.
Rationale: preserve human approval/change-control boundaries and avoid destructive automation from incomplete telemetry.

## DEC-039 - Namespace evidence alone is not a plugin sandbox
Decision: successful user/network namespace isolation is insufficient to enable untrusted third-party plugins. Full filesystem/process/syscall/network isolation must be independently verified first.
Rationale: avoid overstating runtime security capability.

## DEC-040 - Managed Discord panel fabric uses Components V2
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Managed panel messages and platform-owned Discord interaction/status/background-delivery surfaces use Discord Components V2 (`IS_COMPONENTS_V2`) with Container/Text Display/Media Gallery/Separator/Action Row composition where supported. Native modals remain native. Static source coverage must not be confused with live-guild verification.
- Rationale: current Discord message components provide richer supported layout while preserving explicit API-limit awareness; V2 messages cannot mix legacy content/embed fields.

## DEC-041 - Server Fabric V2 expands non-Gaming structure by blueprint, not blind maximum provisioning
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Community Programs, Knowledge, Member Services, Partnerships, Trust & Safety, Automation Lab, Data Observatory, Release/Change, Creator, Education and Business structures are first-class desired resources. `/setup` selects the footprint by blueprint/profile; Compact stays small while Standard/Advanced/Omni progressively add breadth.
- Rationale: satisfy broad platform scope without creating every room/role in every guild or weakening safe desired-state planning.

## DEC-042 - Admission Control preserves safety and configured scope
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Admission Control may defer structural/provider/background/bulk work from evidence-backed pressure, but SAFETY/SUPPORT/DIAGNOSTIC remain protected. Capacity pressure never auto-deletes resources, shrinks the Server Fabric, weakens authorization, or blocks recovery. OBSERVE records would-defer without enforcement.
- Rationale: overload protection must preserve operability and user safety rather than trade them away for throughput.


## DEC-043 - Leaf traceability and current-state truth drift fail closed
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Generate deterministic leaf-level tracking for every Markdown bullet in Canon + Master Spec and reject stale generated coverage or stale current-state migration/checkpoint summaries in source-contract gates. Historical phase evidence remains historical and is not rewritten merely to match current counts.
- Rationale: Canon forbids conversational-memory dependency and silent scope loss; machine-checkable traceability/current-state consistency reduces continuation drift without fabricating integration evidence.


## DEC-044 - External AI requires dual opt-in and fixed egress
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: `local-rules` remains the default AI provider. Any external provider must be disabled by default, registered by code, enabled by server configuration with explicit capability/data-class allowlists and server-side secret, selected per guild through `/setup`, and permission-checked at execution. The initial OpenAI adapter uses a fixed Responses API endpoint with `store:false`, exposes no arbitrary URL/tool action, and rejects `SECRET` or secret-like input fields.
- Rationale: optional AI must not create hidden cost, uncontrolled egress, secret leakage, cross-guild activation or false action claims. Source contracts do not replace live provider/data-handling verification.


## DEC-045 - Durable legal holds invalidate retention approvals
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Legal holds are durable guild/data-class state with no automatic expiry. Hold creation and executed release increment a monotonic governance revision. Retention approvals bind that revision, a deterministic plan hash, a deterministic retention-policy selector hash and candidate-count ceilings; execution re-checks all three under a per-guild transaction lock and deletes atomically. Hold release is CRITICAL, requires two distinct non-requester approvers, and remains ACTIVE until explicitly executed.
- Rationale: destructive retention must fail closed when protection state or approved scope changes, and a release request must never silently weaken an active preservation obligation.

## DEC-046 - Audit integrity is database tamper-evidence, not external notarization
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: New audit writes use a per-scope versioned SHA-256 chain committed atomically with detailed audit content. Pre-chain records remain explicitly legacy; approved retention may delete detailed audit content while minimal integrity metadata remains for hash-only continuity. Ordinary integrity history mutation is rejected, but guild teardown may cascade tenant evidence. Operator surfaces must call this database tamper-evidence and must not claim WORM/external notarization.
- Rationale: detect accidental/ordinary history mutation and repository bypass without inventing historical proof, defeating retention requirements, creating orphan tenant records or overstating resistance to a privileged database administrator.

## DEC-047 - Backup integrity is not restore verification
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: checksum/storage round-trip evidence is `INTEGRITY_CHECKED`, not restore verification. New schema-v3 backups use canonical SHA-256; historical checksum-only `VERIFIED` rows become `LEGACY_UNPROVEN`. `RESTORE_VERIFIED` requires a linked `SUCCEEDED` restore run with successful post-apply verification, and restore approval binds the backup content hash/hash algorithm/current plan hash.
- Rationale: Canon explicitly forbids claiming backup/disaster recovery without verifiable restore behavior; approval must also become stale if either the selected backup content or restore plan changes.

## DEC-048 - Public Gaming news remains fixed-egress and zero-secret by default
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: The built-in Steam News adapter may use only the documented public `ISteamNews/GetNewsForApp/v2` endpoint through the fixed-host safe integration client. Guilds configure only App ID, bounded result size and cadence through `/setup`; no publisher key, arbitrary URL or secret-bearing public config is accepted. Supabase deployment truth is reported from server configuration without exposing elevated keys, with `SUPABASE_SECRET_KEY` preferred over legacy service-role keys.
- Rationale: complete the Canon game-news capability and zero-cost durable profile without creating secret sprawl, SSRF surface or false live-provider/SLA claims.

## DEC-049 - Third-party plugins require a target-proven kernel sandbox
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Untrusted JavaScript may execute only under the explicit `LINUX_NS_SECCOMP_V1` profile after the actual runtime host passes the hostile startup probe. The profile combines Linux user/mount/network/PID namespaces, a private read-only filesystem view, no host `/proc`, capability drop, raw-BPF seccomp and Node permissions. Sandbox evidence is recorded per execution. Host evidence does not transfer to another target, and V8 heap budgeting is not claimed as a hard RSS/cgroup boundary.
- Rationale: Canon requires verified filesystem/process/syscall isolation before third-party execution. A network namespace or caller-supplied “verified” flag alone is insufficient; conversely, a kernel-enforced, fail-closed target probe can satisfy the source execution boundary without inventing Docker/bwrap availability.

## DEC-050 - Lock bootstrap is review-only; locked install promotion follows reviewed evidence
Decision: The first generated `package-lock.json` must be produced without lifecycle scripts, evaluated for exact root parity, approved registry/integrity evidence and install-script inventory, then reviewed before commit. Dependency-backed CI uses `npm ci` and Docker/Render are promoted to `npm ci` only after the reviewed lock exists. Release Truth must fail if a committed/present lock coexists with an unlocked deployment install surface.
Rationale: Exact direct pins do not freeze the transitive graph. Running lifecycle scripts before reviewing that graph expands supply-chain risk, while switching deployment commands before a real lock exists would make the current artifact unusable without improving evidence.

## DEC-051 - Release syntax evidence requires the TypeScript parser
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: TypeScript source syntax evidence must come from the TypeScript compiler parser. Node experimental type stripping/checking may be used as a runtime compatibility aid but is not accepted as the sole syntax gate. Release enforcement parses all TypeScript-family source before Release Truth enforcement; dependency-backed CI uses the project-pinned compiler after reviewed `npm ci`. A global compiler fallback is allowed only for offline diagnostic/source preflight and cannot satisfy QA-003.
- Rationale: Phase 20 reproduced an unterminated single-quoted string that TypeScript rejected while Node strip-types `--check` returned success. The release path must fail on the parser that defines the project language semantics rather than on a weaker approximation.

## DEC-052 - Git-labelled release evidence hashes committed blobs, never dirty working-tree bytes
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Any release manifest/provenance record that names `HEAD`/commit/tree identity must derive source, migration, registry and managed-asset hashes from Git objects reachable from that commit. `--allow-dirty` is inspection-only and may report dirty state, but cannot substitute working-tree bytes or untracked lockfiles into committed evidence. Generated artifacts such as SBOM remain separately labelled generated evidence.
- Rationale: binding a clean commit identifier to mutable filesystem bytes creates ambiguous provenance and can make review evidence describe material that was never committed. Commit identity and hashed source material must refer to the same immutable Git tree.

## DEC-053 - External GitHub Actions use reviewed immutable commit identities
Status: ACCEPTED
Decision: Every repository workflow external `uses:` reference is admitted through `config/github-actions-policy.json` and pinned to an exact reviewed 40-character commit SHA with an adjacent human version annotation. `actions/checkout` must set `persist-credentials: false`; workflows require explicit permissions; `write-all`, `pull_request_target`, dynamic refs and unreviewed Docker actions fail closed. The same evaluator is part of Release Truth.
Reason: mutable marketplace tags/branches and persisted checkout credentials expand the CI supply-chain trust surface and can change execution without a source diff. Immutable reviewed identities plus minimum token exposure make workflow execution evidence reproducible and machine-checkable.
Boundary: this policy does not replace code review/branch protection, npm dependency admission, QA-003, or live deployment evidence. Future pin upgrades require review and an explicit policy-file diff.

## 2026-08-14 — Phase 23 experience/orchestration expansion
- Keep top-level slash roots unchanged; scheduled Gaming sessions are enabled through `/setup` module `game-sessions` and existing Components V2 surfaces.
- Treat member weekly Gaming availability as private scheduling data. Store it durably, but expose raw windows only to the owning member flow; audit/operational evidence stores bounded counts and timezone/game metadata rather than raw schedules.
- Reuse existing Scheduler + notification fanout for session notices/reminders instead of introducing a second scheduling subsystem.
- Automation dry-run is strictly read-only simulation of the persisted rule; it must not enqueue actions or write success/execution evidence.
- Setup impact and Change Control risk share one deterministic impact primitive to avoid conflicting operator guidance.

## DEC-054 - Gaming session reliability uses bounded FIFO waitlists and real-time check-in windows
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Scheduled Gaming sessions use row-locked bounded admission. When joined capacity is full, eligible members enter a bounded FIFO waitlist; leaving an OPEN/READY session promotes earliest waitlisted members atomically. Waitlisted registration does not award joined-session progression. Check-in is permitted only inside a bounded window around the real scheduled timestamp. Raw availability remains private and common-time suggestions are computed only within one explicit timezone cohort.
- Rationale: this completes Canon check-in/waitlist coordination without over-capacity races, progression farming, fake time semantics, or cross-timezone scheduling errors.

## DEC-055 - Operational SLO and automation lint evidence remain advisory
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Runtime analytics may calculate bounded error-budget health from measurable good/total outcomes, but low-sample states remain UNKNOWN and SLO evidence does not claim an external production SLA. Automation dry-run may emit deterministic safety lint, but lint/simulation cannot execute actions, alter rule enablement, or fabricate durable success evidence.
- Rationale: operators need stronger evidence before action without turning heuristics into hidden automation or false production claims.

## DEC-056 - Final source delivery uses an exact toolchain contract and truthful source attestation
- Date: 2026-08-14
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: The reviewed source toolchain is pinned to Node 22.16.0, npm 10.9.2 and project TypeScript 7.0.2 across package metadata, local version files, GitHub setup-node and Docker. Render build commands must execute the dependency-free runtime toolchain guard before dependency installation. The final workspace attestation may claim `SOURCE_ATTESTED` after source preflight passes, but it must carry Release Truth blockers and may not claim production/commit/live verification when those evidence classes are absent.
- Rationale: mutable runtime minor/patch selection can change parser/runtime/install behavior without a source change, while a generic "final" artifact can easily overstate maturity. Exact toolchain drift detection plus explicitly bounded attestation produces a restartable handoff without weakening QA-003 or live gates.

## 2026-08-14 — Phase 26 final stabilization
- Treat `/setup` as a desired-state reconciler, not an add-only wizard. Existing guilds reopen from persisted current state; managed runtime state is reconciled on both enable and disable paths.
- Use `runtime/setup-state.ts` as the shared setup truth projection for Discord, Dashboard and portable config to prevent independent projections from silently resetting fields.
- Bind setup approvals to full desired configuration plus base config version/fingerprint and managed-panel evidence; use a 24-hex / 96-bit SHA-256 approval identity across Discord and Change Control.
- Treat configuration impact separately from structural Discord-resource impact and use the higher risk for Change Control approval decisions.
- Commit `guild_configs` only after dependent setup-managed DB/scheduler subsystems reconcile, then reload/fingerprint the resulting desired state before reporting success.
- Preserve QA-003 as BLOCKED; Phase 26 source/configuration hardening does not substitute for a reviewed dependency graph or live verification.

## 2026-08-14 — Phase 27 Total Visual Experience
- Adopt **Omni Command Nexus** as the shared visual identity and use **Server Pulse** as the single signature motion system rather than scattering animation across unrelated surfaces.
- Keep all visual configuration under `/setup`; scene presets compose existing theme/motion/density/channel/role/media settings and do not consume the reserved second top-level command slot.
- Treat motion as event/state feedback, never progress simulation. Durable living-panel state is driven only by emitted runtime events and is coalesced before Discord edits.
- Use a 15-second ordinary product coalescing window with shorter urgent incident/recovery windows as an internal workload policy, not as an assumption about Discord's dynamic rate-limit buckets.
- Generate a static and animated pulse asset for every supported state in every theme so CINEMATIC mode cannot request a missing media variant.
- Apply enhanced role colors/icons only when guild capabilities expose them; otherwise normalize desired/actual state to a stable fallback instead of creating perpetual repair drift.
- Keep migration 054 and all Discord/deployed visual behavior unverified until approved live-target evidence exists.

## DEC-057 - Phase 29 reuses canonical evidence paths instead of creating parallel control planes
- Date: 2026-08-15
- Status: ACCEPTED / CANON-COMPATIBLE
- Decision: Digital Twin must derive from the existing setup plan and remain read-only; Operations Intelligence must synthesize existing durable/runtime evidence without automatic remediation; Event Replay must consume existing outbox/realtime evidence with redaction and no republish/mutation edge; visual priority scheduling remains presentation-only. No Phase 29 database migration is added merely to duplicate evidence already present in migration 054-and-earlier state.
- Rationale: the project already has deep setup, event, diagnostics and recovery primitives. Reusing those authoritative paths increases production truth and debuggability while avoiding divergent planners, duplicate event stores, hidden automation and false operational certainty.
