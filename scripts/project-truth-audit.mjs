import { readFile, readdir } from 'node:fs/promises';

const migrations=(await readdir('packages/database/migrations')).filter((name)=>/^\d{3}_.+\.sql$/.test(name)).sort();
const count=migrations.length; const latest=migrations.at(-1); const latestNumber=Number(latest?.slice(0,3));
const files={
  memory:await readFile('PROJECT_MEMORY.md','utf8'),
  status:await readFile('PROJECT_STATUS.md','utf8'),
  audit:await readFile('CANON_AUDIT.md','utf8'),
  schema:await readFile('DATABASE_SCHEMA.md','utf8'),
  issues:await readFile('KNOWN_ISSUES.md','utf8'),
  features:await readFile('FEATURE_REGISTRY.md','utf8'),
  todo:await readFile('TODO.md','utf8'),
};
const failures=[];
for(let index=0;index<count;index+=1){const expected=index+1;if(Number(migrations[index].slice(0,3))!==expected){failures.push(`migration sequence gap at ${migrations[index]}`);break;}}
const latest3=String(latestNumber).padStart(3,'0');
const requiredPhrases=[
  ['PROJECT_MEMORY.md',files.memory,new RegExp(`(?:${count} migrations|001.{0,20}${latest3}|migration ${latest3})`,'i')],
  ['PROJECT_STATUS.md',files.status,new RegExp(`001.{0,20}${latest3}`,'i')],
  ['CANON_AUDIT.md',files.audit,new RegExp(`${count} migrations|${latest3}`,'i')],
  ['DATABASE_SCHEMA.md',files.schema,new RegExp(`001.{0,20}${latest3}`,'i')],
  ['KNOWN_ISSUES.md',files.issues,new RegExp(`001.{0,20}${latest3}`,'i')],
  ['FEATURE_REGISTRY.md',files.features,new RegExp(`migrations 001-${latest3}`,'i')],
  ['TODO.md',files.todo,new RegExp(`001-${latest3}`,'i')],
];
for(const [name,text,pattern] of requiredPhrases)if(!pattern.test(text))failures.push(`${name} does not acknowledge latest migration ${latest3}`);
if(!files.status.includes(`${count} contiguous migrations`))failures.push(`PROJECT_STATUS.md current audit count is not ${count}`);
if(!files.audit.includes('Phase 29 Production Reality + Operations Intelligence audit'))failures.push('CANON_AUDIT.md latest checkpoint is stale');
if(!files.features.includes('| QA-014 | Project truth drift audit | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-014 truth audit');
if(!files.features.includes('| QA-015 | Leaf-level Canon/Spec traceability | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-015 leaf traceability');
if(!files.features.includes('| AI-002 | External AI egress policy and OpenAI Responses adapter | TESTING |'))failures.push('FEATURE_REGISTRY.md missing AI-002 external AI evidence');
if(!files.features.includes('| QA-016 | External AI contract smoke | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-016 external AI gate');
if(!files.features.includes('| GOV-006 | Durable legal-hold + atomic retention integrity | TESTING |'))failures.push('FEATURE_REGISTRY.md missing GOV-006 data-governance evidence');
if(!files.features.includes('| QA-017 | Phase 14 data-governance contract smoke | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-017 data-governance gate');
if(!files.features.includes('| OBS-003 | Tamper-evident audit integrity chain | TESTING |'))failures.push('FEATURE_REGISTRY.md missing OBS-003 audit-integrity evidence');
if(!files.features.includes('| SEC-013 | Audit event immutability + append-only integrity metadata | TESTING |'))failures.push('FEATURE_REGISTRY.md missing SEC-013 audit-integrity security evidence');
if(!files.features.includes('| QA-018 | Phase 15 audit-integrity contract smoke | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-018 audit-integrity gate');
if(!files.features.includes('| RC-004 | Backup evidence lifecycle + canonical storage integrity | TESTING |'))failures.push('FEATURE_REGISTRY.md missing RC-004 backup evidence lifecycle');
if(!files.features.includes('| SEC-014 | Approval-bound restore plan and backup-content integrity | TESTING |'))failures.push('FEATURE_REGISTRY.md missing SEC-014 restore binding');
if(!files.features.includes('| QA-019 | Phase 16 backup/restore evidence contract smoke | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-019 backup/restore evidence gate');
if(!files.features.includes('| PLUG-002 | External plugin execution boundary | TESTING |'))failures.push('FEATURE_REGISTRY.md missing Phase 18 plugin sandbox TESTING state');
if(!files.features.includes('| QA-004 | Real DB migration/integration tests | TESTING |'))failures.push('FEATURE_REGISTRY.md missing executable live DB QA state');
if(!files.features.includes('| QA-005 | Discord E2E/load/chaos/security/accessibility | TESTING |'))failures.push('FEATURE_REGISTRY.md missing executable live QA state');
if(!files.features.includes('| QA-020 | Phase 18 plugin sandbox + live-QA contract smoke | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-020 Phase 18 gate');
if(!files.features.includes('| QA-021 | Phase 19 dependency admission + review-only lock bootstrap contracts | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-021 Phase 19 gate');
if(!files.features.includes('| QA-022 | TypeScript parser source-integrity gate | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-022 Phase 20 gate');
if(!files.features.includes('| QA-023 | Committed-tree release provenance integrity gate | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-023 Phase 21 gate');
if(!files.features.includes('| QA-024 | Immutable GitHub Actions workflow policy + release-truth enforcement | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-024 Phase 22 gate');
if(!files.features.includes('| QA-025 | Phase 23 experience expansion contracts | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-025 Phase 23 gate');
if(!files.features.includes('| QA-026 | Phase 24 session reliability/SLO contracts | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-026 Phase 24 gate');
if(!files.features.includes('| DEP-007 | Exact Node/npm/TypeScript toolchain policy across local/CI/container/deploy surfaces | TESTING |'))failures.push('FEATURE_REGISTRY.md missing DEP-007 Phase 25 toolchain policy');
if(!files.features.includes('| QA-027 | Final source attestation + Phase 25 closure contracts | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-027 Phase 25 gate');
if(!files.features.includes('| QA-029 | Phase 27 visual-experience contract | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-029 Phase 27 visual gate');
if(!files.features.includes('| PN-010 | Event-backed living Components V2 panels | TESTING |'))failures.push('FEATURE_REGISTRY.md missing PN-010 living panels');
if(!files.features.includes('| ASSET-006 | Theme/Server Pulse media factory and manifests | TESTING |'))failures.push('FEATURE_REGISTRY.md missing ASSET-006 visual asset factory');
if(!files.features.includes('| QA-030 | Phase 28 extreme-overhaul + Thai source contract | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-030 Phase 28 gate');
if(!files.features.includes('| SU-015 | Setup-derived read-only Server Digital Twin | TESTING |'))failures.push('FEATURE_REGISTRY.md missing SU-015 Phase 29 Digital Twin');
if(!files.features.includes('| OPS-004 | Evidence-backed Operations Intelligence command center | TESTING |'))failures.push('FEATURE_REGISTRY.md missing OPS-004 Phase 29 operations intelligence');
if(!files.features.includes('| RT-011 | Bounded read-only durable + realtime Event Replay | TESTING |'))failures.push('FEATURE_REGISTRY.md missing RT-011 Phase 29 replay');
if(!files.features.includes('| UX-005 | Priority-aware realtime Visual Orchestrator + hysteresis governor | TESTING |'))failures.push('FEATURE_REGISTRY.md missing UX-005 Phase 29 visual orchestration');
if(!files.features.includes('| SEC-016 | Replay/operations evidence safety boundary | TESTING |'))failures.push('FEATURE_REGISTRY.md missing SEC-016 Phase 29 safety boundary');
if(!files.features.includes('| QA-031 | Phase 29 production-intelligence + chaos/replay contracts | TESTING |'))failures.push('FEATURE_REGISTRY.md missing QA-031 Phase 29 gate');
if(failures.length){console.error('project-truth-audit FAILED');for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`project-truth-audit PASS latest=${latest} count=${count}`);
