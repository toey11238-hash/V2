import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const required = [
  'CANON.md','MASTER_SPEC.md','FEATURE_REGISTRY.md','PROJECT_MEMORY.md','DECISIONS.md','PROJECT_STATUS.md',
  'REQUIREMENT_TRACEABILITY.md','REQUIREMENT_CATALOG.md','CHANGELOG.md','ARCHITECTURE.md','TEST_REGISTRY.md','BLOCKED.md',
  'MODULE_REGISTRY.md','PANEL_REGISTRY.md','ROLE_REGISTRY.md','CHANNEL_REGISTRY.md','PERMISSION_MATRIX.md','DATABASE_SCHEMA.md',
  'docs/generated/REQUIREMENT_LEAF_TRACEABILITY.md',
];
for (const file of required) await access(file);

const canon = await readFile('CANON.md', 'utf8');
const featureRegistry = await readFile('FEATURE_REGISTRY.md', 'utf8');
const requirementCatalog = await readFile('REQUIREMENT_CATALOG.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const blueprintSource = await readFile('packages/blueprints/src/index.ts', 'utf8');
const securitySource = await readFile('packages/security/src/index.ts', 'utf8');
const gamingMigration = await readFile('packages/database/migrations/002_gaming.sql', 'utf8');
const panelSource = await readFile('packages/panels/src/index.ts', 'utf8');
const externalPluginSource = await readFile('packages/plugins/src/external.ts', 'utf8').catch(() => '');

const failures = [];
if (!canon.includes('CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION')) failures.push('Canon authority chain missing');
if (!canon.includes('no more than TWO top-level slash commands')) failures.push('Slash command ceiling missing from Canon');
if (!canon.includes('`/setup` = the universal configuration and provisioning command for EVERYTHING')) failures.push('/setup universal Canon rule missing');
if (!blueprintSource.includes("key: 'gaming-advanced'")) failures.push('Gaming blueprint missing');
if (!securitySource.includes('assertNonWageringCompetition')) failures.push('Non-wagering security guard missing');
if (!/wager/i.test(gamingMigration)) failures.push('Gaming database anti-wagering constraint evidence missing');
if (!packageJson.scripts?.test || !packageJson.scripts?.typecheck || !packageJson.scripts?.['canon:audit']) failures.push('Verification scripts missing');

const catalogGroups = [...requirementCatalog.matchAll(/^\| SP-(\d{3}) \|/gm)].map((match) => Number(match[1]));
if (catalogGroups.length !== 204 || catalogGroups[0] !== 1 || catalogGroups.at(-1) !== 204) failures.push(`Requirement group catalog expected SP-001..SP-204, found ${catalogGroups.length} numbered groups`);

const discordDir = 'apps/platform/src/discord';
const commandFiles = (await readdir(discordDir, { recursive: true })).filter((name) => typeof name === 'string' && name.endsWith('.ts'));
let topLevelBuilders = 0;
let setupBuilders = 0;
for (const name of commandFiles) {
  const source = await readFile(join(discordDir, name), 'utf8');
  const count = (source.match(/new\s+SlashCommandBuilder\s*\(/g) ?? []).length;
  topLevelBuilders += count;
  if (count && source.includes(".setName('setup')")) setupBuilders += 1;
}
if (topLevelBuilders > 2) failures.push(`Top-level SlashCommandBuilder count exceeds Canon ceiling: ${topLevelBuilders}`);
if (setupBuilders !== 1) failures.push(`Expected exactly one /setup SlashCommandBuilder source, found ${setupBuilders}`);

const featureRows = featureRegistry.split('\n').filter((line) => /^\| [A-Z0-9-]+ \|/.test(line) && line.split('|')[1]?.trim() !== 'ID');
const verifiedRows = featureRows.filter((line) => /\| VERIFIED \|/.test(line));
if (verifiedRows.length) failures.push(`Feature Registry contains VERIFIED rows without release evidence: ${verifiedRows.length}`);
const featureIds = featureRows.map((line) => line.split('|')[1]?.trim()).filter(Boolean);
const duplicateFeatureIds = [...new Set(featureIds.filter((id, index) => featureIds.indexOf(id) !== index))];
if (duplicateFeatureIds.length) failures.push(`Feature Registry contains duplicate immutable IDs: ${duplicateFeatureIds.join(', ')}`);
const allowedFeatureStatuses = new Set(['PLANNED','DESIGNED','IN_PROGRESS','IMPLEMENTED','INTEGRATED','TESTING','VERIFIED','BLOCKED','DEPRECATED']);
for (const line of featureRows) {
  const cells = line.split('|').map((cell) => cell.trim());
  const id = cells[1];
  const status = cells[3];
  if (id && status && !allowedFeatureStatuses.has(status)) failures.push(`Feature ${id} uses invalid status: ${status}`);
}

// Managed panels must never reference missing bundled media.
const assetRefs = [...panelSource.matchAll(/(?:assetKey|animatedAssetKey):\s*'([^']+)'/g)].map((match) => match[1]);
for (const asset of new Set(assetRefs)) {
  try { await access(join('apps/dashboard/public/assets', asset)); }
  catch { failures.push(`Managed panel asset missing: ${asset}`); }
}

// Migration numbering must stay ordered and contiguous so recovery/schema bookkeeping is deterministic.
const migrationFiles = (await readdir('packages/database/migrations')).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const migrationNumbers = migrationFiles.map((name) => Number(name.slice(0, 3)));
for (let index = 0; index < migrationNumbers.length; index += 1) {
  if (migrationNumbers[index] !== index + 1) {
    failures.push(`Migration sequence is not contiguous at ${migrationFiles[index] ?? `index ${index}`}; expected ${String(index + 1).padStart(3, '0')}`);
    break;
  }
}

// Stable logical resource identity is a Canon invariant: no blueprint may emit the same key twice.
const { blueprintCatalog } = await import('../packages/blueprints/src/index.ts');
for (const blueprint of blueprintCatalog.values()) {
  const keys = blueprint.resources.map((resource) => resource.logicalKey);
  const duplicates = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  if (duplicates.length) failures.push(`Blueprint ${blueprint.key} has duplicate logical keys: ${duplicates.join(', ')}`);
}

// Do not allow a future refactor to falsely advertise Node's Permission Model as an untrusted-code network sandbox.
if (externalPluginSource) {
  if (externalPluginSource.includes('--allow-net')) failures.push('Plugin runtime falsely depends on unsupported --allow-net network isolation');
  if (!externalPluginSource.includes('thirdPartySandboxProfile') || !externalPluginSource.includes('LINUX_NS_SECCOMP_V1') || !externalPluginSource.includes('THIRD_PARTY_SANDBOX_REQUIRED')) failures.push('Third-party plugin execution is missing explicit target-proven sandbox-profile gate');
  if (externalPluginSource.includes('osIsolationVerified')) failures.push('Plugin runtime regressed to caller-supplied OS-isolation verification');
}

if (failures.length) {
  console.error('CANON AUDIT FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Canon structural audit passed: ${topLevelBuilders} slash root(s), ${blueprintCatalog.size} blueprints, ${migrationFiles.length} migrations, ${new Set(assetRefs).size} managed media refs. This does not mark product features VERIFIED.`);
