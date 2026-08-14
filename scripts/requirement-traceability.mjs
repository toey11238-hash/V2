import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=process.cwd();
const writeMode=process.argv.includes('--write');
const checkMode=process.argv.includes('--check')||!writeMode;
const outPath=resolve(root,'docs/generated/REQUIREMENT_LEAF_TRACEABILITY.md');

const featureRegistry=await readFile(resolve(root,'FEATURE_REGISTRY.md'),'utf8');
const featureStates=new Map();
for(const line of featureRegistry.split('\n')){
  const match=line.match(/^\|\s*([A-Z][A-Z0-9-]+)\s*\|[^|]*\|\s*(PLANNED|DESIGNED|IN_PROGRESS|IMPLEMENTED|INTEGRATED|TESTING|VERIFIED|BLOCKED|DEPRECATED)\s*\|/);
  if(match) featureStates.set(match[1],match[2]);
}

const buckets={
  canon:{features:['CN-001','CN-003'],implementation:'CANON.md; project-control registries; scripts/canon-audit.mjs',tests:'npm run canon:audit; npm run test:project-truth'},
  setup:{features:['SU-001','SU-003','SU-005'],implementation:'packages/control-center; packages/setup; apps/platform/src/discord/setup.ts',tests:'tests/config.test.ts; tests/command.test.ts; npm run test:ui-v2'},
  blueprint:{features:['BP-001','BP-002','BP-004'],implementation:'packages/blueprints; packages/control-center; apps/dashboard/src/App.tsx',tests:'tests/blueprints.test.ts; tests/ui-v2-server-fabric.test.ts'},
  structure:{features:['CH-001','RL-001','PM-001'],implementation:'packages/blueprints; packages/setup; packages/permissions; packages/roles',tests:'tests/blueprints.test.ts; tests/core.test.ts; npm run test:ui-v2'},
  panels:{features:['PN-002','PN-006','ASSET-004'],implementation:'packages/panels; packages/assets; apps/platform/src/discord/panel-actions.ts',tests:'tests/assets.test.ts; tests/ui-v2-server-fabric.test.ts; npm run test:ui-v2'},
  realtime:{features:['RT-001','RT-003','RT-008'],implementation:'packages/realtime; packages/jobs; packages/scheduler; apps/platform/src/runtime',tests:'tests/scheduler-notifications.test.ts; tests/phase9-realtime-release-gates.test.ts; npm run test:stress-model'},
  dashboard:{features:['DS-001','DS-002','DS-005'],implementation:'apps/dashboard/src; apps/platform/src/http/auth.ts; apps/platform/src/http/server.ts',tests:'tests/phase7-audit-webhooks-release.test.ts; npm run test:a11y-i18n'},
  security:{features:['SEC-004','SEC-005','SEC-010'],implementation:'packages/security; packages/http-security; apps/platform/src/discord/security-events.ts',tests:'tests/phase6-security-verticals.test.ts; npm run test:fault-model'},
  gaming:{features:['GM-001','GM-008','SEC-001'],implementation:'packages/gaming; apps/platform/src/discord/gaming-actions.ts; packages/database/migrations/002_gaming.sql',tests:'tests/gaming.test.ts; tests/phase4-platform.test.ts; npm run test:domain-smoke'},
  support:{features:['TK-001','WF-001','EVT-001'],implementation:'packages/tickets; packages/workflows; packages/events; apps/platform/src/discord',tests:'tests/domains.test.ts; tests/scheduler-notifications.test.ts'},
  notifications:{features:['NT-001','NT-002','VC-001'],implementation:'packages/notifications; packages/voice; packages/scheduler',tests:'tests/scheduler-notifications.test.ts'},
  governance:{features:['GOV-001','GOV-002','GOV-006'],implementation:'packages/governance; packages/database/migrations/048_data_governance_holds.sql; apps/platform/src/discord/operator-actions.ts',tests:'tests/phase14-data-governance.test.ts; npm run test:data-governance; scripts/live-db-gate.ts'},
  recovery:{features:['BK-001','RC-001','RC-003'],implementation:'packages/backups; packages/recovery; packages/repair; packages/recovery-drills',tests:'tests/recovery.test.ts; tests/recovery-drills.test.ts'},
  observability:{features:['OBS-001','OBS-002','OBS-003','SEC-013','DG-001'],implementation:'packages/audit-log; packages/database/migrations/049_audit_integrity_chain.sql; packages/diagnostics; packages/operations',tests:'tests/phase7-audit-webhooks-release.test.ts; tests/phase15-audit-integrity.test.ts; npm run test:audit-integrity; npm run test:domain-smoke'},
  runtime:{features:['QU-001','QU-002','SCALE-002'],implementation:'packages/jobs; packages/scheduler; apps/platform/src/runtime',tests:'tests/phase10-fairness-budgets.test.ts; npm run test:stress-model'},
  integrations:{features:['IN-003','IN-005','IN-007'],implementation:'packages/integrations; apps/platform/src/http/webhook-routes.ts; apps/platform/src/runtime',tests:'tests/phase8-provider-integrations.test.ts; npm run test:fault-model'},
  analytics:{features:['ANL-001','GROW-001','GROW-002'],implementation:'packages/analytics; packages/growth; packages/recommendations; packages/capacity',tests:'tests/incidents-capacity.test.ts; npm run test:domain-smoke'},
  ai:{features:['AI-001','AI-002','GOV-004'],implementation:'packages/ai-hooks; packages/database/migrations/024_ai_hook_audit.sql',tests:'tests/ai-hooks.test.ts; npm run test:domain-smoke'},
  plugin:{features:['PLUG-001','PLUG-002'],implementation:'packages/plugins; scripts/plugin-isolation-probe.mjs',tests:'tests/plugins.test.ts; npm run security:plugin-isolation-probe'},
  localization:{features:['DS-005','UX-001'],implementation:'packages/localization; apps/dashboard/src/i18n.ts; apps/dashboard/src/styles.css',tests:'npm run test:a11y-i18n'},
  data:{features:['DB-001','DB-002','DB-003'],implementation:'packages/database; packages/database/migrations',tests:'scripts/live-db-gate.ts; npm run canon:audit'},
  cache:{features:['CACHE-001','RT-006'],implementation:'packages/cache; packages/database/migrations/027_shared_cache.sql',tests:'tests/phase4-platform.test.ts; npm run test:stress-model'},
  deployment:{features:['DEP-001','DEP-005','OP-006','QA-003','QA-021'],implementation:'Dockerfile; render.yaml; .github/workflows; packages/release-truth',tests:'npm run release:readiness; .github/workflows/live-verification.yml'},
  docs:{features:['DOC-001','COMP-001'],implementation:'packages/documentation; scripts/generate-docs.mjs; docs/generated',tests:'tests/phase4-platform.test.ts; npm run test:project-truth'},
  qa:{features:['QA-001','QA-013'],implementation:'tests; scripts; TEST_REGISTRY.md; REQUIREMENT_TRACEABILITY.md',tests:'npm run canon:audit; npm run test:domain-smoke; npm run test:fault-model'},
  fabric:{features:['CH-003','RL-005','PN-009','WF-005'],implementation:'packages/blueprints; packages/community-fabric; packages/panels; apps/dashboard/src',tests:'tests/community-fabric.test.ts; tests/ui-v2-server-fabric.test.ts; npm run test:ui-v2'},
  operations:{features:['OPS-003','SCALE-003','SU-010'],implementation:'packages/admission-control; packages/capacity; packages/incidents; packages/budgets; apps/platform/src/runtime',tests:'tests/phase11-admission-control.test.ts; tests/incidents-capacity.test.ts; npm run test:fault-model'},
  phase28:{features:['UX-004','RT-010','ASSET-007','SEC-015','QA-030'],implementation:'packages/visual-system; packages/visual-experience; packages/panels; packages/assets; packages/localization; apps/dashboard/src/components/RealtimeVisualStage.tsx; apps/platform/src/discord/presentation.ts; apps/platform/src/http/server.ts',tests:'npm run test:phase28-extreme-overhaul; npm run test:thai-presentation; npm run test:a11y-i18n; npm run test:offline-preflight'},
  phase29:{features:['SU-015','OPS-004','RT-011','UX-005','SEC-016','RC-004','QA-031'],implementation:'packages/digital-twin; packages/operations-intelligence; packages/event-replay; packages/recovery-evidence; packages/visual-system; apps/platform/src/http/phase29-views.ts; apps/dashboard/src/components/DigitalTwinConsole.tsx; apps/dashboard/src/components/OperationsIntelligenceConsole.tsx; apps/dashboard/src/components/EventReplayConsole.tsx; apps/dashboard/src/components/RecoveryConsole.tsx',tests:'npm run test:phase29-production-intelligence; npm run test:phase29-chaos-replay; npm run test:backup-restore-evidence; npm run test:offline-preflight'},
};

function sectionBucket(section){
  const n=Number(section);
  if(!Number.isFinite(n)) return 'canon';
  if(n<=2||[59,60,61,63,64,65,200,201,202,203,204].includes(n))return 'canon';
  if(n===3||n===24||n===77||[108,109,146].includes(n))return 'setup';
  if(n===4||[107,163,164,165,198,199].includes(n))return 'blueprint';
  if([5,6,66,67,69,70,71,72,73,157,158,159,160,161,162].includes(n))return 'structure';
  if(n===7||[87,88,116,130,189].includes(n))return 'structure';
  if([8,9,10,36,37,38,39,79,80,81,82,118,119,120,150,178,179,180,181,182].includes(n))return 'panels';
  if(n===11)return 'support';
  if([12,93,94,95,96,147,148,149,151,152].includes(n))return 'support';
  if([13,14,76,129].includes(n))return 'support';
  if([15,49,50,127,128].includes(n))return 'panels';
  if([16,17,41,83,84,85,101,114,125,126,172,173].includes(n))return 'realtime';
  if([18,31,100].includes(n))return 'dashboard';
  if([19,44,89,90,176].includes(n))return 'observability';
  if([20,21,22,23,54,88,121,132,133,134,135,136].includes(n))return 'recovery';
  if([25,26,27,46,47,53,91,92,111,112,113,137,170,171,175,177].includes(n))return 'runtime';
  if([28,86].includes(n))return 'observability';
  if([29,30,51,52,55,97,98,99,110,117,122,123,138,139,166,167].includes(n))return 'security';
  if([32,33,106,140,141].includes(n))return 'governance';
  if(n===34||n===142)return 'plugin';
  if(n===35)return 'runtime';
  if([40,124].includes(n))return 'localization';
  if(n===42||n===174)return 'cache';
  if([43,157,158,159].includes(n))return 'data';
  if(n===45||[168,169].includes(n))return 'qa';
  if([56,57].includes(n))return 'deployment';
  if(n===58||[183,184,185,186].includes(n))return 'docs';
  if(n===62||[115,129,130,131,178].includes(n))return 'dashboard';
  if([68,74,75,153,154,155,190,191,192].includes(n))return n===153?'support':'gaming';
  if([102,103,104,187,188,193,194,195,196,197].includes(n))return 'analytics';
  if(n===105)return 'ai';
  if([143,144,145].includes(n))return 'integrations';
  if(n===156)return 'notifications';
  return 'qa';
}

function extensionBucket(heading){
  const h=heading.toLowerCase();
  if(h.includes('phase 29')||h.includes('production reality')||h.includes('operations intelligence'))return 'phase29';
  if(h.includes('phase 28')||h.includes('extreme visual'))return 'phase28';
  if(h.includes('server fabric')||h.includes('components v2'))return 'fabric';
  if(h.includes('gaming')||h.includes('asset generation')||h.includes('real-time'))return 'gaming';
  if(h.includes('phase 9')||h.includes('operational evidence'))return 'operations';
  if(h.includes('phase 10'))return 'runtime';
  if(h.includes('phase 11')||h.includes('admission control'))return 'operations';
  if(h.includes('phase 13')||h.includes('external ai'))return 'ai';
  if(h.includes('phase 14')||h.includes('data governance'))return 'governance';
  if(h.includes('phase 15')||h.includes('audit integrity'))return 'observability';
  if(h.includes('phase 19')||h.includes('dependency admission')||h.includes('reproducible release'))return 'deployment';
  if(h.includes('project memory')||h.includes('anti-forgetting')||h.includes('completeness'))return 'canon';
  return 'canon';
}

function escapeCell(value){return String(value).replaceAll('|','\\|').replace(/\s+/g,' ').trim();}
function stableId(prefix,scope,text){return `${prefix}-${createHash('sha256').update(`${scope}\n${text.trim()}`).digest('hex').slice(0,10).toUpperCase()}`;}

async function extract(sourceName,prefix){
  const text=await readFile(resolve(root,sourceName),'utf8');
  const lines=text.split('\n');
  let topHeading=''; let subHeading=''; let numberedSection=''; let extensionHeading='';
  const leaves=[];
  for(let index=0;index<lines.length;index+=1){
    const line=lines[index];
    const heading=line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if(heading){
      const level=heading[1].length; const title=heading[2].trim();
      if(level===1){topHeading=title; subHeading=''; const numbered=title.match(/^(\d{1,3})\./); numberedSection=numbered?.[1]??''; if(!numberedSection) extensionHeading=title;}
      else {subHeading=title; if(!numberedSection&&title.toLowerCase().includes('phase ')) extensionHeading=title;}
      continue;
    }
    const bullet=line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if(!bullet)continue;
    const raw=bullet[1].trim();
    if(!raw||/^[-|]+$/.test(raw))continue;
    const scope=numberedSection||extensionHeading||topHeading||'ROOT';
    let bucketKey;
    if(sourceName==='CANON.md'){
      const h=`${topHeading} ${subHeading}`.toLowerCase();
      if(h.includes('production reality')||h.includes('digital twin')||h.includes('operations intelligence'))bucketKey='phase29';
      else if(h.includes('extreme visual')||h.includes('motion, 3d'))bucketKey='phase28';
      else if(h.includes('gaming')||h.includes('gambling'))bucketKey='gaming';
      else if(h.includes('real-time'))bucketKey='realtime';
      else if(h.includes('asset')||h.includes('visual')||h.includes('animation'))bucketKey='panels';
      else if(h.includes('slash')||h.includes('/setup'))bucketKey='setup';
      else bucketKey='canon';
    } else bucketKey=numberedSection?sectionBucket(numberedSection):extensionBucket(extensionHeading||topHeading);
    const bucket=buckets[bucketKey]??buckets.qa;
    for(const id of bucket.features) if(!featureStates.has(id)) throw new Error(`Traceability mapping references unknown feature ID ${id}`);
    leaves.push({
      id:stableId(prefix,subHeading?`${scope} :: ${subHeading}`:scope,raw),source:sourceName,line:index+1,section:subHeading?`${scope} :: ${subHeading}`:scope,heading:subHeading||topHeading,bucket:bucketKey,requirement:raw,
      features:bucket.features.map((id)=>`${id}:${featureStates.get(id)}`).join('; '),implementation:bucket.implementation,tests:bucket.tests,
    });
  }
  return {text,leaves};
}

const master=await extract('MASTER_SPEC.md','MSL');
const canon=await extract('CANON.md','CNL');
const leaves=[...canon.leaves,...master.leaves];
const ids=leaves.map((leaf)=>leaf.id); const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicateIds.length)throw new Error(`Duplicate leaf IDs: ${duplicateIds.join(', ')}`);
const sourceDigest=createHash('sha256').update(canon.text).update('\n---MASTER---\n').update(master.text).digest('hex');
const lines=[
  '# REQUIREMENT LEAF TRACEABILITY','',
  '> Deterministic generated traceability for every Markdown bullet leaf in `CANON.md` and `MASTER_SPEC.md`. This maps source requirements to current feature/evidence areas; it does **not** make a VERIFIED claim.','',
  `- Source digest: \`${sourceDigest}\``,
  `- Canon leaves: **${canon.leaves.length}**`,
  `- Master Spec leaves: **${master.leaves.length}**`,
  `- Total leaves: **${leaves.length}**`,'',
  '| Leaf ID | Source | Section | Requirement | Feature states | Implementation / evidence | Test / gate |','|---|---|---|---|---|---|---|',
  ...leaves.map((leaf)=>`| \`${leaf.id}\` | \`${leaf.source}:${leaf.line}\` | ${escapeCell(leaf.section)} | ${escapeCell(leaf.requirement)} | ${escapeCell(leaf.features)} | ${escapeCell(leaf.implementation)} | ${escapeCell(leaf.tests)} |`),
  '',
  '## Evidence boundary','',
  '- A mapped leaf is **TRACKED**, not VERIFIED. Feature state comes from `FEATURE_REGISTRY.md`.','- Live DB/Discord/browser/load/recovery evidence remains mandatory where applicable.','- Re-run `npm run generate:requirement-traceability` after Canon/Spec edits and `npm run test:traceability` in CI to reject stale generated coverage.','',
].join('\n');

if(writeMode){await mkdir(resolve(root,'docs/generated'),{recursive:true});await writeFile(outPath,lines,'utf8');console.log(`requirement traceability generated: ${leaves.length} leaves (${canon.leaves.length} Canon + ${master.leaves.length} Master Spec)`);}
if(checkMode){
  let current=''; try{current=await readFile(outPath,'utf8');}catch{}
  if(current!==lines){console.error('requirement-traceability FAILED: generated leaf map is missing or stale');process.exit(1);}
  console.log(`requirement-traceability PASS ${leaves.length} leaves · deterministic coverage only, not verification evidence`);
}
