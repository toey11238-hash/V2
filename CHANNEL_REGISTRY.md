# CHANNEL / CATEGORY REGISTRY

Status: logical blueprint catalog and native Text/Voice/Forum desired resources IMPLEMENTED/INTEGRATED; physical Discord IDs remain guild-specific stable mappings.

## Core families
- START HERE: welcome, announcements, rules, guide, FAQ, verification.
- COMMUNITY: general, introductions, media, memes, questions, off-topic, suggestions, feedback plus native Forum surfaces where blueprint-selected.
- IDENTITY: role, profile and notification centers.
- NEWS/UPDATES: news, changelog, patch notes, maintenance.
- SUPPORT: help, ticket, report, application and partnership centers.
- EVENTS: event center/chat/results and free-entry reward center.
- COMMUNITY PROGRAMS: community board, spotlights, goals, volunteers, ambassadors, polls and project forum.
- KNOWLEDGE BASE: knowledge center, guides, tutorials, resource directory, requests, updates and searchable forum.
- MEMBER SERVICES: service center, accessibility, language center, account help and member feedback.
- PARTNERSHIPS: public partner board/requests/updates/resources plus restricted partner review.
- MEDIA: screenshots, art, clips and videos.
- VOICE: text `voice-center` control surface plus general/gaming/chill/join-to-create/AFK and temporary voice ownership lifecycle.
- TRUST & SAFETY: security overview, permission review, anti-abuse, incident timeline, safety review and audit.
- AUTOMATION LAB: scheduler, rule engine, job monitor, dead-letter, event stream and webhook health.
- DATA OBSERVATORY: member/content/event/Gaming insights, recommendation review and data quality.
- RELEASE & CHANGE: change control, migration center, canary, release truth, deployment log and schema history.
- STAFF/SYSTEM/ARCHIVE: restricted coordination, alerts, moderation, logs, backup/repair/privacy/integrations/status and archive resources.

## Built-in topology snapshot
- Hybrid Standard v4: 138 logical resources = 29 roles / 16 categories / 84 text / 3 forum / 6 voice.
- Omni Premium v2: 316 logical resources = 79 roles / 28 categories / 183 text / 7 forum / 19 voice.
- Compact remains intentionally smaller; expanded rooms are selected by blueprint/profile rather than blindly creating the maximum topology for every guild.

## Gaming expansion
Gaming hub/news/chat/LFG/recruitment/coaching; competitive scrim/tournament/match/results; progression profile/quest/achievement/season/event; guides/clips/loadout/media; team/squad/tournament/coaching/streaming voice. Dynamic game-specific resources extend through configuration/adapters rather than new slash roots.

## Vertical profiles
Creator, Education, Business/Support, Organization Enterprise, Hybrid and Omni Premium extend the same stable resource model. Current built-in catalog has eight blueprints; guild-scoped custom blueprints use version/checksum/validation/publish status.

## Forum/Thread rules
Forum channels are native desired resources with tags/default archive/thread rate settings. Thread lifecycle is persisted from Gateway events. Time-based archive/cleanup belongs to scheduler policy rather than polling Discord as a fake event system.

## Canon invariants
- stable logical key, not mutable name, is identity;
- ownership is SYSTEM_OWNED/TEMPLATE_OWNED/USER_OWNED/LOCKED;
- visibility/overwrites must be explicit;
- setup/repair do not silently delete user-owned or retirement-candidate resources;
- high-risk permission/deletion work requires policy/approval/recovery.

## Server Fabric V3 channel/category additions
- `CAT_DISCOVERY`: `CH_MEMBER_DIRECTORY`, `CH_INTEREST_HUB`, `CH_MEET_PEOPLE`, `CH_COMMUNITY_CALENDAR`, `CH_MILESTONES`, `CH_AMA`, `CH_POLL_ARCHIVE`, `CH_DISCOVERY_FORUM`, `VC_SOCIAL_CAFE`.
- `CAT_MEMBER_CARE`: `CH_MEMBER_CARE`, `CH_ACCESSIBILITY_REQUESTS`, `CH_LANGUAGE_REQUESTS`, `CH_MEMBER_REQUESTS`, `CH_RETURNING_MEMBERS`, `CH_COMMUNITY_BOUNDARIES`, `CH_ONBOARDING_FEEDBACK`, restricted `CH_MEMBER_CARE_CASES`, `VC_QUIET_LOUNGE`.
- `CAT_PROJECT_LAB`: `CH_PROJECT_BOARD`, `CH_PROJECT_INTAKE`, `CH_HELP_WANTED`, `CH_PROJECT_SHOWCASE_COMMUNITY`, `CH_PEER_REVIEW`, `CH_PROJECT_UPDATES`, `CH_RESOURCE_EXCHANGE`, `CH_PROJECT_LAB_FORUM`, `VC_PROJECT_ROOM`.
- `CAT_EVENT_STUDIO`: `CH_EVENT_CALENDAR`, `CH_EVENT_PROPOSALS`, `CH_EVENT_REGISTRATION`, `CH_EVENT_CHECKIN`, `CH_EVENT_MEDIA`, `CH_EVENT_RECAPS`, restricted `CH_EVENT_HOST_DESK`, `CH_EVENT_FORUM`, `VC_TOWN_HALL`, `VC_WORKSHOP`.
- `CAT_CONTENT_STUDIO`: `CH_CONTENT_CALENDAR`, `CH_CONTENT_BRIEFS`, `CH_MEDIA_REVIEW`, `CH_PUBLISHING_QUEUE`, `CH_BRAND_ASSETS`, `CH_COMMUNITY_DIGEST`, `CH_CLIP_REVIEW`, `CH_CONTENT_REQUESTS`, `CH_CONTENT_FORUM`, `VC_CONTENT_ROOM`.
- `CAT_KNOWLEDGE_OPS` (staff): `CH_EDITORIAL_REVIEW`, `CH_DOC_OWNERSHIP`, `CH_DEPRECATION_QUEUE`, `CH_TRANSLATION_QUEUE`, `CH_ACCESSIBILITY_REVIEW`, `CH_KNOWLEDGE_ANALYTICS`, `CH_CONTENT_GOVERNANCE`.
- `CAT_MEMBER_OPS` (staff): `CH_MEMBER_ESCALATIONS`, `CH_ACCESS_REVIEWS`, `CH_SUPPORT_QUALITY`, `CH_PROGRAM_REVIEW`, `CH_VOLUNTEER_REVIEW`, `CH_ONBOARDING_HEALTH`, `CH_PARTNER_INTAKE`.
- `CAT_RELIABILITY_OPS` (staff): `CH_RUNTIME_HEALTH`, `CH_RATE_LIMIT_HEALTH`, `CH_SHARD_HEALTH`, `CH_PROVIDER_HEALTH`, `CH_BACKUP_HEALTH`, `CH_RESTORE_DRILLS`, `CH_RECOVERY_LOG`, `CH_CAPACITY_PLANNING`.

Current footprint after this extension: Hybrid Standard 200 desired resources; Omni Premium 407. UI V2 smoke enforces unique logical keys, module completeness and resource headroom.

## Phase 27 Visual Experience fabric
- `CAT_VISUAL_EXPERIENCE` — `88・VISUAL EXPERIENCE`, restricted staff visual control category.
- `CH_THEME_STUDIO` — theme/token/motion/density control surface.
- `CH_ASSET_GALLERY` — hashed static/animated media evidence.
- `CH_ROLE_GALLERY` — role palette/capability preview.
- `CH_SERVER_PULSE` — event-backed living Server Pulse panel.
- `CH_SCENE_PRESETS` — Calm/Balanced/Showcase/Live/Operations scene controls.
- `VC_VISUAL_PREVIEW` — visual/voice naming preview room; no automated audio or unsupported Discord animation claim.

These resources are stable logical identities and remain subject to normal `/setup` ownership, preview, mapping, lock and repair policy. Compact blueprints may intentionally omit the visual category rather than blindly creating maximum topology.
