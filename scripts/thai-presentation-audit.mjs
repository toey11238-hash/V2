import fs from 'node:fs';
import assert from 'node:assert/strict';
import { blueprintCatalog } from '../packages/blueprints/src/index.ts';
import { defaultSetupDraft, normalizeSetupDraft } from '../packages/control-center/src/index.ts';
import { SUPPORTED_LOCALES, resolveLocale } from '../packages/localization/src/index.ts';

const read=(file)=>fs.readFileSync(file,'utf8');
let assertions=0;
const check=(condition,message)=>{assertions+=1;assert.ok(condition,`ASSERTION_${assertions}_FAILED: ${message}`);};
const hasThai=(value)=>/[ก-๙]/.test(value);
const hasLatin=(value)=>/[A-Za-z]/.test(value);

const panelSource=read('packages/panels/src/index.ts');
const setupSource=read('apps/platform/src/discord/setup.ts');
const controlSource=read('packages/control-center/src/index.ts');
const localizationSource=read('packages/localization/src/index.ts');
const dashboardSource=read('apps/dashboard/src/App.tsx');
const assetSource=read('packages/assets/src/index.ts');
const discordDir='apps/platform/src/discord';
const discordSources=fs.readdirSync(discordDir).filter((name)=>name.endsWith('.ts')).map((name)=>({name,source:read(`${discordDir}/${name}`)}));

check(SUPPORTED_LOCALES.length===1&&SUPPORTED_LOCALES[0]==='th','presentation locale registry must contain Thai only');
check(resolveLocale('en')==='th'&&resolveLocale('th-TH')==='th','legacy/foreign locale input must normalize to Thai');
check(defaultSetupDraft().locale==='th','default setup locale must be Thai');
check(normalizeSetupDraft({...defaultSetupDraft(),locale:'en'}).locale==='th','persisted legacy locale must normalize to Thai');
check(!controlSource.includes("SetupLocale = 'th' | 'en'"),'setup contract must not expose English presentation locale');
check(!localizationSource.includes("SUPPORTED_LOCALES: readonly SupportedLocale[] = ['th', 'en']"),'localization registry must not retain English presentation mode');
check(!dashboardSource.includes("locale: 'th' | 'en'"),'dashboard setup draft must be Thai-only');
check(dashboardSource.includes("document.documentElement.lang='th'"),'dashboard document language must be locked to Thai');
check(!dashboardSource.includes('brand-mark">AS<'),'dashboard brand mark must not regress to Latin initials');

const catalogMatch=/export const panelCatalog: readonly PanelDefinition\[\] = \[(.*?)\n\] as const;/s.exec(panelSource);
check(Boolean(catalogMatch),'managed panel catalog block must be discoverable');
const catalog=catalogMatch?.[1]??'';
const titles=[...catalog.matchAll(/[,{]\s*title:\s*'([^']*)'/g)].map((m)=>m[1]);
const descriptions=[...catalog.matchAll(/description:\s*'([^']*)'/g)].map((m)=>m[1]);
const labels=[...catalog.matchAll(/label:\s*'([^']*)'/g)].map((m)=>m[1]);
check(titles.length===87,`panel title count drifted: ${titles.length}`);
check(descriptions.length===87,`panel description count drifted: ${descriptions.length}`);
check(labels.length>=100,`panel action-label coverage unexpectedly small: ${labels.length}`);
for(const [kind,values] of [['title',titles],['description',descriptions],['action label',labels]]) for(const value of values){
  check(hasThai(value),`managed panel ${kind} lacks Thai presentation text: ${value}`);
  check(!hasLatin(value),`managed panel ${kind} contains Latin presentation text: ${value}`);
}

let resourceCount=0;
for(const blueprint of blueprintCatalog.values()) for(const resource of blueprint.resources){
  resourceCount+=1;
  check(!hasLatin(resource.name),`Discord resource name is not Thai-only: ${blueprint.key}/${resource.logicalKey} -> ${resource.name}`);
  check(!hasLatin(resource.reason??''),`Discord resource reason is not Thai-only: ${blueprint.key}/${resource.logicalKey}`);
  if(resource.kind==='FORUM_CHANNEL') for(const tag of resource.forum?.tags??[]) check(!hasLatin(tag),`Discord forum tag is not Thai-only: ${blueprint.key}/${resource.logicalKey}/${tag}`);
}
check(resourceCount>500,'Thai resource audit must cover the full generated blueprint corpus');

for(const match of setupSource.matchAll(/\.setDescription\('([^']+)'\)/g)) check(hasThai(match[1]),`slash/setup description must be Thai: ${match[1]}`);
for(const match of setupSource.matchAll(/\{ name: '([^']+)', value: '[^']+' \}/g)) check(hasThai(match[1]),`slash/setup choice display name must be Thai: ${match[1]}`);
for(const match of setupSource.matchAll(/\.setLabel\('([^']+)'\)/g)) check(hasThai(match[1]),`Discord setup label must contain Thai presentation text: ${match[1]}`);
for(const forbidden of ['Scene preset:', 'UI V2', 'Wizard / control center', 'Dry run / preview', 'Current status']) check(!setupSource.includes(forbidden),`legacy English setup UI marker remains: ${forbidden}`);

const assetCatalogMatch=/export const PANEL_ASSET_THEMES: Record<string, AssetTheme> = \{(.*?)\n\};/s.exec(assetSource);
check(Boolean(assetCatalogMatch),'panel asset theme catalog block must be discoverable');
const assetCatalog=assetCatalogMatch?.[1]??'';
const assetEyebrows=[...assetCatalog.matchAll(/eyebrow:\s*'([^']*)'/g)].map((m)=>m[1]);
const assetTitles=[...assetCatalog.matchAll(/[,{]\s*title:\s*'([^']*)'/g)].map((m)=>m[1]);
const assetSubtitles=[...assetCatalog.matchAll(/subtitle:\s*'([^']*)'/g)].map((m)=>m[1]);
check(assetTitles.length===87&&assetEyebrows.length===87&&assetSubtitles.length===87,`asset presentation metadata drifted: eyebrow=${assetEyebrows.length} title=${assetTitles.length} subtitle=${assetSubtitles.length}`);
for(const [kind,values] of [['asset eyebrow',assetEyebrows],['asset title',assetTitles],['asset subtitle',assetSubtitles]]) for(const value of values){
  check(hasThai(value),`${kind} lacks Thai presentation text: ${value}`);
  check(!hasLatin(value),`${kind} contains Latin presentation text: ${value}`);
}
for(const marker of ['บัญญัติหลักพร้อมใช้','สดจากเหตุการณ์จริง','พื้นผิวที่ระบบดูแล','ชีพจรเซิร์ฟเวอร์']) check(assetSource.includes(marker),`Thai asset-system marker missing: ${marker}`);
for(const forbidden of ['CANON ACTIVE','EVENT-BACKED LIVE','MANAGED SURFACE',"eyebrow:'SERVER PULSE'",'title:state']) check(!assetSource.includes(forbidden),`legacy English asset presentation marker remains: ${forbidden}`);

let discordSetterLiterals=0;
let discordHelperLabels=0;
let discordOptionPlaceholders=0;
for(const {name,source} of discordSources){
  for(const re of [/\.set(?:Label|Title|Placeholder|Description)\(\s*'([^']*)'\)/g,/\.set(?:Label|Title|Placeholder|Description)\(\s*"([^"]*)"\)/g]) for(const match of source.matchAll(re)){
    discordSetterLiterals+=1;
    const value=match[1];
    check(!hasLatin(value)||hasThai(value),`Discord setter literal has Latin text without Thai context: ${name} -> ${value}`);
  }
  for(const re of [/\b(?:field|input|row)\(\s*'[^']*'\s*,\s*'([^']*)'/g,/\b(?:field|input|row)\(\s*"[^"]*"\s*,\s*"([^"]*)"/g]) for(const match of source.matchAll(re)){
    discordHelperLabels+=1;
    const value=match[1];
    check(!hasLatin(value)||hasThai(value),`Discord modal helper label has Latin text without Thai context: ${name} -> ${value}`);
  }
  for(const re of [/placeholder\s*:\s*'([^']*)'/g,/placeholder\s*:\s*"([^"]*)"/g]) for(const match of source.matchAll(re)){
    discordOptionPlaceholders+=1;
    const value=match[1];
    check(!hasLatin(value)||hasThai(value),`Discord modal placeholder has Latin text without Thai context: ${name} -> ${value}`);
  }
}
check(discordSetterLiterals>80,`Discord setter audit unexpectedly small: ${discordSetterLiterals}`);
check(discordHelperLabels>80,`Discord helper-label audit unexpectedly small: ${discordHelperLabels}`);
check(discordOptionPlaceholders>30,`Discord placeholder audit unexpectedly small: ${discordOptionPlaceholders}`);
const combinedDiscord=discordSources.map(({source})=>source).join('\n');
for(const forbidden of ['Operation failed safely','Temporary role grant rolled back','Temporary role:','Auto Server onboarding',"?'Member care'",'description:code.slice','description:message.slice','\\nEvidence:']) check(!combinedDiscord.includes(forbidden),`unsafe/legacy Discord presentation marker remains: ${forbidden}`);

const httpSource=read('apps/platform/src/http/server.ts');
for(const forbidden of ['Maintenance cancelled','The scheduled maintenance window was cancelled','Request failed safely.','Request was rejected by validation or safety policy.']) check(!httpSource.includes(forbidden),`legacy English HTTP/notification presentation marker remains: ${forbidden}`);
check(!/reply\.status\([^\n]+message\s*:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/.test(httpSource),'HTTP response must not expose raw Error.message to Dashboard users');
check(httpSource.includes('function safeHttpFailure('),'HTTP presentation must retain a safe Thai error boundary');
check(httpSource.includes("title:'ยกเลิกช่วงบำรุงรักษาแล้ว'"),'maintenance cancellation notification must be Thai at source');

const dashboardFiles=['apps/dashboard/src/App.tsx',...fs.readdirSync('apps/dashboard/src/components').filter((name)=>name.endsWith('.tsx')).map((name)=>`apps/dashboard/src/components/${name}`)];
let dashboardPlaceholders=0;
for(const file of dashboardFiles){
  const source=read(file);
  for(const match of source.matchAll(/placeholder="([^"]*)"/g)){
    dashboardPlaceholders+=1;
    const value=match[1];
    check(!hasLatin(value)||hasThai(value),`Dashboard placeholder has Latin text without Thai context: ${file} -> ${value}`);
  }
}
check(dashboardPlaceholders>10,`Dashboard placeholder audit unexpectedly small: ${dashboardPlaceholders}`);

console.log(`thai-presentation-audit PASS · ${assertions} assertions · ${titles.length} panel titles · ${labels.length} action labels · ${assetTitles.length} asset titles · ${discordSetterLiterals} Discord setters · ${discordHelperLabels} helper labels · ${discordOptionPlaceholders} modal placeholders · ${dashboardPlaceholders} Dashboard placeholders · ${resourceCount} generated resources`);
