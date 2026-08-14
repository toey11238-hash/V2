# PANEL REGISTRY

Source of implementation truth: `packages/panels/src/index.ts`. Physical Discord message/channel IDs are guild-specific and are recorded only after deployment.

Current catalog: **82 stable panel definitions**. Managed lifecycle supports publish/update/keep, content/schema hash/version history, health audit, missing-message repair, orphan detection, prior-version rollback and interaction routing where leaf actions exist. Real-guild E2E is still required before VERIFIED.

## Catalog
| Panel ID | Family | Target | Media |
|---|---|---|---|
| PANEL_WELCOME | ONBOARDING | CH_WELCOME | welcome.png + welcome-motion.gif |
| PANEL_RULES | ONBOARDING | CH_RULES | rules.png |
| PANEL_VERIFY | ONBOARDING | CH_VERIFY | verify.png + verify-motion.gif |
| PANEL_ROLES | IDENTITY | CH_ROLE_CENTER | roles.png |
| PANEL_NOTIFICATIONS | IDENTITY | CH_NOTIFICATION_CENTER | notifications.png |
| PANEL_TICKET | SUPPORT | CH_TICKET_CENTER | ticket.png + ticket-motion.gif |
| PANEL_APPLICATION | SUPPORT | CH_APPLICATION_CENTER | application.png |
| PANEL_REPORT | SUPPORT | CH_REPORT_CENTER | report.png + report-motion.gif |
| PANEL_SUGGESTION | SUPPORT | CH_SUGGESTIONS | suggestion.png |
| PANEL_ANNOUNCEMENT | EVENTS | CH_ANNOUNCEMENTS | announcement.png + announcement-motion.gif |
| PANEL_HELP | SUPPORT | CH_HELP | help.png |
| PANEL_SECURITY | OPERATIONS | CH_STAFF_ALERTS | security.png + security-motion.gif |
| PANEL_STATUS | OPERATIONS | CH_SERVER_STATUS | status.png + status-motion.gif |
| PANEL_STAFF | OPERATIONS | CH_STAFF_CENTER | staff.png |
| PANEL_MODERATION | OPERATIONS | CH_MOD_CENTER | moderation.png |
| PANEL_BACKUP | OPERATIONS | CH_BACKUP_CENTER | backup.png |
| PANEL_REPAIR | OPERATIONS | CH_REPAIR_CENTER | repair.png |
| PANEL_INTEGRATIONS | OPERATIONS | CH_INTEGRATION_CENTER | integrations.png |
| PANEL_PRIVACY | OPERATIONS | CH_PRIVACY_CENTER | privacy.png |
| PANEL_EVENT | EVENTS | CH_EVENT_CENTER | event.png |
| PANEL_GIVEAWAY | EVENTS | CH_GIVEAWAYS | giveaway.png |
| PANEL_GAMING_HUB | GAMING | CH_GAME_HUB | gaming-hub.png + gaming-hub-motion.gif |
| PANEL_LFG | GAMING | CH_LFG | lfg.png |
| PANEL_TEAM | GAMING | CH_RECRUITMENT | team-clan.png |
| PANEL_TOURNAMENT | GAMING | CH_COMPETITIVE | tournament.png + tournament-motion.gif |
| PANEL_PROFILE | GAMING | CH_PROFILE_CENTER | profile.png |
| PANEL_GAME_EVENT | GAMING | CH_GAME_EVENTS | game-event.png |
| PANEL_CREATOR | CREATOR | CH_CREATOR_ANNOUNCEMENTS | creator.png |
| PANEL_EDUCATION | EDUCATION | CH_RESOURCES | education.png |
| PANEL_BUSINESS | BUSINESS | CH_STORE_INFO | business.png |
| PANEL_SERVER_GUIDE | ONBOARDING | CH_SERVER_GUIDE | server-guide.png |
| PANEL_COMMUNITY_PROGRAMS | COMMUNITY | CH_COMMUNITY_BOARD | community-programs.png |
| PANEL_KNOWLEDGE | KNOWLEDGE | CH_KNOWLEDGE_CENTER | knowledge.png |
| PANEL_MEMBER_SERVICES | MEMBER_SERVICES | CH_MEMBER_SERVICES | member-services.png |
| PANEL_PARTNERSHIPS | PARTNERSHIPS | CH_PARTNERSHIP_BOARD | partnerships.png |
| PANEL_MEDIA_LAB | MEDIA | CH_SCREENSHOTS | media-lab.png |
| PANEL_VOICE_LOUNGE | COMMUNITY | CH_VOICE_CENTER | voice-lounge.png |
| PANEL_AUTOMATION_LAB | AUTOMATION | CH_SCHEDULER_CENTER | automation-lab.png |
| PANEL_TRUST_CENTER | TRUST | CH_SECURITY_OVERVIEW | trust-center.png + trust-center-motion.gif |
| PANEL_DATA_OBSERVATORY | ANALYTICS | CH_MEMBER_INSIGHTS | data-observatory.png |
| PANEL_CHANGE_CONTROL | CHANGE | CH_CHANGE_CONTROL | change-control.png |
| PANEL_ASSET_FABRIC | OPERATIONS | CH_ASSET_CENTER | asset-fabric.png |
| PANEL_GAME_KNOWLEDGE | GAMING | CH_GAME_GUIDES | game-knowledge.png |
| PANEL_CREATOR_NETWORK | CREATOR | CH_CREATOR_BRIEFS | creator-network.png |
| PANEL_LEARNING_PATHS | EDUCATION | CH_LEARNING_PATHS | learning-paths.png |
| PANEL_SERVICE_STATUS | BUSINESS | CH_SERVICE_STATUS | service-operations.png |
| PANEL_ACCESSIBILITY | MEMBER_SERVICES | CH_ACCESSIBILITY | accessibility-center.png |
| PANEL_LANGUAGE_CENTER | MEMBER_SERVICES | CH_LANGUAGE_CENTER | language-center.png |
| PANEL_VOLUNTEER_CENTER | COMMUNITY | CH_VOLUNTEER_CENTER | volunteer-center.png |
| PANEL_AMBASSADOR_CENTER | COMMUNITY | CH_AMBASSADOR_CENTER | ambassador-center.png |
| PANEL_TUTORIALS | KNOWLEDGE | CH_TUTORIALS | tutorial-library.png |
| PANEL_RESOURCE_DIRECTORY | KNOWLEDGE | CH_RESOURCE_DIRECTORY | resource-directory.png |
| PANEL_PERMISSION_REVIEW | TRUST | CH_PERMISSION_REVIEW | permission-review.png |
| PANEL_INCIDENT_TIMELINE | TRUST | CH_INCIDENT_TIMELINE | incident-timeline.png |
| PANEL_RECOMMENDATION_REVIEW | ANALYTICS | CH_RECOMMENDATION_REVIEW | recommendation-review.png |
| PANEL_DEPLOYMENT_LOG | CHANGE | CH_DEPLOYMENT_LOG | deployment-log.png |
| PANEL_PARTNER_REVIEW | PARTNERSHIPS | CH_PARTNER_REVIEW | partner-review.png |
| PANEL_CREATOR_ANALYTICS | CREATOR | CH_CREATOR_ANALYTICS | creator-analytics.png |
| PANEL_LEARNING_ANALYTICS | EDUCATION | CH_LEARNING_ANALYTICS | learning-analytics.png |
| PANEL_BUSINESS_ANALYTICS | BUSINESS | CH_BUSINESS_ANALYTICS | business-analytics.png |
| PANEL_CUSTOMER_SUCCESS | BUSINESS | CH_CUSTOMER_SUCCESS | customer-success.png |
| PANEL_KNOWN_ISSUES | BUSINESS | CH_KNOWN_ISSUES | known-issues.png |

## UI V2 message contract
- Managed panel messages are Components V2 messages: `IS_COMPONENTS_V2` + Container + Text Display + optional Media Gallery + Separator + Action Rows.
- All `/setup` interaction-message surfaces (wizard/config/status/preview/confirmation/results/errors) and current platform-owned domain/operator/recovery/ticket/gaming/moderation/workflow/scheduled delivery messages use the same Components V2 contract; modal forms remain native Discord modals.
- Legacy-to-V2 managed edits clear legacy content/embed fields and retain the V2 flag; rollback/repair edits the owned message instead of posting duplicates.
- Source/static guard rejects legacy `EmbedBuilder`, direct legacy interaction reply payloads and deprecated ephemeral defer syntax across the platform-owned Discord interaction and scheduled-delivery runtime; live-guild execution remains required before VERIFIED.

## Lifecycle invariants
- Stable `PANEL_*` plus stable `CH_*`/voice mapping; names are not identity.
- Matching managed message/hash => KEEP; changed managed content => UPDATE in place.
- Missing managed message => repair to the mapped channel and update registry.
- Health audit classifies healthy/missing mapping/missing channel/missing message/drifted/unregistered/orphan.
- Version history supports explicit previous-version rollback; rollback edits the managed message rather than posting an uncontrolled duplicate.
- USER_OWNED/LOCKED resource boundaries are preserved by surrounding setup/repair policy.
- Every leaf interaction must re-check guild/actor/resource context and never grant staff/privileged roles through self-service.

## Interaction breadth currently wired
Verification; safe self roles; notification topics/quiet hours; ticket lifecycle; applications; private reports; suggestions/votes; help; security/status/staff/moderation; backup/restore; repair/permission repair/panel history rollback; integration health; privacy/retention; events; free-entry rewards; Gaming profile/LFG/team/clan/recruitment create/browse/apply/private application review/close, tournament/scrim; Creator/Education/Business workflows. New schema-v2 informational/operations panels are managed presentation surfaces and do not imply leaf actions that are not implemented.

## Server Fabric V3 panel additions
| Panel ID | Family | Target | Media |
|---|---|---|---|
| PANEL_MEMBER_DIRECTORY | DISCOVERY | CH_MEMBER_DIRECTORY | member-directory.png |
| PANEL_INTEREST_HUB | DISCOVERY | CH_INTEREST_HUB | interest-hub.png |
| PANEL_COMMUNITY_CALENDAR | DISCOVERY | CH_COMMUNITY_CALENDAR | community-calendar.png |
| PANEL_MEMBER_CARE | MEMBER_CARE | CH_MEMBER_CARE | member-care.png + member-care-motion.gif |
| PANEL_ACCESSIBILITY_REQUESTS | MEMBER_CARE | CH_ACCESSIBILITY_REQUESTS | accessibility-requests.png |
| PANEL_PROJECT_LAB | PROJECT_LAB | CH_PROJECT_BOARD | project-lab.png + project-lab-motion.gif |
| PANEL_HELP_WANTED | PROJECT_LAB | CH_HELP_WANTED | help-wanted.png |
| PANEL_PROJECT_SHOWCASE | PROJECT_LAB | CH_PROJECT_SHOWCASE_COMMUNITY | project-showcase.png |
| PANEL_EVENT_STUDIO | EVENT_STUDIO | CH_EVENT_CALENDAR | event-studio.png + event-studio-motion.gif |
| PANEL_EVENT_REGISTRATION | EVENT_STUDIO | CH_EVENT_REGISTRATION | event-registration.png |
| PANEL_EVENT_RECAPS | EVENT_STUDIO | CH_EVENT_RECAPS | event-recaps.png |
| PANEL_CONTENT_STUDIO | CONTENT_STUDIO | CH_CONTENT_CALENDAR | content-studio.png + content-studio-motion.gif |
| PANEL_MEDIA_REVIEW | CONTENT_STUDIO | CH_MEDIA_REVIEW | media-review.png |
| PANEL_BRAND_ASSETS | CONTENT_STUDIO | CH_BRAND_ASSETS | brand-assets.png |
| PANEL_KNOWLEDGE_OPS | KNOWLEDGE_OPS | CH_EDITORIAL_REVIEW | knowledge-ops.png |
| PANEL_MEMBER_OPS | MEMBER_OPS | CH_MEMBER_ESCALATIONS | member-ops.png |
| PANEL_RELIABILITY_OPS | RELIABILITY_OPS | CH_RUNTIME_HEALTH | reliability-ops.png + reliability-ops-motion.gif |
| PANEL_CAPACITY_PLANNING | RELIABILITY_OPS | CH_CAPACITY_PLANNING | capacity-planning.png |
| PANEL_PROVIDER_HEALTH | RELIABILITY_OPS | CH_PROVIDER_HEALTH | provider-health.png |
| PANEL_RECOVERY_DRILLS | RELIABILITY_OPS | CH_RESTORE_DRILLS | recovery-drills.png |

Fabric action mapping includes bounded intake/list/review for Project/Member Care/Content/Event and reuses existing status/jobs/advisor/integration/backup/repair actions for operator panels.


## Phase 9 operational evidence panel actions
- `PANEL_INCIDENT_TIMELINE`: `incident:list`, `incident:create`, `incident:update`. Create/update are staff-only, guild-scoped and persist an incident timeline with correlation/audit evidence. `RESOLVED`/`CLOSED` require a substantive note and do not imply punitive member action.
- `PANEL_RECOVERY_DRILLS`: `drill:list`, `drill:plan`, `drill:update`, plus existing backup visibility. A drill cannot reach `PASSED` without required passing checks, zero failed checks and at least one evidence/artifact reference.
- `PANEL_CAPACITY_PLANNING`: Dashboard/operator capacity evidence uses the same advisory pressure model. It must not auto-delete resources or silently reduce a blueprint.

## Phase 10 operator panel changes
- `PANEL_AUTOMATION_LAB` schema v3/content v2 exposes durable rule runtime, resource budgets and jobs through safe Components V2 actions.
- `PANEL_CAPACITY_PLANNING` includes resource-budget evidence alongside advisor/queue health. These controls do not automatically shrink Server Fabric.


## Phase 14 privacy control lifecycle
- `PANEL_PRIVACY` schema/content version is 2/2. Actions cover scoped user export, active-hold listing, durable hold creation, hold-release request, retention preview/request, privacy-scoped approval and explicit execution.
- Hold release remains a separate two-operator CRITICAL workflow; the panel never treats a release request as release completion.

## Phase 15 audit-integrity operator status
- `PANEL_STATUS` content version is 5 and includes read-only `status:audit-integrity` evidence.
- The operator action verifies a bounded guild-scoped chain tail and reports health/coverage/head/check/recompute/hash-only/legacy/bypass/mismatch evidence without exposing raw audit payloads.
- This surface explicitly describes database tamper-evidence only; it is not external notarization or immutable WORM storage.

## Phase 16 backup evidence semantics
`PANEL_BACKUP` copy now distinguishes integrity-checked snapshot creation from demonstrated restore verification. Backup list surfaces durable lifecycle state; opening or creating a backup never implies `RESTORE_VERIFIED`.

## Phase 27 Total Visual Experience panels
| Panel ID | Family | Target | Media |
|---|---|---|---|
| PANEL_THEME_STUDIO | VISUAL | CH_THEME_STUDIO | theme-studio.png |
| PANEL_ASSET_GALLERY | VISUAL | CH_ASSET_GALLERY | asset-gallery.png |
| PANEL_ROLE_GALLERY | VISUAL | CH_ROLE_GALLERY | role-gallery.png |
| PANEL_SERVER_PULSE | VISUAL | CH_SERVER_PULSE | server-pulse.png + server-pulse-motion.gif + theme pulse media |
| PANEL_SCENE_PRESETS | VISUAL | CH_SCENE_PRESETS | scene-presets.png |

Current catalog: **87** managed definitions. Phase 27 panel rendering persists theme/motion/media/density/state/detail evidence and audit/repair uses the deployed render profile instead of defaulting to Command Bridge. `PANEL_SERVER_PULSE` and other mapped living panels update the existing owned message through durable event-backed state; they do not create per-event message spam.

## Phase 28 Thai source and realtime visual contract
- All **87** managed panel titles/descriptions are Thai at catalog source; all **119** action labels are Thai at source rather than patched by a renderer override.
- `PANEL_SERVER_PULSE` and other mapped living panels remain event-backed and update stable owned message identity; Phase 28 does not introduce per-event Discord message spam.
- Dashboard realtime 3D/particle/emoji effects are a separate supported web presentation layer over the same event evidence; they are not represented as native Discord Canvas/WebGL capability.
- Technical custom IDs/action keys remain stable and English where required by code/API contracts; only their user-facing presentation is localized.

## Phase 29 operator-surface note
- Phase 29 adds Dashboard Digital Twin, Operations Intelligence and Event Replay consoles only; it does **not** add a new Discord managed-panel identity or top-level slash command. Managed Discord panel count remains 87.
