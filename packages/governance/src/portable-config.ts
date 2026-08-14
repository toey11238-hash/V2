import { createHash } from 'node:crypto';

export interface PortableConfigEnvelope {
  format: 'AUTOSERVER_CONFIG'; schemaVersion: number; exportedAt: string; guildId: string; payload: Record<string, unknown>; checksum: string;
}
export interface PortableConfigMigrationResult {
  sourceSchemaVersion:number;
  targetSchemaVersion:number;
  appliedMigrations:string[];
  envelope:PortableConfigEnvelope;
}
export const CURRENT_PORTABLE_CONFIG_SCHEMA_VERSION=2;

export function createPortableConfig(input: Omit<PortableConfigEnvelope,'format'|'checksum'>): PortableConfigEnvelope {
  const canonical = input.schemaVersion >= 2
    ? JSON.stringify({ schemaVersion: input.schemaVersion, exportedAt: input.exportedAt, guildId: input.guildId, payload: input.payload })
    : JSON.stringify({ schemaVersion: input.schemaVersion, guildId: input.guildId, payload: input.payload });
  return { format: 'AUTOSERVER_CONFIG', ...input, checksum: createHash('sha256').update(canonical).digest('hex') };
}
export function validatePortableConfig(envelope: PortableConfigEnvelope): boolean {
  return envelope.format === 'AUTOSERVER_CONFIG' && Number.isInteger(envelope.schemaVersion) && envelope.schemaVersion>0 && createPortableConfig({ schemaVersion: envelope.schemaVersion, exportedAt: envelope.exportedAt, guildId: envelope.guildId, payload: envelope.payload }).checksum === envelope.checksum;
}

function migratePortableConfigV1ToV2(envelope:PortableConfigEnvelope):PortableConfigEnvelope{
  const payload={...envelope.payload};
  const legacyTemplateVersion=payload.templateVersion;
  delete payload.templateVersion;
  const versions=payload.versions&&typeof payload.versions==='object'&&!Array.isArray(payload.versions)?{...(payload.versions as Record<string,unknown>)}:{};
  if(legacyTemplateVersion!==undefined&&versions.templateVersion===undefined)versions.templateVersion=legacyTemplateVersion;
  payload.versions=versions;
  return createPortableConfig({schemaVersion:2,exportedAt:envelope.exportedAt,guildId:envelope.guildId,payload});
}

export function migratePortableConfig(envelope:PortableConfigEnvelope,targetSchemaVersion=CURRENT_PORTABLE_CONFIG_SCHEMA_VERSION):PortableConfigMigrationResult{
  if(!validatePortableConfig(envelope))throw new Error('PORTABLE_CONFIG_CHECKSUM_INVALID');
  if(!Number.isInteger(targetSchemaVersion)||targetSchemaVersion<1||targetSchemaVersion>CURRENT_PORTABLE_CONFIG_SCHEMA_VERSION)throw new Error('PORTABLE_CONFIG_TARGET_SCHEMA_UNSUPPORTED');
  if(envelope.schemaVersion>CURRENT_PORTABLE_CONFIG_SCHEMA_VERSION)throw new Error('PORTABLE_CONFIG_SCHEMA_TOO_NEW');
  if(envelope.schemaVersion>targetSchemaVersion)throw new Error('PORTABLE_CONFIG_DOWNGRADE_UNSUPPORTED');
  const sourceSchemaVersion=envelope.schemaVersion; const appliedMigrations:string[]=[]; let current=envelope;
  while(current.schemaVersion<targetSchemaVersion){
    if(current.schemaVersion===1){current=migratePortableConfigV1ToV2(current);appliedMigrations.push('portable-config-v1-to-v2');continue;}
    throw new Error(`PORTABLE_CONFIG_MIGRATION_MISSING:${current.schemaVersion}->${current.schemaVersion+1}`);
  }
  return {sourceSchemaVersion,targetSchemaVersion:current.schemaVersion,appliedMigrations,envelope:current};
}
