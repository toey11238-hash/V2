import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=process.cwd();
const migrations=(await readdir(resolve(root,'packages/database/migrations'))).filter((name)=>/^\d+.*\.sql$/.test(name)).sort();
const packages=(await readdir(resolve(root,'packages'),{withFileTypes:true})).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
const panels=await readFile(resolve(root,'packages/panels/src/index.ts'),'utf8');
const panelIds=[...panels.matchAll(/panelId:\s*'([^']+)'/g)].map((match)=>match[1]);
const features=await readFile(resolve(root,'FEATURE_REGISTRY.md'),'utf8');
const statusCounts={}; for(const match of features.matchAll(/\|\s*(PLANNED|DESIGNED|IN_PROGRESS|IMPLEMENTED|INTEGRATED|TESTING|VERIFIED|BLOCKED|DEPRECATED)\s*\|/g)) statusCounts[match[1]]=(statusCounts[match[1]]??0)+1;
const canon=await readFile(resolve(root,'CANON.md'),'utf8');
const commandCeiling=/no more than TWO top-level slash commands/i.test(canon)?2:'UNKNOWN';
const source=[
  '# Generated Repository Reference','',
  '> Generated from repository structure. This is not verification evidence and never overrides CANON.md.','',
  `Generated: ${new Date().toISOString()}`,'',
  '## Canon boundary','',`- Top-level slash command ceiling: **${commandCeiling}**`,`- Canon file: \`CANON.md\``,'',
  '## Package modules','',...packages.map((name)=>`- \`@autoserver/${name}\``),'',
  '## Database migrations','',...migrations.map((name)=>`- \`${name}\``),'',
  '## Managed panel IDs','',...panelIds.map((id)=>`- \`${id}\``),'',
  '## Feature status counts','',...Object.entries(statusCounts).sort().map(([key,value])=>`- ${key}: **${value}**`),'',
  '## Operator rule','',
  'Use CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION. Source presence is not completion evidence.','',
].join('\n');
await mkdir(resolve(root,'docs/generated'),{recursive:true});
await writeFile(resolve(root,'docs/generated/REPOSITORY_REFERENCE.md'),source);
console.log(`generated docs/generated/REPOSITORY_REFERENCE.md (${packages.length} packages, ${migrations.length} migrations, ${panelIds.length} panels)`);
