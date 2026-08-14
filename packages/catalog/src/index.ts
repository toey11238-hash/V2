export type ModuleDomain = 'FOUNDATION' | 'COMMUNITY' | 'GAMING' | 'SUPPORT' | 'OPERATIONS' | 'SECURITY' | 'CONTENT' | 'GROWTH' | 'INTEGRATIONS';
export type ModuleMaturity = 'FOUNDATION' | 'DESIGNED' | 'IMPLEMENTED' | 'INTEGRATED' | 'VERIFIED';

export interface PlatformModuleDescriptor {
  key: string;
  label: string;
  domain: ModuleDomain;
  description: string;
  dependencies: string[];
  setupManaged: boolean;
  featureFlag: boolean;
  maturity: ModuleMaturity;
}

const module = (descriptor: PlatformModuleDescriptor): PlatformModuleDescriptor => descriptor;

export const platformModules: readonly PlatformModuleDescriptor[] = [
  module({ key: 'scanner', label: 'Smart Server Scanner', domain: 'FOUNDATION', description: 'Discovers Discord resources and ownership mappings.', dependencies: [], setupManaged: true, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'planner', label: 'Desired-State Planner', domain: 'FOUNDATION', description: 'Builds CREATE/ADOPT/KEEP/UPDATE/SKIP/CONFLICT plans.', dependencies: ['scanner'], setupManaged: true, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'panels', label: 'Panel Engine', domain: 'FOUNDATION', description: 'Versioned interactive system messages, managed deployment, assets and repair metadata.', dependencies: ['scanner'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'realtime', label: 'Real-Time Engine', domain: 'FOUNDATION', description: 'Event-backed state fanout to dashboard clients.', dependencies: [], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'assets', label: 'Asset & Motion Pipeline', domain: 'CONTENT', description: 'Static and animated asset rendering with storage abstraction.', dependencies: [], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'onboarding', label: 'Welcome & Onboarding Journey', domain: 'COMMUNITY', description: 'Member arrival, first-run guidance and onboarding state.', dependencies: ['panels'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'verification', label: 'Verification', domain: 'COMMUNITY', description: 'Policy-based verification, role transition and persistence.', dependencies: ['panels'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'roles', label: 'Identity & Self Roles', domain: 'COMMUNITY', description: 'Stable role identities, safe self-role preferences and temporary-role policy.', dependencies: ['panels'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'notifications', label: 'Notification Preferences', domain: 'COMMUNITY', description: 'Per-user topics and quiet-hour preferences.', dependencies: ['roles'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'forums', label: 'Forum & Thread Fabric', domain: 'COMMUNITY', description: 'Native Discord forum channels with managed thread lifecycle, audit state and archive-aware tracking.', dependencies: ['roles'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'tickets', label: 'Ticket & Support Center', domain: 'SUPPORT', description: 'Private support lifecycle, claim, SLA-ready state and archive.', dependencies: ['panels'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'applications', label: 'Application Center', domain: 'SUPPORT', description: 'Persisted forms with auditable review state transitions.', dependencies: ['panels'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'suggestions', label: 'Suggestion Center', domain: 'COMMUNITY', description: 'Persisted community suggestions with mutually-exclusive idempotent voting.', dependencies: ['panels'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'reports', label: 'Private Report Center', domain: 'SECURITY', description: 'Privacy-scoped persisted reports with restricted intake and auditable references.', dependencies: ['tickets'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'moderation', label: 'Moderation', domain: 'SECURITY', description: 'Policy-guarded moderation actions and case audit.', dependencies: ['reports'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'security', label: 'Security Center', domain: 'SECURITY', description: 'Permission audit, anti-abuse signals and tiered response.', dependencies: ['moderation'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'events', label: 'Event Center', domain: 'COMMUNITY', description: 'Registration, waitlist, check-in, reminders and archive.', dependencies: ['scheduler'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'giveaways', label: 'Free-entry Giveaways', domain: 'COMMUNITY', description: 'No-purchase, non-wagering giveaways with idempotent entry and auditable draws.', dependencies: ['events'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'scheduler', label: 'Scheduler & Reminder Engine', domain: 'OPERATIONS', description: 'Durable timezone-aware scheduled work and deduplication.', dependencies: [], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'automation', label: 'Event Automation Rules', domain: 'OPERATIONS', description: 'Validated event-condition-action automation rules.', dependencies: ['realtime'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'voice', label: 'Temporary Voice', domain: 'COMMUNITY', description: 'Join-to-create lifecycle and safe empty-room cleanup.', dependencies: ['automation'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'backup', label: 'Backup & Restore', domain: 'OPERATIONS', description: 'Versioned snapshots, checksum validation and restore planning.', dependencies: ['assets'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'repair', label: 'Repair & Drift', domain: 'OPERATIONS', description: 'Desired-vs-actual drift classification, policy decisions and safe repair planning.', dependencies: ['scanner', 'planner', 'backup'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'diagnostics', label: 'Diagnostics & Health', domain: 'OPERATIONS', description: 'Cross-component health aggregation and diagnostics.', dependencies: ['realtime'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'digital-twin', label: 'ฝาแฝดจำลองเซิร์ฟเวอร์', domain: 'OPERATIONS', description: 'แผนผังสถานะจริงเทียบเป้าหมายและผลกระทบแบบอ่านอย่างเดียวก่อนเปลี่ยนการตั้งค่าที่ควบคุมไว้', dependencies: ['planner','change-control'], setupManaged: false, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'operations-intelligence', label: 'ข่าวกรองปฏิบัติการ', domain: 'OPERATIONS', description: 'สังเคราะห์สุขภาพคิว SLO ข้อมูลสด เหตุผิดปกติ และองค์ประกอบจากหลักฐานจริง', dependencies: ['diagnostics','analytics','realtime'], setupManaged: false, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'event-replay', label: 'เล่นเหตุการณ์ย้อนหลัง', domain: 'OPERATIONS', description: 'เล่นหลักฐานเหตุการณ์ถาวรและข้อมูลสดย้อนหลังแบบอ่านอย่างเดียว พร้อมปกปิดข้อมูลลับและตรวจลำดับเหตุการณ์', dependencies: ['realtime'], setupManaged: false, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'analytics', label: 'Analytics', domain: 'GROWTH', description: 'Privacy-conscious aggregated operational/product metrics.', dependencies: ['realtime'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'recommendations', label: 'Server Advisor', domain: 'GROWTH', description: 'Evidence-backed non-destructive recommendations by default.', dependencies: ['analytics'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'integrations', label: 'Integration Hub', domain: 'INTEGRATIONS', description: 'Capability-based adapters, webhook replay protection and health.', dependencies: ['security'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'gaming', label: 'Gaming Platform', domain: 'GAMING', description: 'First-class multi-game kernel and game-specific modules.', dependencies: ['events', 'voice', 'notifications'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'lfg', label: 'LFG / Party Finder', domain: 'GAMING', description: 'Stateful non-wagering player/group discovery.', dependencies: ['gaming'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'teams', label: 'Teams', domain: 'GAMING', description: 'Roster, captain and recruitment foundations.', dependencies: ['gaming'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'clans', label: 'Clans / Guilds', domain: 'GAMING', description: 'Clan/guild roster, leadership, private resource and recruitment foundations.', dependencies: ['gaming'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'scrims', label: 'Scrims', domain: 'GAMING', description: 'Non-wagering scrim scheduling and validation.', dependencies: ['gaming','teams'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'matches', label: 'Match Operations', domain: 'GAMING', description: 'Match readiness, results, validation and dispute lifecycle.', dependencies: ['gaming','teams'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'tournaments', label: 'Competitive Events', domain: 'GAMING', description: 'Non-wagering tournament and match state machines.', dependencies: ['gaming', 'events'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'progression', label: 'XP / Levels / Seasons', domain: 'GAMING', description: 'Event-backed progression primitives with anti-abuse hooks.', dependencies: ['gaming', 'analytics'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'quests', label: 'Quests / Missions', domain: 'GAMING', description: 'Daily, weekly, event and community mission progress from real events.', dependencies: ['progression'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'achievements', label: 'Achievements / Badges', domain: 'GAMING', description: 'Auditable achievement and badge qualification.', dependencies: ['progression'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'game-integrations', label: 'Game API Adapters', domain: 'GAMING', description: 'Capability-aware identity/stats/rank/news/status adapters.', dependencies: ['gaming', 'integrations'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'creator', label: 'Creator Studio', domain: 'CONTENT', description: 'Creator identity, publishing and collaboration surfaces.', dependencies: ['panels','assets'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'live-integrations', label: 'Live Status Integrations', domain: 'INTEGRATIONS', description: 'Capability-driven live/stream status adapters.', dependencies: ['creator','integrations'], setupManaged: true, featureFlag: true, maturity: 'DESIGNED' }),
  module({ key: 'content-workflows', label: 'Content Workflows', domain: 'CONTENT', description: 'Draft, review, publish and archive content lifecycle.', dependencies: ['creator'], setupManaged: true, featureFlag: true, maturity: 'DESIGNED' }),
  module({ key: 'education', label: 'Education Hub', domain: 'COMMUNITY', description: 'Study resources, questions, mentor and focus spaces.', dependencies: ['scheduler','voice'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'reminders', label: 'Reminder Center', domain: 'OPERATIONS', description: 'Deduplicated event/study reminders.', dependencies: ['scheduler'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'mentor', label: 'Mentor Workflow', domain: 'SUPPORT', description: 'Mentor requests and guided help sessions.', dependencies: ['education','tickets'], setupManaged: true, featureFlag: true, maturity: 'DESIGNED' }),
  module({ key: 'business', label: 'Business Hub', domain: 'COMMUNITY', description: 'Business information and customer community surfaces without payment-secret storage.', dependencies: ['tickets'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'order-support', label: 'Order Support', domain: 'SUPPORT', description: 'Support workflows linked to external order references only.', dependencies: ['business','tickets'], setupManaged: true, featureFlag: true, maturity: 'DESIGNED' }),
  module({ key: 'partnerships', label: 'Partnership Center', domain: 'SUPPORT', description: 'Partner application, review and collaboration workflows.', dependencies: ['applications'], setupManaged: true, featureFlag: true, maturity: 'DESIGNED' }),
  module({ key: 'approvals', label: 'Approval Workflow', domain: 'OPERATIONS', description: 'Human approval boundaries for risky and critical changes.', dependencies: ['security'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'maintenance', label: 'Maintenance Mode', domain: 'OPERATIONS', description: 'Suppresses conflicting automations during controlled maintenance.', dependencies: ['automation'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'change-control', label: 'Change Control', domain: 'OPERATIONS', description: 'Risk classification, portable configuration and approval gates for enterprise changes.', dependencies: ['approvals','backup'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'feature-flags', label: 'Feature Flags & Canary', domain: 'OPERATIONS', description: 'Stable global/guild/role/environment rollout rules with deterministic canary bucketing.', dependencies: ['change-control'], setupManaged: true, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'ai-hooks', label: 'AI Assistant Hooks', domain: 'INTEGRATIONS', description: 'Permissioned provider adapters with secret/data-class gates; bundled local-rules provider has zero mandatory API cost.', dependencies: ['privacy','security'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'retention', label: 'Retention & Archive', domain: 'OPERATIONS', description: 'Policy-driven retention decisions, legal-hold boundaries and archive lifecycle primitives.', dependencies: ['scheduler'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'localization', label: 'Localization', domain: 'FOUNDATION', description: 'Thai/English translation keys, locale resolution and date/number formatting.', dependencies: [], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'privacy', label: 'Privacy Controls', domain: 'SECURITY', description: 'Guild-scoped retention/export primitives with secret exclusion and data-minimization policy.', dependencies: ['retention','security'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'plugins', label: 'Plugin Runtime', domain: 'INTEGRATIONS', description: 'Manifest validation, dependency/permission declaration and deterministic lifecycle hooks.', dependencies: ['security'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'import-export', label: 'Import / Export', domain: 'OPERATIONS', description: 'Versioned portable configuration envelopes with checksum validation.', dependencies: ['backup','change-control'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'cache', label: 'Shared Cache', domain: 'FOUNDATION', description: 'Non-authoritative L1/L2 cache with TTL, invalidation and database-backed multi-worker sharing.', dependencies: [], setupManaged: true, featureFlag: false, maturity: 'IMPLEMENTED' }),
  module({ key: 'compatibility', label: 'Compatibility Guard', domain: 'OPERATIONS', description: 'Runtime/library/schema compatibility checks and staged upgrade planning.', dependencies: ['diagnostics'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'growth-mode', label: 'Growth Mode Advisor', domain: 'GROWTH', description: 'Evidence-backed SMALL/STANDARD/LARGE/ENTERPRISE capacity assessment and channel/role recommendation scoring.', dependencies: ['analytics','recommendations'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
  module({ key: 'documentation', label: 'Documentation Generator', domain: 'OPERATIONS', description: 'Generates human-readable repository/operator and blueprint references without claiming verification.', dependencies: ['diagnostics'], setupManaged: true, featureFlag: true, maturity: 'IMPLEMENTED' }),
] as const;

export const setupModulePacks = {
  all: platformModules.filter((item) => item.setupManaged).map((item) => item.key),
  community: platformModules.filter((item) => ['FOUNDATION','COMMUNITY','SUPPORT','OPERATIONS','SECURITY','CONTENT'].includes(item.domain)).map((item) => item.key),
  gaming: platformModules.filter((item) => ['FOUNDATION','COMMUNITY','GAMING','SUPPORT','OPERATIONS','SECURITY','CONTENT','INTEGRATIONS'].includes(item.domain)).map((item) => item.key),
  creator: platformModules.filter((item) => ['FOUNDATION','COMMUNITY','SUPPORT','OPERATIONS','SECURITY','CONTENT','GROWTH','INTEGRATIONS'].includes(item.domain)).map((item) => item.key),
  education: platformModules.filter((item) => ['FOUNDATION','COMMUNITY','SUPPORT','OPERATIONS','SECURITY','CONTENT'].includes(item.domain)).map((item) => item.key),
} as const;

export function validateModuleSelection(keys: readonly string[]): { valid: string[]; unknown: string[]; missingDependencies: Array<{ module: string; dependency: string }> } {
  const known = new Map(platformModules.map((item) => [item.key, item]));
  const valid = [...new Set(keys.filter((key) => known.has(key)))];
  const unknown = [...new Set(keys.filter((key) => !known.has(key)))];
  const selected = new Set(valid);
  const missingDependencies: Array<{ module: string; dependency: string }> = [];
  for (const key of valid) {
    for (const dependency of known.get(key)!.dependencies) if (!selected.has(dependency)) missingDependencies.push({ module: key, dependency });
  }
  return { valid, unknown, missingDependencies };
}
