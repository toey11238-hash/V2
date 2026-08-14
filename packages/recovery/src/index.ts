import type { Guild } from 'discord.js';
import { MutationJournalRepository, ResourceMappingRepository, type Database, type MutationJournalRecord } from '@autoserver/database';

export interface CompensationResult {
  mutationId: string;
  logicalKey: string;
  action: string;
  status: 'COMPENSATED' | 'SKIPPED' | 'FAILED';
  reason: string;
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const raw = value?.[key];
  return typeof raw === 'string' ? raw : undefined;
}

export class DiscordMutationCompensator {
  private readonly journal: MutationJournalRepository;
  private readonly mappings: ResourceMappingRepository;

  constructor(database: Database) {
    this.journal = new MutationJournalRepository(database);
    this.mappings = new ResourceMappingRepository(database);
  }

  async compensateJob(guild: Guild, jobId: string): Promise<CompensationResult[]> {
    const records = await this.journal.listAppliedReverse(jobId);
    const results: CompensationResult[] = [];
    for (const record of records) results.push(await this.compensate(guild, record));
    return results;
  }

  private async compensate(guild: Guild, record: MutationJournalRecord): Promise<CompensationResult> {
    await this.journal.markState(record.mutationId, 'COMPENSATING');
    try {
      if (record.action === 'ADOPT') {
        if (!record.discordId) return this.skip(record, 'Adopt journal has no Discord ID.');
        const removed = await this.mappings.deleteIfMatches(guild.id, record.logicalKey, record.discordId);
        if (!removed) return this.skip(record, 'Mapping changed after adoption; preserving newer state.');
        await this.journal.markState(record.mutationId, 'COMPENSATED');
        return { mutationId: record.mutationId, logicalKey: record.logicalKey, action: record.action, status: 'COMPENSATED', reason: 'Removed only the mapping created by adoption.' };
      }

      if (record.action === 'CREATE') {
        if (!record.discordId) return this.skip(record, 'Create journal has no Discord ID.');
        const mapping = await this.mappings.get(guild.id, record.logicalKey);
        if (!mapping || mapping.discordId !== record.discordId) return this.skip(record, 'Stable mapping changed; refusing to delete a possibly unrelated resource.');
        const expectedName = stringField(record.afterState, 'name');
        const role = record.resourceKind === 'ROLE' ? guild.roles.cache.get(record.discordId) : undefined;
        const channel = record.resourceKind !== 'ROLE' ? guild.channels.cache.get(record.discordId) : undefined;
        const resource = role ?? channel;
        if (!resource) {
          await this.mappings.deleteIfMatches(guild.id, record.logicalKey, record.discordId);
          await this.journal.markState(record.mutationId, 'COMPENSATED');
          return { mutationId: record.mutationId, logicalKey: record.logicalKey, action: record.action, status: 'COMPENSATED', reason: 'Created resource was already absent; removed stale mapping.' };
        }
        if (expectedName && resource.name !== expectedName) return this.skip(record, 'Created resource was edited after setup; preserving manual changes.');
        await resource.delete(`ออโต้เซิร์ฟเวอร์ · ย้อนคืนอย่างปลอดภัย ${record.logicalKey}`);
        await this.mappings.deleteIfMatches(guild.id, record.logicalKey, record.discordId);
        await this.journal.markState(record.mutationId, 'COMPENSATED');
        return { mutationId: record.mutationId, logicalKey: record.logicalKey, action: record.action, status: 'COMPENSATED', reason: 'Deleted the exact resource created by this job.' };
      }

      if (record.action === 'UPDATE') {
        if (!record.discordId) return this.skip(record, 'Update journal has no Discord ID.');
        const expectedAfter = stringField(record.afterState, 'name');
        const beforeName = stringField(record.beforeState, 'name');
        if (!beforeName) return this.skip(record, 'No prior name recorded; destructive inference is forbidden.');
        const role = record.resourceKind === 'ROLE' ? guild.roles.cache.get(record.discordId) : undefined;
        const channel = record.resourceKind !== 'ROLE' ? guild.channels.cache.get(record.discordId) : undefined;
        const resource = role ?? channel;
        if (!resource) return this.skip(record, 'Updated resource is now missing; repair must reconcile it separately.');
        if (expectedAfter && resource.name !== expectedAfter) return this.skip(record, 'Resource changed again after setup; preserving newer state.');
        if ('setName' in resource) await resource.setName(beforeName, `ออโต้เซิร์ฟเวอร์ · ย้อนคืนอย่างปลอดภัย ${record.logicalKey}`);
        const ownership = stringField(record.beforeState, 'ownership');
        await this.mappings.upsert({
          guildId: guild.id,
          logicalKey: record.logicalKey,
          resourceKind: record.resourceKind,
          discordId: record.discordId,
          ownership: ownership === 'USER_OWNED' || ownership === 'LOCKED' || ownership === 'SYSTEM_OWNED' || ownership === 'TEMPLATE_OWNED' ? ownership : 'TEMPLATE_OWNED',
          nameSnapshot: beforeName,
          locked: Boolean(record.beforeState?.locked),
        });
        await this.journal.markState(record.mutationId, 'COMPENSATED');
        return { mutationId: record.mutationId, logicalKey: record.logicalKey, action: record.action, status: 'COMPENSATED', reason: 'Restored the pre-job name and mapping snapshot.' };
      }

      return this.skip(record, `No safe compensator exists for ${record.action}.`);
    } catch (error) {
      const code = error instanceof Error ? error.name : 'COMPENSATION_ERROR';
      await this.journal.markState(record.mutationId, 'FAILED', code).catch(() => undefined);
      return { mutationId: record.mutationId, logicalKey: record.logicalKey, action: record.action, status: 'FAILED', reason: error instanceof Error ? error.message : 'Compensation failed.' };
    }
  }

  private async skip(record: MutationJournalRecord, reason: string): Promise<CompensationResult> {
    await this.journal.markState(record.mutationId, 'SKIPPED');
    return { mutationId: record.mutationId, logicalKey: record.logicalKey, action: record.action, status: 'SKIPPED', reason };
  }
}
