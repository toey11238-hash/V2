import { describe, expect, it } from 'vitest';
import { defaultSetupDraft, enabledModulesForDraft, patchSetupDraft } from '@autoserver/control-center';
import { resolveLocale, t } from '@autoserver/localization';
import { evaluateVerification, transitionOnboarding } from '@autoserver/community';
import { evaluateSelfRole, classifyRoleRisk } from '@autoserver/roles';
import { approveRequest, resolveFeatureFlag, operationAllowed } from '@autoserver/operations';
import { buildRepairPlan, classifyRepairRisk } from '@autoserver/repair';
import { normalizeSuggestionVote, transitionAnnouncement, transitionApplication, transitionReport } from '@autoserver/workflows';
import { classifyChangeRisk, createDataExportRequest, createPortableConfig, evaluateRetention, requiresApproval, validatePortableConfig } from '@autoserver/governance';
import { PluginRuntimeRegistry, validatePluginManifest } from '@autoserver/plugins';

describe('durable setup control center', () => {
  it('expands full-platform preset across gaming and non-gaming systems', () => {
    const draft = defaultSetupDraft('hybrid-standard');
    const enabled = enabledModulesForDraft([], draft);
    expect(enabled).toContain('tickets');
    expect(enabled).toContain('security');
    expect(enabled).toContain('creator');
    expect(enabled).toContain('education');
    expect(enabled).toContain('business');
  });

  it('patches preferences without discarding the rest of the durable draft', () => {
    const draft = defaultSetupDraft('gaming-advanced');
    const patched = patchSetupDraft(draft, { themeKey: 'royal-signal', gamingPreset: 'FULL' });
    expect(patched.blueprintKey).toBe(draft.blueprintKey);
    expect(patched.themeKey).toBe('royal-signal');
    expect(patched.gamingPreset).toBe('FULL');
  });
});

describe('localization and onboarding', () => {
  it('falls back to the configured locale deterministically', () => {
    expect(resolveLocale('th')).toBe('th');
    expect(resolveLocale('en')).toBe('th');
    expect(resolveLocale('th-TH')).toBe('th');
    expect(t('th', 'panel.verify.title')).toBeTruthy();
  });

  it('rejects invalid onboarding state regressions', () => {
    expect(() => transitionOnboarding({ stage: 'ACTIVE', joinedAt: '2026-08-14T00:00:00Z' }, 'NEW')).toThrow();
  });

  it('enforces verification cooldown and anti-abuse policy', () => {
    const decision = evaluateVerification({
      history: { attemptedAt: [1_000, 2_000, 3_000, 4_000] },
      now: 5_000,
      policy: { maxAttemptsPerWindow: 4, cooldownMs: 30_000, windowMs: 60_000 },
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('COOLDOWN');
  });
});

describe('role, approval and maintenance safety', () => {
  it('never permits privileged roles through self-role surfaces', () => {
    expect(classifyRoleRisk({ staff: false, permissions: ['Administrator'] })).toBe('PRIVILEGED');
    const decision = evaluateSelfRole('ROLE_STAFF', {
      verified: true,
      isStaff: false,
      existingRoleKeys: [],
      policies: [{ roleKey: 'ROLE_STAFF', risk: 'STAFF', requiresVerified: true, removableByMember: false }],
    });
    expect(decision.allowed).toBe(false);
  });

  it('requires a different approver for critical changes', () => {
    const request = { state: 'PENDING' as const, risk: 'CRITICAL' as const, requestedBy: 'admin-a', requiredApprovals: 1, approvedBy: [] };
    expect(() => approveRequest(request, 'admin-a')).toThrow();
    expect(approveRequest(request, 'admin-b').state).toBe('APPROVED');
  });

  it('resolves feature-flag precedence and blocks mutation in maintenance', () => {
    expect(resolveFeatureFlag([
      { key: 'feature-x', value: true, scope: 'GLOBAL', priority: 10 },
      { key: 'feature-x', value: false, scope: 'GUILD', priority: 100 },
    ])).toBe(false);
    expect(operationAllowed({ enabled: true, allowSetup: false, allowRepair: true, allowMemberAutomation: false }, 'SETUP')).toBe(false);
  });
});

describe('repair safety', () => {
  const policy = { lowRisk: 'AUTO' as const, mediumRisk: 'APPROVAL' as const, highRisk: 'APPROVAL' as const };

  it('never auto-mutates user-owned resources', () => {
    const plan = buildRepairPlan([{ kind: 'PERMISSION', logicalKey: 'CH_RULES', ownership: 'USER_OWNED', before: {}, desired: {} }], policy);
    expect(plan[0]?.decision).toBe('NOTIFY');
  });

  it('classifies orphaned resources as high risk', () => {
    expect(classifyRepairRisk({ kind: 'ORPHAN', logicalKey: 'ROLE_OLD', ownership: 'SYSTEM_OWNED' })).toBe('HIGH');
  });
});


describe('community workflow state machines', () => {
  it('enforces application, report and announcement transitions', () => {
    expect(transitionApplication('SUBMITTED', 'UNDER_REVIEW')).toBe('UNDER_REVIEW');
    expect(() => transitionApplication('SUBMITTED', 'ACCEPTED')).toThrow();
    expect(transitionReport('TRIAGED', 'INVESTIGATING')).toBe('INVESTIGATING');
    expect(() => transitionReport('OPEN', 'CLOSED')).toThrow();
    expect(transitionAnnouncement('REVIEW', 'SCHEDULED')).toBe('SCHEDULED');
    expect(() => transitionAnnouncement('DRAFT', 'PUBLISHED')).toThrow();
  });

  it('keeps suggestion votes mutually exclusive and idempotent', () => {
    const first = normalizeSuggestionVote({ upvoters: [], downvoters: [] }, 'user-1', 'UP');
    const repeat = normalizeSuggestionVote(first, 'user-1', 'UP');
    const switched = normalizeSuggestionVote(repeat, 'user-1', 'DOWN');
    expect(repeat.upvoters).toEqual(['user-1']);
    expect(switched.upvoters).toEqual([]);
    expect(switched.downvoters).toEqual(['user-1']);
    expect(switched.score).toBe(-1);
  });
});


describe('governance and plugin safety', () => {
  it('uses explicit retention cutoffs and preserves legal holds', () => {
    expect(evaluateRetention({ dataClass: 'AUDIT', days: 365, legalHold: true }).deletable).toBe(false);
    const decision = evaluateRetention({ dataClass: 'ANALYTICS', days: 90 }, new Date('2026-08-14T00:00:00Z'));
    expect(decision.deletable).toBe(true);
    expect(decision.cutoff?.toISOString()).toBe('2026-05-16T00:00:00.000Z');
  });

  it('requires approval for destructive changes and excludes secrets from exports', () => {
    expect(classifyChangeRisk('DELETE', 20)).toBe('CRITICAL');
    expect(requiresApproval('HIGH')).toBe(true);
    expect(() => createDataExportRequest({ guildId: 'g', requestedBy: 'admin', scope: ['SECRET'] })).toThrow();
  });

  it('round-trips versioned portable config checksums', () => {
    const envelope = createPortableConfig({ schemaVersion: 1, exportedAt: '2026-08-14T00:00:00Z', guildId: 'g', payload: { theme: 'command-bridge' } });
    expect(validatePortableConfig(envelope)).toBe(true);
    expect(validatePortableConfig({ ...envelope, payload: { theme: 'tampered' } })).toBe(false);
  });

  it('rejects plugin administrator permission and missing dependencies', async () => {
    const bad = { key: 'unsafe-plugin', version: '1.0.0', displayName: 'Unsafe', permissionsNeeded: ['Administrator'], eventsUsed: [], databaseTables: [], setupModules: [], panels: [], dependencies: [] };
    expect(validatePluginManifest(bad, [])).toContain('ADMINISTRATOR_PERMISSION_FORBIDDEN');
    const registry = new PluginRuntimeRegistry();
    expect(() => registry.register({ manifest: { ...bad, key: 'safe-plugin', permissionsNeeded: [], dependencies: ['core-plugin'] }, initialize() {}, shutdown() {} })).toThrow();
    expect(registry.list()).toEqual([]);
  });
});

describe('leaf-level setup controls', () => {
  it('normalizes games, module overrides, retention, approval and resource locks without inventing values', async () => {
    const { normalizeSetupDraft } = await import('@autoserver/control-center');
    const draft = normalizeSetupDraft({
      blueprintKey: 'gaming-advanced',
      modulePreset: 'GAMING_MAX',
      gamingPreset: 'FULL',
      moduleOverrides: { lfg: true, tickets: false, 'bad key!': true },
      games: ['valorant', 'VALORANT', 'minecraft-java'],
      retentionProfile: 'EXTENDED_AUDIT',
      approvalMode: 'ENTERPRISE',
      resourceLocks: ['CH_RULES', 'CH_RULES', 'ROLE_MEMBER'],
    });
    expect(draft.games).toEqual(['VALORANT', 'MINECRAFT-JAVA']);
    expect(draft.moduleOverrides).toEqual({ lfg: true, tickets: false });
    expect(draft.retentionProfile).toBe('EXTENDED_AUDIT');
    expect(draft.approvalMode).toBe('ENTERPRISE');
    expect(draft.resourceLocks).toEqual(['CH_RULES', 'ROLE_MEMBER']);
  });

  it('applies explicit module overrides after presets', () => {
    const draft = { ...defaultSetupDraft('gaming-advanced'), gamingPreset: 'FULL' as const, moduleOverrides: { lfg: false, privacy: true } };
    const enabled = enabledModulesForDraft(['lfg'], draft);
    expect(enabled).not.toContain('lfg');
    expect(enabled).toContain('privacy');
  });
});
