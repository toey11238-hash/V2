import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { blueprintCatalog } from '../packages/blueprints/src/index.ts';
import {
  deriveRealtimeVisualDirective,
  visualPerformanceBudget,
} from '../packages/visual-system/src/index.ts';
import { deriveLivingPanelTransitions } from '../packages/visual-experience/src/index.ts';

const root=process.cwd();
const text=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const sha=(buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
let assertions=0;
const check=(condition,message)=>{assertions+=1;assert.ok(condition,`ASSERTION_${assertions}_FAILED: ${message}`);};

const app=text('apps/dashboard/src/App.tsx');
const stage=text('apps/dashboard/src/components/RealtimeVisualStage.tsx');
const css=text('apps/dashboard/src/styles.css');
const api=text('apps/platform/src/http/server.ts');
const gamingActions=text('apps/platform/src/discord/gaming-actions.ts');
const ticketActions=text('apps/platform/src/discord/ticket-actions.ts');
const panelActions=text('apps/platform/src/discord/panel-actions.ts');
const workflowActions=text('apps/platform/src/discord/workflow-actions.ts');
const memberEvents=text('apps/platform/src/discord/member-events.ts');
const securityEvents=text('apps/platform/src/discord/security-events.ts');
const gamingRepo=text('packages/gaming/src/index.ts');
const visualExperience=text('packages/visual-experience/src/index.ts');
const localization=text('packages/localization/src/index.ts');
const panelSource=text('packages/panels/src/index.ts');
const assetGenerator=text('scripts/generate-visual-assets-offline.py');

// Durable visual-experience data path must use the canonical draft field and be consumed by the dashboard.
check(api.includes('theme:current.draft.themeKey'),'visual-experience API must expose draft.themeKey');
check(!api.includes('theme: current.draft.theme,')&&!api.includes('theme:current.draft.theme,'),'visual-experience API must not regress to nonexistent draft.theme');
check(app.includes('/visual-experience'),'dashboard must fetch durable visual-experience state');
check(app.includes('setVisualExperience'),'dashboard must apply fetched visual-experience state');
check(app.includes('RealtimeVisualStage'),'dashboard must mount the realtime visual stage');

// Runtime motion is real, adaptive, accessibility-aware, and not a static mock.
for(const token of ['requestAnimationFrame','visibilitychange','prefers-reduced-motion','ResizeObserver','devicePixelRatio','deriveRealtimeVisualDirective','visualPerformanceBudget','<canvas']){
  check(stage.includes(token),`realtime visual stage missing runtime primitive: ${token}`);
}
check(stage.includes('aria-live'),'realtime visual stage must expose accessible live evidence');
check(stage.includes('eventId'),'realtime visual stage must bind FX to event identity');
for(const [label,evidence] of [['perspective','perspective:'],['preserve-3d','transform-style:preserve-3d'],['reduced-motion','prefers-reduced-motion:reduce'],['hologram','holo-orbit'],['crystal','holo-crystal']]){
  check(css.replaceAll(' ','').includes(evidence.replaceAll(' ','')),`dashboard visual identity missing CSS capability: ${label}`);
}
const lite=visualPerformanceBudget({reducedMotion:false,hidden:false,hardwareConcurrency:2,deviceMemoryGb:2,measuredFps:30,motionPreset:'CINEMATIC'});
check(lite.tier==='LITE'&&lite.targetFps===30&&lite.parallax===false,'performance governor must degrade weak/low-FPS devices');
const reduced=visualPerformanceBudget({reducedMotion:true,hidden:false,motionPreset:'CINEMATIC'});
check(reduced.tier==='STATIC'&&reduced.particleScale===0,'reduced-motion must disable animated FX');
const hidden=visualPerformanceBudget({reducedMotion:false,hidden:true,motionPreset:'CINEMATIC'});
check(hidden.tier==='PAUSED'&&hidden.targetFps===0,'hidden tabs must pause visual runtime');

// Every requested realtime domain must be published from a real durable/action path.
for(const eventType of ['ticket.claimed','ticket.closed','ticket.reopened']) check(ticketActions.includes(`'${eventType}'`)||ticketActions.includes(`\`${eventType}\``),`missing ticket publisher ${eventType}`);
check(panelActions.includes("'ticket.created'")||panelActions.includes('`ticket.created`'),'missing ticket.created publisher after creation path');
for(const eventType of ['community.event.created','community.event.registered','community.event.cancelled','community.event.checkin']) check(workflowActions.includes(`'${eventType}'`)||workflowActions.includes(`\`${eventType}\``),`missing community event publisher ${eventType}`);
for(const eventType of ['gaming.xp.awarded','gaming.level.up']) check(gamingActions.includes(`'${eventType}'`)||gamingActions.includes(`\`${eventType}\``),`missing gaming publisher ${eventType}`);
check(memberEvents.includes("'member.join'")||memberEvents.includes('`member.join`'),'missing member.join publisher');
check(securityEvents.includes("'security.alert'")||securityEvents.includes('`security.alert`'),'missing security.alert publisher');
check(gamingActions.includes('result.joined ? await repo.awardXp')||gamingActions.includes('result.joined?await repo.awardXp'),'LFG/session progression must award XP only on a real new join');
check(gamingRepo.includes('previousLevel'),'XP result must retain previous level for truthful level-up detection');

// Realtime visuals and managed living panels must understand the same event vocabulary.
const visualCases=[
  ['member.join','JOIN'],
  ['gaming.level.up','LEVEL_UP'],
  ['gaming.xp.awarded','LEVEL_UP'],
  ['ticket.created','TICKET'],
  ['security.alert','SECURITY'],
  ['community.event.checkin','EVENT'],
  ['setup.job.started','JOB'],
];
for(const [type,kind] of visualCases) check(deriveRealtimeVisualDirective(type,{severity:'CRITICAL'}).kind===kind,`visual directive mismatch for ${type}`);
for(const type of ['member.join','gaming.level.up','gaming.xp.awarded','ticket.created','ticket.claimed','ticket.closed','ticket.reopened','security.alert','community.event.created','community.event.registered','community.event.cancelled','community.event.checkin','setup.job.started']){
  check(deriveLivingPanelTransitions({type,payload:{severity:'HIGH',level:9}}).length>0,`living panel runtime missing transition for ${type}`);
}
check(deriveLivingPanelTransitions({type:'unrelated.event',payload:{}}).length===0,'living panel system must not fabricate activity for unknown events');

// Thai is the single presentation language; generated Discord resources are Thai-only at their source of truth.
check(localization.includes("return 'th'"),'locale resolver must force Thai presentation');
check(app.includes("document.documentElement.lang='th'"),'dashboard document language must be Thai');
const panelCatalogBlock=/export const panelCatalog: readonly PanelDefinition\[\] = \[(.*?)\n\] as const;/s.exec(panelSource)?.[1]??'';
for(const match of panelCatalogBlock.matchAll(/(?:title|description|label):\s*'([^']+)'/g)) check(!/[A-Za-z]/.test(match[1]),`panel presentation must be Thai at source: ${match[1]}`);
const panelCount=(panelSource.match(/panelId:\s*'PANEL_/g)??[]).length;
check(panelCount===87,`managed panel count drifted: ${panelCount}`);
let generatedResources=0;
for(const blueprint of blueprintCatalog.values()){
  for(const resource of blueprint.resources){
    generatedResources+=1;
    check(!/[A-Za-z]/.test(resource.name),`Discord resource name is not Thai-only: ${blueprint.key}/${resource.logicalKey} -> ${resource.name}`);
    check(!/[A-Za-z]/.test(resource.reason??''),`Discord resource reason is not Thai-only: ${blueprint.key}/${resource.logicalKey}`);
    if(resource.kind==='FORUM_CHANNEL') for(const tag of resource.forum?.tags??[]) check(!/[A-Za-z]/.test(tag),`Discord forum tag is not Thai-only: ${blueprint.key}/${resource.logicalKey}/${tag}`);
  }
}
check(generatedResources>500,'blueprint Thai audit must cover the full multi-blueprint resource corpus');

// Asset set must be fully regenerated by the new deterministic visual grammar and be byte/hash coherent.
const panelManifest=JSON.parse(text('apps/dashboard/public/assets/panels/manifest.json'));
const themeManifest=JSON.parse(text('apps/dashboard/public/assets/themes/manifest.json'));
check(panelManifest.generator.includes('prismatic-depth-v2'),'panel asset manifest must use Phase 28 generator signature');
check(themeManifest.generator.includes('prismatic-depth-v2'),'theme asset manifest must use Phase 28 generator signature');
check(assetGenerator.includes('prismatic-depth-v2'),'offline generator source must identify the new visual grammar');
check(panelManifest.assets.length>=103,`panel asset set too small: ${panelManifest.assets.length}`);
check(themeManifest.assets.length>=230,`theme asset set too small: ${themeManifest.assets.length}`);
check(themeManifest.themes===10&&themeManifest.states===11,'theme manifest must preserve full theme/pulse coverage');
let totalVisualBytes=0;
let maxStaticBytes=0;
let maxMotionBytes=0;
for(const [base,manifest] of [['apps/dashboard/public/assets/panels',panelManifest],['apps/dashboard/public/assets/themes',themeManifest]]){
  for(const asset of manifest.assets){
    const file=path.join(root,base,asset.file);
    check(fs.existsSync(file),`asset path missing: ${path.relative(root,file)}`);
    const bytes=fs.readFileSync(file);
    check(bytes.length===asset.bytes,`asset byte count mismatch: ${asset.file}`);
    check(sha(bytes)===asset.sha256,`asset hash mismatch: ${asset.file}`);
    totalVisualBytes+=bytes.length;
    if(asset.file.endsWith('.gif')){ maxMotionBytes=Math.max(maxMotionBytes,bytes.length); check((asset.frames??0)>=12,`motion asset must contain >=12 frames: ${asset.file}`); }
    else maxStaticBytes=Math.max(maxStaticBytes,bytes.length);
  }
}
check(maxMotionBytes<=768*1024,`motion asset loading budget exceeded: ${maxMotionBytes} bytes`);
check(maxStaticBytes<=320*1024,`static asset loading budget exceeded: ${maxStaticBytes} bytes`);
check(totalVisualBytes<=120*1024*1024,`governed visual bundle budget exceeded: ${totalVisualBytes} bytes`);
check(!app.includes('assets/themes/manifest.json')&&!app.includes('assets/panels/manifest.json'),'Dashboard must not eagerly import the full visual asset manifests');

console.log(`Phase 28 extreme overhaul smoke passed: ${assertions} assertions, ${blueprintCatalog.size} blueprints, ${generatedResources} generated resources, ${panelCount} panels, ${panelManifest.assets.length+themeManifest.assets.length} governed assets.`);
