import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  SERVER_PULSE_STATES,
  VISUAL_SCENE_PRESETS,
  VISUAL_THEME_KEYS,
  VISUAL_THEME_OPTIONS,
  VISUAL_THEME_PACKS,
  dashboardThemeVariables,
  decorateResourceName,
  deriveServerPulse,
  panelAccentForFamily,
  resolveThemePack,
  roleVisualProfile,
  themePulseAssetPath,
  visualMediaMode,
  visualScenePatch,
} from '../packages/visual-system/src/index.ts';
import {
  deriveLivingPanelTransitions,
  livingPanelExpiry,
  livingPanelRenderDelayMs,
  livingPanelStateHash,
} from '../packages/visual-experience/src/index.ts';

let assertions=0;
const assert=(condition,message)=>{assertions+=1;if(!condition)throw new Error(`ASSERTION_${assertions}_FAILED: ${message}`);};
const text=(file)=>fs.readFileSync(file,'utf8');
const sha=(buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
const root=process.cwd();

assert(VISUAL_THEME_KEYS.length===10,'visual theme catalog must contain ten deliberate packs');
assert(VISUAL_THEME_OPTIONS.length===10,'theme option catalog mirrors packs');
assert(new Set(VISUAL_THEME_KEYS).size===10,'theme keys are unique');
assert(Object.keys(VISUAL_SCENE_PRESETS).length===5,'five scene presets exist');
assert(SERVER_PULSE_STATES.length===11,'Server Pulse state catalog must remain explicit');
for(const key of VISUAL_THEME_KEYS){
  const pack=VISUAL_THEME_PACKS[key];
  assert(pack.key===key,`theme identity mismatch ${key}`);
  assert(pack.rolePalette.length===8,`theme role palette incomplete ${key}`);
  assert(pack.signature.length>=12,`theme signature too weak ${key}`);
  for(const [token,value] of Object.entries(pack.tokens))assert(/^#[0-9a-f]{6}$/i.test(value),`invalid color token ${key}.${token}`);
}
assert(resolveThemePack('missing-theme').key==='command-bridge','unknown themes fail safely to command bridge');
assert(panelAccentForFamily('sakura-circuit','VISUAL')>0,'visual panel accent resolves from theme palette');
const enhanced=roleVisualProfile({themeKey:'aurora-grid',style:'ENHANCED',logicalKey:'ROLE_GAMER',module:'gaming',enhancedColors:true,roleIcons:true});
assert(Boolean(enhanced.colors?.secondaryColor),'enhanced role colors are emitted when capability exists');
assert(Boolean(enhanced.unicodeEmoji),'role icon intent is emitted when capability exists');
const fallback=roleVisualProfile({themeKey:'aurora-grid',style:'ENHANCED',logicalKey:'ROLE_GAMER',module:'gaming',enhancedColors:false,roleIcons:false});
assert(!fallback.colors?.secondaryColor,'enhanced role colors gracefully fall back');
assert(!fallback.unicodeEmoji,'role icon gracefully falls back');
assert(decorateResourceName({kind:'CATEGORY',name:'COMMUNITY',module:'community',preset:'SIGNAL'}).startsWith('◆ '),'category signal decoration is restrained and deterministic');
assert(decorateResourceName({kind:'TEXT_CHANNEL',name:'general',module:'community',preset:'ICONIC'})==='general','text-channel decoration does not create noisy names');
assert(deriveServerPulse({criticalIncidents:1}).state==='INCIDENT','incident evidence dominates pulse');
assert(deriveServerPulse({recoveryActive:true}).state==='RECOVERY','recovery evidence maps to recovery pulse');
assert(deriveServerPulse({activeSessions:1}).state==='LIVE','active session maps to live pulse');
assert(visualMediaMode({motionPreset:'STATIC',mediaDensity:'RICH',state:'LIVE'})==='STATIC','static motion preference wins');
assert(visualMediaMode({motionPreset:'CINEMATIC',mediaDensity:'RICH',state:'IDLE'})==='MOTION','cinematic scene can use motion in idle state');
assert(visualMediaMode({motionPreset:'ANIMATED',mediaDensity:'RICH',reducedMotion:true,state:'LIVE'})==='STATIC','reduced motion overrides animated media');
assert(visualMediaMode({motionPreset:'CINEMATIC',mediaDensity:'MINIMAL',state:'LIVE'})==='NONE','minimal media density suppresses media');
assert(themePulseAssetPath('obsidian-luxe','INCIDENT','MOTION')==='themes/obsidian-luxe/pulse-incident.gif','pulse media path is deterministic');
assert(Object.keys(dashboardThemeVariables('minimal-mono')).length>=10,'dashboard theme variables expose full token system');
for(const scene of Object.keys(VISUAL_SCENE_PRESETS)){
  const patch=visualScenePatch(scene);
  assert(['STATIC','BALANCED','ANIMATED','CINEMATIC'].includes(patch.motionPreset),`scene ${scene} has valid motion`);
  assert(['MINIMAL','BALANCED','RICH'].includes(patch.mediaDensity),`scene ${scene} has valid media density`);
}

const liveTransition=deriveLivingPanelTransitions({type:'gaming.session.started',payload:{}});
assert(liveTransition.some((item)=>item.panelId==='PANEL_SERVER_PULSE'&&item.state==='LIVE'),'gaming live event drives Server Pulse');
assert(liveTransition.some((item)=>item.panelId==='PANEL_GAMING_HUB'&&item.state==='LIVE'),'gaming live event drives Gaming Hub');
const securityTransition=deriveLivingPanelTransitions({type:'security.alert',payload:{severity:'CRITICAL'}});
assert(securityTransition.some((item)=>item.state==='INCIDENT'),'critical security event drives incident state');
assert(deriveLivingPanelTransitions({type:'unrelated.event',payload:{}}).length===0,'unmapped events do not fabricate visual activity');
const h1=livingPanelStateHash({panelId:'PANEL_SERVER_PULSE',state:'LIVE',reason:'x',eventId:'event-1'});
const h2=livingPanelStateHash({panelId:'PANEL_SERVER_PULSE',state:'LIVE',reason:'x',eventId:'event-1'});
const h3=livingPanelStateHash({panelId:'PANEL_SERVER_PULSE',state:'LIVE',reason:'x',eventId:'event-2'});
assert(h1===h2&&h1!==h3&&h1.length===64,'living state hash is deterministic and event-bound');
assert(livingPanelRenderDelayMs('INCIDENT')<livingPanelRenderDelayMs('ACTIVE'),'urgent visual events receive shorter product coalescing delay');
assert(livingPanelExpiry('2026-01-01T00:00:00.000Z',1).toISOString()==='2026-01-01T00:00:30.000Z','living state TTL enforces lower bound');

const setupControl=text('packages/control-center/src/index.ts');
const setupDiscord=text('apps/platform/src/discord/setup.ts');
const setupState=text('apps/platform/src/runtime/setup-state.ts');
const setupWorker=text('apps/platform/src/runtime/setup-worker.ts');
const setupEngine=text('packages/setup/src/index.ts');
const panels=text('packages/panels/src/index.ts');
const blueprints=text('packages/blueprints/src/index.ts');
const assets=text('packages/assets/src/index.ts');
const assetGenerator=text('scripts/generate-assets.ts');
const offlineAssetGenerator=text('scripts/generate-visual-assets-offline.py');
const dashboard=text('apps/dashboard/src/App.tsx');
const dashboardCss=text('apps/dashboard/src/styles.css');
const themeStudio=text('apps/dashboard/src/components/ThemeStudio.tsx');
const serverMap=text('apps/dashboard/src/components/LiveServerMap.tsx');
const pulseCard=text('apps/dashboard/src/components/ServerPulseCard.tsx');
const http=text('apps/platform/src/http/server.ts');
const platform=text('apps/platform/src/index.ts');
const liveWorker=text('apps/platform/src/runtime/living-panel-worker.ts');
const db=text('packages/database/src/index.ts');
const migration=text('packages/database/migrations/054_visual_experience.sql');
const gaming=text('apps/platform/src/discord/gaming-actions.ts');

for(const field of ['channelDecoration','roleVisualStyle','mediaDensity']){
  assert(setupControl.includes(field),`SetupDraft persists ${field}`);
  assert(setupState.includes(field),`setup-state reloads ${field}`);
  assert(setupWorker.includes(field),`setup worker persists ${field}`);
  assert(dashboard.includes(field),`dashboard controls ${field}`);
}
assert(setupControl.includes("'CINEMATIC'")&&setupControl.includes("'SPACIOUS'"),'setup accepts cinematic/spacious visual modes');
assert(setupDiscord.includes('VISUAL_SCENE_PRESETS')&&setupDiscord.includes('visualScenePatch'),'Discord setup supports governed visual scenes');
assert(setupDiscord.includes('setup:visual-modal:'),'Discord setup visual modal exists');
assert(setupDiscord.split('\n').filter((line)=>line.includes('${scene')).length===1,'scene interpolation is scoped only to visual modal response');
assert(setupEngine.includes("features.includes('ENHANCED_ROLE_COLORS')")||setupEngine.includes("has('ENHANCED_ROLE_COLORS')"),'planner detects enhanced role-color capability');
assert(setupEngine.includes("features.includes('ROLE_ICONS')")||setupEngine.includes("has('ROLE_ICONS')"),'planner detects role-icon capability');
assert(setupEngine.includes('normalizeDesiredRoleForGuild'),'planner normalizes role visuals to guild capabilities');

for(const key of ['CAT_VISUAL_EXPERIENCE','CH_THEME_STUDIO','CH_ASSET_GALLERY','CH_ROLE_GALLERY','CH_SERVER_PULSE','CH_SCENE_PRESETS','VC_VISUAL_PREVIEW','ROLE_VISUAL_CURATOR'])assert(blueprints.includes(key),`blueprint missing ${key}`);
for(const panelId of ['PANEL_THEME_STUDIO','PANEL_ASSET_GALLERY','PANEL_ROLE_GALLERY','PANEL_SERVER_PULSE','PANEL_SCENE_PRESETS'])assert(panels.includes(panelId),`managed visual panel missing ${panelId}`);
assert(panels.includes("family: 'VISUAL'"),'visual panel family is registered');
assert(panels.includes('stateDetail'),'panel renderer accepts event-backed state detail');
assert(panels.includes('visualMediaMode'),'panel media is chosen from visual policy');
assert(panels.includes('themePulseAssetPath'),'panel renderer resolves theme pulse media');
assert(panels.includes('recordConfig.themeKey')&&panels.includes('recordConfig.motionPreset'),'panel audit/repair retains deployed visual profile evidence');
assert(panels.includes('renderLiveState'),'managed panels expose in-place living state rendering');

assert(assets.includes('renderThemePulsePack'),'canonical asset renderer creates theme pulse packs');
assert(assets.includes('for(const state of states)'),'canonical pulse pack iterates every state');
assert(assetGenerator.includes("resolve(themePublicDir, 'manifest.json')"),'canonical generator writes theme manifest');
assert(offlineAssetGenerator.includes("THEMES/'manifest.json'"),'offline fallback writes theme manifest');
assert(offlineAssetGenerator.includes("for st in STATES"),'offline fallback renders every pulse state');
assert(assetGenerator.includes('mkdir(dirname(target), { recursive: true })'),'canonical generator supports nested theme output paths');

assert(themeStudio.includes('VISUAL_SCENE_PRESETS'),'Theme Studio exposes scene presets');
assert(themeStudio.includes('VISUAL_THEME_OPTIONS'),'Theme Studio renders all theme packs');
assert(serverMap.includes('LiveServerMap'),'Live Server Map component exists');
assert(pulseCard.includes('deriveServerPulse'),'Dashboard Server Pulse derives state from evidence');
assert(dashboard.includes('<ThemeStudio'),'Dashboard mounts Theme Studio');
assert(dashboard.includes('<LiveServerMap'),'Dashboard mounts Live Server Map');
assert(dashboard.includes('<ServerPulseCard'),'Dashboard mounts Server Pulse');
assert(dashboardCss.includes('@media (prefers-reduced-motion: reduce)'),'Dashboard explicitly supports reduced motion');
assert(dashboardCss.includes('server-pulse')||dashboardCss.includes('pulse-orbit'),'Dashboard includes concentrated Server Pulse visual treatment');

assert(migration.includes('CREATE TABLE IF NOT EXISTS panel_live_states'),'migration 054 persists living panel state');
assert(migration.includes('CREATE TABLE IF NOT EXISTS panel_live_state_events'),'migration 054 persists event de-dup evidence');
assert(migration.includes('PRIMARY KEY (guild_id,panel_id,event_id)'),'event de-dup identity is durable');
assert(migration.includes('ENABLE ROW LEVEL SECURITY'),'visual live-state tables enable RLS');
assert(db.includes('class PanelLiveStateRepository'),'living state repository exists');
assert(db.includes('applyTransition'),'repository supports idempotent transition application');
assert(db.includes('on conflict(guild_id,panel_id,event_id) do nothing'),'repository de-duplicates repeated event delivery');
assert(liveWorker.includes('minimumDiscordEditIntervalMs=15_000'),'living panel worker coalesces normal edits');
assert(liveWorker.includes('listPending(500)'),'living panel worker recovers durable pending states on restart');
assert(liveWorker.includes('renderLiveState'),'living worker edits the managed panel instead of spawning message spam');
assert(liveWorker.includes('markRendered'),'living worker records render evidence');
assert(platform.includes('new LivingPanelWorker'),'platform boots living panel worker');
assert(platform.includes("componentKey: 'living-panels'"),'living panel worker contributes health evidence');
assert(gaming.includes('gaming.session.'),'Gaming session events feed the living visual pipeline');

assert(http.includes("app.get('/api/guilds/:guildId/visual-experience'"),'guild-scoped visual experience evidence API exists');
assert(http.includes('enhancedRoleColors'),'visual API reports role color capability without mutating it');
assert(http.includes('roleIcons'),'visual API reports role-icon capability');
assert(http.includes('PanelLiveStateRepository'),'visual API reports durable live panel state');
assert(http.includes("panel.family==='VISUAL'"),'visual API exposes visual panel catalog count');

const themeRoot=path.join(root,'apps/dashboard/public/assets/themes');
const themeManifest=JSON.parse(text(path.join(themeRoot,'manifest.json')));
assert(themeManifest.themes===10,'theme asset manifest records ten themes');
assert(themeManifest.states===11,'theme asset manifest records eleven pulse states');
assert(themeManifest.assets.length===230,'theme asset manifest contains 230 actual static/motion assets');
const manifestFiles=new Set(themeManifest.assets.map((item)=>item.file));
for(const theme of VISUAL_THEME_KEYS){
  assert(manifestFiles.has(`${theme}/hero.png`),`theme hero missing ${theme}`);
  for(const state of SERVER_PULSE_STATES){
    for(const ext of ['png','gif']){
      const rel=`${theme}/pulse-${state.toLowerCase()}.${ext}`;
      assert(manifestFiles.has(rel),`theme pulse asset missing ${rel}`);
      const entry=themeManifest.assets.find((item)=>item.file===rel);
      const bytes=fs.readFileSync(path.join(themeRoot,rel));
      assert(entry?.sha256===sha(bytes),`theme manifest checksum mismatch ${rel}`);
      assert(entry?.bytes===bytes.length,`theme manifest byte count mismatch ${rel}`);
      if(ext==='gif')assert((entry?.frames??0)>1,`animated theme asset must contain multiple frames ${rel}`);
    }
  }
}
const panelManifest=JSON.parse(text('apps/dashboard/public/assets/panels/manifest.json'));
for(const file of ['theme-studio.png','asset-gallery.png','role-gallery.png','server-pulse.png','server-pulse-motion.gif','scene-presets.png']){
  assert(panelManifest.assets.some((item)=>item.file===file),`panel asset manifest missing ${file}`);
  assert(fs.existsSync(path.join(root,'apps/dashboard/public/assets/panels',file)),`visual panel asset missing ${file}`);
}

const pkg=JSON.parse(text('package.json'));
assert(pkg.scripts['test:phase27-visual-experience']==='node --experimental-transform-types scripts/phase27-visual-experience-smoke.mjs','Phase 27 visual gate is script-addressable');
const preflight=text('scripts/offline-release-preflight.mjs');
assert(preflight.includes("'test:phase27-visual-experience'"),'offline preflight includes Phase 27 visual gate');
assert(setupDiscord.includes(".setName('setup')")&&!/\.setName\('(visual|theme|panel)'\)/i.test(setupDiscord),'visual overhaul remains under the existing /setup root');

console.log(`phase27-visual-experience PASS · ${assertions} assertions · ${VISUAL_THEME_KEYS.length} themes · ${themeManifest.assets.length} theme media assets`);
