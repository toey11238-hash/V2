export type VisualThemeKey =
  | 'command-bridge'
  | 'aurora-grid'
  | 'royal-signal'
  | 'soft-lab'
  | 'arena-core'
  | 'obsidian-luxe'
  | 'celestial'
  | 'sakura-circuit'
  | 'tactical'
  | 'minimal-mono';

export type MotionPreset = 'STATIC' | 'BALANCED' | 'ANIMATED' | 'CINEMATIC';
export type PanelDensity = 'COMPACT' | 'COMFORTABLE' | 'SPACIOUS';
export type ChannelDecorationPreset = 'CLEAN' | 'SIGNAL' | 'ICONIC';
export type RoleVisualStyle = 'CLASSIC' | 'THEMED' | 'ENHANCED';
export type MediaDensity = 'MINIMAL' | 'BALANCED' | 'RICH';
export type ServerPulseState = 'IDLE' | 'ACTIVE' | 'READY' | 'LIVE' | 'SUCCESS' | 'WATCH' | 'DEGRADED' | 'INCIDENT' | 'MAINTENANCE' | 'SYNCING' | 'RECOVERY';
export const SERVER_PULSE_STATES: readonly ServerPulseState[] = ['IDLE','ACTIVE','READY','LIVE','SUCCESS','WATCH','DEGRADED','INCIDENT','MAINTENANCE','SYNCING','RECOVERY'];

export type VisualSceneKey='CALM'|'BALANCED'|'SHOWCASE'|'LIVE'|'OPERATIONS';
export const VISUAL_SCENE_PRESETS:Record<VisualSceneKey,{label:string;note:string;motionPreset:MotionPreset;panelDensity:PanelDensity;channelDecoration:ChannelDecorationPreset;roleVisualStyle:RoleVisualStyle;mediaDensity:MediaDensity}>={
  CALM:{label:'สงบนิ่ง',note:'ภาพนิ่ง เรียบหรู ใช้สื่อน้อย เหมาะกับงานควบคุมระบบ',motionPreset:'STATIC',panelDensity:'COMFORTABLE',channelDecoration:'CLEAN',roleVisualStyle:'THEMED',mediaDensity:'MINIMAL'},
  BALANCED:{label:'สมดุล',note:'ค่าเริ่มต้นระดับพรีเมียม เคลื่อนไหวอย่างพอดี',motionPreset:'BALANCED',panelDensity:'COMFORTABLE',channelDecoration:'SIGNAL',roleVisualStyle:'THEMED',mediaDensity:'BALANCED'},
  SHOWCASE:{label:'โชว์เคส',note:'พื้นที่โปร่ง เน้นแบรนด์และการนำเสนอที่โดดเด่น',motionPreset:'ANIMATED',panelDensity:'SPACIOUS',channelDecoration:'ICONIC',roleVisualStyle:'ENHANCED',mediaDensity:'RICH'},
  LIVE:{label:'สด',note:'ขับการเคลื่อนไหวจากสถานะจริงของชุมชน',motionPreset:'CINEMATIC',panelDensity:'COMFORTABLE',channelDecoration:'ICONIC',roleVisualStyle:'ENHANCED',mediaDensity:'RICH'},
  OPERATIONS:{label:'ปฏิบัติการ',note:'ข้อมูลแน่น สัญญาณชัด ลดสื่อประดับที่ไม่จำเป็น',motionPreset:'BALANCED',panelDensity:'COMPACT',channelDecoration:'SIGNAL',roleVisualStyle:'THEMED',mediaDensity:'MINIMAL'},
};
export function visualScenePatch(scene:VisualSceneKey){const {motionPreset,panelDensity,channelDecoration,roleVisualStyle,mediaDensity}=VISUAL_SCENE_PRESETS[scene];return{motionPreset,panelDensity,channelDecoration,roleVisualStyle,mediaDensity};}

export interface ThemeTokens {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  muted: string;
  accent: string;
  accentSecondary: string;
  accentTertiary: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  glow: string;
}

export interface VisualThemePack {
  key: VisualThemeKey;
  label: string;
  note: string;
  mode: 'DARK' | 'LIGHT';
  motif: 'ORBIT' | 'GRID' | 'WAVE' | 'BRACKET' | 'SHIELD' | 'NODE' | 'PETAL' | 'RASTER' | 'MONO';
  signature: string;
  tokens: ThemeTokens;
  rolePalette: readonly [number, number, number, number, number, number, number, number];
}

const t = (pack: VisualThemePack): VisualThemePack => pack;

export const VISUAL_THEME_PACKS: Record<VisualThemeKey, VisualThemePack> = {
  'command-bridge': t({
    key:'command-bridge', label:'สะพานบัญชาการ', note:'กรมท่าลึกตัดโคบอลต์สำหรับศูนย์ควบคุม', mode:'DARK', motif:'ORBIT', signature:'วงโคจรชีพจรเซิร์ฟเวอร์จากข้อมูลจริง',
    tokens:{canvas:'#070C19',surface:'#0E1730',surfaceRaised:'#142044',text:'#F4F7FF',muted:'#A8B4CF',accent:'#5B7CFA',accentSecondary:'#B8E5FF',accentTertiary:'#F5B544',success:'#39D98A',warning:'#F5B544',danger:'#F45B69',border:'#2A3658',glow:'#6F8EFF'},
    rolePalette:[0x5b7cfa,0xb8e5ff,0x9a7cff,0x49d4ff,0x39d98a,0xf5b544,0xf45b69,0x72809b],
  }),
  'aurora-grid': t({
    key:'aurora-grid', label:'โครงข่ายออโรรา', note:'ไซแอนขั้วโลกตัดไวโอเลตแบบโครงสัญญาณ', mode:'DARK', motif:'GRID', signature:'โครงแสงออโรราที่ตอบสนองต่อกิจกรรมสด',
    tokens:{canvas:'#071217',surface:'#0B1C25',surfaceRaised:'#102936',text:'#F1FDFF',muted:'#99C5CF',accent:'#31D6E7',accentSecondary:'#9F7CFF',accentTertiary:'#71F7C3',success:'#43E6A2',warning:'#FFD166',danger:'#FF6B8A',border:'#1F4451',glow:'#31D6E7'},
    rolePalette:[0x31d6e7,0x9f7cff,0x71f7c3,0x6fbfff,0x43e6a2,0xffd166,0xff6b8a,0x6e8f99],
  }),
  'royal-signal': t({
    key:'royal-signal', label:'สัญญาณราชัน', note:'อินดิโก้ตัดทองแชมเปญสำหรับงานกำกับดูแล', mode:'DARK', motif:'BRACKET', signature:'รางสัญญาณทองล้อมสถานะการกำกับระบบ',
    tokens:{canvas:'#0C0B18',surface:'#16132A',surfaceRaised:'#211B3D',text:'#FFF8E8',muted:'#C3B8D4',accent:'#7868E6',accentSecondary:'#E8C66A',accentTertiary:'#C7A8FF',success:'#58D6A9',warning:'#E8C66A',danger:'#E9657B',border:'#3B3158',glow:'#9D8CFF'},
    rolePalette:[0x7868e6,0xe8c66a,0xc7a8ff,0x9988f5,0x58d6a9,0xf0b95d,0xe9657b,0x80758f],
  }),
  'soft-lab': t({
    key:'soft-lab', label:'ห้องทดลองนุ่มนวล', note:'พื้นที่วิจัยและสร้างสรรค์ที่สว่าง อ่านง่าย', mode:'LIGHT', motif:'NODE', signature:'แผนผังโหนดสงบพร้อมหมุดสถานะแม่นยำ',
    tokens:{canvas:'#EEF4F7',surface:'#F9FCFD',surfaceRaised:'#FFFFFF',text:'#13202B',muted:'#60717F',accent:'#3567D6',accentSecondary:'#6C52B8',accentTertiary:'#1B9C86',success:'#1B9C86',warning:'#B87918',danger:'#C94F67',border:'#C9D7DF',glow:'#82A8FF'},
    rolePalette:[0x3567d6,0x6c52b8,0x1b9c86,0x3d94bf,0x55a68f,0xb87918,0xc94f67,0x74828b],
  }),
  'arena-core': t({
    key:'arena-core', label:'แกนอารีนา', note:'น้ำเงินไฟฟ้าตัดประกายส้มสำหรับการแข่งขัน', mode:'DARK', motif:'BRACKET', signature:'สายการแข่งขันเต้นตามสถานะเซสชันจริง',
    tokens:{canvas:'#070B12',surface:'#101827',surfaceRaised:'#17253A',text:'#F5FAFF',muted:'#9FB0C6',accent:'#2E8BFF',accentSecondary:'#FF7A45',accentTertiary:'#9C7CFF',success:'#3FE0A1',warning:'#FFC857',danger:'#FF526B',border:'#253A58',glow:'#2E8BFF'},
    rolePalette:[0x2e8bff,0xff7a45,0x9c7cff,0x35c4ff,0x3fe0a1,0xffc857,0xff526b,0x66788d],
  }),
  'obsidian-luxe': t({
    key:'obsidian-luxe', label:'ออบซิเดียนลักซ์', note:'แร่ดำตัดแชมเปญอย่างประณีตและหรูหรา', mode:'DARK', motif:'RASTER', signature:'เหลี่ยมออบซิเดียนพร้อมสัญญาณแชมเปญที่สุขุม',
    tokens:{canvas:'#050607',surface:'#0C0E10',surfaceRaised:'#15181B',text:'#F8F4EC',muted:'#A8A29A',accent:'#D7B978',accentSecondary:'#EAE1D0',accentTertiary:'#8FA6A2',success:'#79C9A5',warning:'#D7B978',danger:'#D46E77',border:'#2D2E2E',glow:'#D7B978'},
    rolePalette:[0xd7b978,0xeae1d0,0x8fa6a2,0x9aa8bb,0x79c9a5,0xd9a85d,0xd46e77,0x77746e],
  }),
  'celestial': t({
    key:'celestial', label:'จักรวาลราตรี', note:'ราตรีลึก อัลตราไวโอเลต และน้ำแข็งดาวหาง', mode:'DARK', motif:'ORBIT', signature:'วงโคจรจักรวาลผูกกับสุขภาพเซิร์ฟเวอร์',
    tokens:{canvas:'#060817',surface:'#0D1230',surfaceRaised:'#171E48',text:'#F7F5FF',muted:'#A9ADD4',accent:'#725CFF',accentSecondary:'#9BE7FF',accentTertiary:'#FFB7E7',success:'#58E2B1',warning:'#FFD06A',danger:'#FF6689',border:'#2B3261',glow:'#8A77FF'},
    rolePalette:[0x725cff,0x9be7ff,0xffb7e7,0x638cff,0x58e2b1,0xffd06a,0xff6689,0x777ca7],
  }),
  'sakura-circuit': t({
    key:'sakura-circuit', label:'วงจรซากุระ', note:'หมึกกรมท่า ซากุระ และมิ้นต์แบบวงจรดิจิทัล', mode:'DARK', motif:'PETAL', signature:'กลีบวงจรเต้นเฉพาะเมื่อมีเหตุการณ์จริง',
    tokens:{canvas:'#0D1019',surface:'#151A28',surfaceRaised:'#20283A',text:'#FFF7FB',muted:'#C0AEBB',accent:'#F38AB4',accentSecondary:'#7DE2D1',accentTertiary:'#9E8BFF',success:'#65D9A6',warning:'#F2C166',danger:'#F05F7C',border:'#3A3342',glow:'#F38AB4'},
    rolePalette:[0xf38ab4,0x7de2d1,0x9e8bff,0x78baff,0x65d9a6,0xf2c166,0xf05f7c,0x827786],
  }),
  'tactical': t({
    key:'tactical', label:'ยุทธวิธี', note:'สเลตตัดอำพันและเขียวสนามสำหรับงานปฏิบัติการ', mode:'DARK', motif:'SHIELD', signature:'กรอบเล็งล้อมสถานะที่ลงมือจัดการได้จริง',
    tokens:{canvas:'#0A0D0D',surface:'#121817',surfaceRaised:'#1C2421',text:'#F0F3EC',muted:'#A5AEA2',accent:'#B5D66F',accentSecondary:'#F0B85E',accentTertiary:'#79A8A0',success:'#78C98D',warning:'#F0B85E',danger:'#E26868',border:'#313C36',glow:'#B5D66F'},
    rolePalette:[0xb5d66f,0xf0b85e,0x79a8a0,0x7aa0c3,0x78c98d,0xdba34c,0xe26868,0x737c74],
  }),
  'minimal-mono': t({
    key:'minimal-mono', label:'โมโนมินิมอล', note:'กราไฟต์ กระดาษ และสัญญาณน้ำเงินเส้นเดียว', mode:'LIGHT', motif:'MONO', signature:'สัญญาณเดียว ชัดเจน และไร้สิ่งประดับเกินจำเป็น',
    tokens:{canvas:'#F4F5F6',surface:'#FFFFFF',surfaceRaised:'#F9FAFB',text:'#171A1F',muted:'#68707A',accent:'#315DDB',accentSecondary:'#15181D',accentTertiary:'#8B95A1',success:'#248A62',warning:'#A66B12',danger:'#B84B5A',border:'#D4D8DE',glow:'#718FE9'},
    rolePalette:[0x315ddb,0x15181d,0x8b95a1,0x4d78b8,0x248a62,0xa66b12,0xb84b5a,0x767d86],
  }),
};

export const VISUAL_THEME_OPTIONS = Object.values(VISUAL_THEME_PACKS).map(({key,label,note})=>({key,label,note}));
export const VISUAL_THEME_KEYS = Object.keys(VISUAL_THEME_PACKS) as VisualThemeKey[];

export function resolveThemePack(key: string | undefined): VisualThemePack {
  return VISUAL_THEME_PACKS[(key && key in VISUAL_THEME_PACKS ? key : 'command-bridge') as VisualThemeKey];
}

export function hexToInt(hex: string): number {
  const value=hex.replace('#','');
  if(!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error(`VISUAL_COLOR_INVALID:${hex}`);
  return Number.parseInt(value,16);
}

const familySlots: Record<string,number> = {
  ONBOARDING:0, IDENTITY:2, COMMUNITY:1, KNOWLEDGE:3, MEMBER_SERVICES:4, PARTNERSHIPS:5,
  SUPPORT:5, OPERATIONS:0, TRUST:6, AUTOMATION:3, ANALYTICS:1, CHANGE:5, EVENTS:5, MEDIA:2,
  GAMING:0, CREATOR:2, EDUCATION:3, BUSINESS:4, VISUAL:2,
};

export function panelAccentForFamily(themeKey: string | undefined, family: string): number {
  const theme=resolveThemePack(themeKey);
  const slot=familySlots[family] ?? 0;
  return theme.rolePalette[slot % theme.rolePalette.length] ?? hexToInt(theme.tokens.accent);
}

export interface RoleVisualProfile {
  color: number;
  colors?: { primaryColor:number; secondaryColor?:number|null; tertiaryColor?:number|null };
  unicodeEmoji?: string;
}

const roleGlyphByModule: Record<string,string> = {
  staff:'◆', operations:'◆', security:'◈', moderation:'◈', tickets:'◇', support:'◇', events:'✦', gaming:'🎮', creator:'✦', education:'◎', business:'◆', partnerships:'◇', community:'✦', 'community-programs':'✦', knowledge:'◎', analytics:'◉', automation:'◉', onboarding:'◇', verification:'✓', notifications:'◉', identity:'✦', voice:'◉', 'change-control':'◆', applications:'◇', localization:'◎',
};

function roleSlot(logicalKey:string,module:string):number{
  if(/SECURITY|MODERATOR|INCIDENT/.test(logicalKey)||['security','moderation'].includes(module))return 6;
  if(/ADMIN|MANAGER|LEAD|OWNER|RELEASE/.test(logicalKey)||['staff','operations','change-control'].includes(module))return 0;
  if(/SUPPORT|HELPER|TICKET|EVENT/.test(logicalKey)||['support','tickets','events'].includes(module))return 5;
  if(/GAMER|CLAN|TEAM|RAID|TOURNAMENT/.test(logicalKey)||module==='gaming')return 0;
  if(/CREATOR|STREAMER|ARTIST|WRITER|DESIGNER/.test(logicalKey)||module==='creator')return 2;
  if(/EDUCATOR|MENTOR|TUTOR|LEARNER|STUDY/.test(logicalKey)||module==='education')return 3;
  if(/PARTNER|VENDOR|CUSTOMER|BUSINESS/.test(logicalKey)||['business','partnerships'].includes(module))return 4;
  if(/AMBASSADOR|GREETER|VOLUNTEER|TRANSLATOR|GUIDE/.test(logicalKey))return 1;
  return 7;
}

export function roleVisualProfile(input:{themeKey?:string;style:RoleVisualStyle;logicalKey:string;module:string;enhancedColors:boolean;roleIcons:boolean}):RoleVisualProfile{
  const theme=resolveThemePack(input.themeKey);
  const slot=roleSlot(input.logicalKey,input.module);
  const primary=theme.rolePalette[slot] ?? hexToInt(theme.tokens.accent);
  if(input.style==='CLASSIC') return {color:primary};
  const emoji=input.roleIcons ? (roleGlyphByModule[input.module] ?? '✦') : undefined;
  if(input.style==='ENHANCED'&&input.enhancedColors){
    const secondary=theme.rolePalette[(slot+1)%theme.rolePalette.length] ?? hexToInt(theme.tokens.accentSecondary);
    return {color:primary,colors:{primaryColor:primary,secondaryColor:secondary,tertiaryColor:null},unicodeEmoji:emoji};
  }
  return {color:primary,colors:{primaryColor:primary,secondaryColor:null,tertiaryColor:null},unicodeEmoji:emoji};
}

const moduleGlyph: Record<string,string> = {
  onboarding:'✦', verification:'✦', community:'◆', 'community-programs':'◆', gaming:'◈', voice:'◎', operations:'⚙', diagnostics:'⚙', security:'◇', moderation:'◇', tickets:'◇', support:'◇', events:'✦', creator:'✧', education:'◎', business:'◆', knowledge:'◇', analytics:'◉', automation:'◉', 'asset-fabric':'✦', 'visual-experience':'✦', 'reliability-ops':'⚙', 'member-services':'◇', partnerships:'◇',
};

export function decorateResourceName(input:{kind:string;name:string;module:string;preset:ChannelDecorationPreset}):string{
  if(input.preset==='CLEAN')return input.name;
  const glyph=moduleGlyph[input.module] ?? '◆';
  if(input.kind==='CATEGORY'){
    const stripped=input.name.replace(/^[✦◆◈◇◎⚙✧◉]\s*/u,'');
    return `${glyph} ${stripped}`.slice(0,100);
  }
  if(input.kind==='VOICE_CHANNEL'&&input.preset==='ICONIC'&&!/^[🎮🎙️🔊◉◎✦◆◈]/u.test(input.name)) return `${glyph} ${input.name}`.slice(0,100);
  return input.name;
}

export interface ServerPulseEvidence {
  criticalIncidents?: number;
  degradedComponents?: number;
  watchComponents?: number;
  activeSessions?: number;
  readySessions?: number;
  syncingJobs?: number;
  recoveryActive?: boolean;
  maintenanceActive?: boolean;
  lastEventAt?: string | null;
}

export interface ServerPulse {
  state: ServerPulseState;
  intensity: number;
  reason: string;
  stale: boolean;
}

export function deriveServerPulse(evidence:ServerPulseEvidence,nowMs=Date.now()):ServerPulse{
  const last=evidence.lastEventAt?Date.parse(evidence.lastEventAt):Number.NaN;
  const stale=Number.isFinite(last)&&nowMs-last>5*60_000;
  if((evidence.criticalIncidents??0)>0)return{state:'INCIDENT',intensity:1,reason:'critical incident open',stale};
  if(evidence.recoveryActive)return{state:'RECOVERY',intensity:.9,reason:'recovery workflow active',stale};
  if(evidence.maintenanceActive)return{state:'MAINTENANCE',intensity:.7,reason:'maintenance active',stale};
  if((evidence.degradedComponents??0)>0)return{state:'DEGRADED',intensity:.82,reason:'degraded component evidence',stale};
  if((evidence.readySessions??0)>0)return{state:'READY',intensity:.72,reason:'gaming session ready',stale};
  if((evidence.activeSessions??0)>0)return{state:'LIVE',intensity:.78,reason:'live gaming/session activity',stale};
  if((evidence.syncingJobs??0)>0)return{state:'SYNCING',intensity:.58,reason:'durable work in progress',stale};
  if((evidence.watchComponents??0)>0)return{state:'WATCH',intensity:.48,reason:'watch threshold reached',stale};
  if(stale)return{state:'WATCH',intensity:.32,reason:'event evidence stale',stale:true};
  return{state:'IDLE',intensity:.22,reason:'no elevated state evidence',stale:false};
}

export function pulseColor(themeKey:string|undefined,state:ServerPulseState):string{
  const t=resolveThemePack(themeKey).tokens;
  if(state==='INCIDENT'||state==='DEGRADED')return t.danger;
  if(state==='WATCH'||state==='MAINTENANCE')return t.warning;
  if(state==='SUCCESS'||state==='READY')return t.success;
  if(state==='RECOVERY')return t.accentTertiary;
  if(state==='LIVE'||state==='SYNCING'||state==='ACTIVE')return t.accent;
  return t.accentSecondary;
}

export function visualMediaMode(input:{motionPreset:MotionPreset;mediaDensity:MediaDensity;reducedMotion?:boolean;state?:ServerPulseState}):'NONE'|'STATIC'|'MOTION'{
  if(input.mediaDensity==='MINIMAL')return'NONE';
  if(input.reducedMotion||input.motionPreset==='STATIC')return'STATIC';
  if(input.motionPreset==='CINEMATIC')return'MOTION';
  if(input.motionPreset==='ANIMATED')return'MOTION';
  if(['LIVE','INCIDENT','RECOVERY','SYNCING','READY'].includes(input.state??'IDLE'))return'MOTION';
  return'STATIC';
}

export function themePulseAssetPath(themeKey:string|undefined,state:ServerPulseState,mode:'STATIC'|'MOTION'):string{
  const key=resolveThemePack(themeKey).key;
  return `themes/${key}/pulse-${state.toLowerCase()}.${mode==='MOTION'?'gif':'png'}`;
}

export function dashboardThemeVariables(themeKey:string|undefined):Record<string,string>{
  const {tokens}=resolveThemePack(themeKey);
  return {
    '--theme-canvas':tokens.canvas,'--theme-surface':tokens.surface,'--theme-surface-raised':tokens.surfaceRaised,'--theme-text':tokens.text,'--theme-muted':tokens.muted,
    '--theme-accent':tokens.accent,'--theme-accent-secondary':tokens.accentSecondary,'--theme-accent-tertiary':tokens.accentTertiary,'--theme-success':tokens.success,'--theme-warning':tokens.warning,'--theme-danger':tokens.danger,'--theme-border':tokens.border,'--theme-glow':tokens.glow,
  };
}


export type RealtimeVisualFxKind = 'JOIN'|'LEVEL_UP'|'TICKET'|'SECURITY'|'STATUS'|'EVENT'|'JOB'|'GAMING'|'GENERIC';
export type RealtimeVisualFxMotion = 'BURST'|'ORBIT'|'RIPPLE'|'SHIELD'|'ENERGY'|'LIFT'|'WAVE';
export interface RealtimeVisualDirective {
  kind:RealtimeVisualFxKind;
  motion:RealtimeVisualFxMotion;
  emoji:string;
  label:string;
  intensity:number;
  particleCount:number;
  durationMs:number;
  priority:number;
}

const fx=(kind:RealtimeVisualFxKind,motion:RealtimeVisualFxMotion,emoji:string,label:string,intensity:number,particleCount:number,durationMs:number,priority:number):RealtimeVisualDirective=>({kind,motion,emoji,label,intensity,particleCount,durationMs,priority});

/** Maps real platform events to the visual runtime. No event means no event FX. */
export function deriveRealtimeVisualDirective(type:string,payload:Record<string,unknown>={}):RealtimeVisualDirective{
  const key=type.toLowerCase();
  if(key==='member.join'||key==='verification.succeeded') return fx('JOIN','BURST','✨','สมาชิกใหม่',0.72,22,1800,40);
  if(key.includes('level')||key==='gaming.xp.awarded'||key==='gaming.level.up') return fx('LEVEL_UP','LIFT','⬆️','เลเวลเพิ่มขึ้น',0.9,34,2300,65);
  if(key.startsWith('ticket.')||key.startsWith('tickets.')) return fx('TICKET','RIPPLE','🎫','ศูนย์ช่วยเหลือ',0.66,18,1800,45);
  if(key.startsWith('security.')||key.includes('incident')){
    const severity=String(payload.severity??'').toUpperCase();
    return fx('SECURITY','SHIELD','🛡️','สัญญาณความปลอดภัย',severity==='CRITICAL'||severity==='HIGH'?1:.82,30,2600,100);
  }
  if(key.includes('status')||key.startsWith('maintenance.')||key.startsWith('recovery.')||key.startsWith('restore.')) return fx('STATUS','WAVE','📡','สถานะระบบ',0.8,24,2200,80);
  if(key.startsWith('event.')||key.startsWith('events.')||key.startsWith('community.event.')) return fx('EVENT','ORBIT','🎟️','กิจกรรม',0.74,26,2100,55);
  if(key.includes('job.')||key.startsWith('scheduler.')||key.startsWith('setup.resource.')||key.startsWith('setup.job.')) return fx('JOB','ENERGY','⚡','งานระบบ',0.68,20,1900,50);
  if(key.startsWith('gaming.')||key.startsWith('game.')) return fx('GAMING','ORBIT','🎮','กิจกรรมเกม',0.78,28,2200,60);
  return fx('GENERIC','RIPPLE','•','กิจกรรมระบบ',0.42,12,1400,10);
}

export function visualPerformanceBudget(input:{reducedMotion:boolean;hidden:boolean;hardwareConcurrency?:number;deviceMemoryGb?:number;measuredFps?:number;motionPreset?:MotionPreset}){
  if(input.reducedMotion||input.motionPreset==='STATIC') return {tier:'STATIC' as const,targetFps:0,particleScale:0,parallax:false,shadows:false};
  if(input.hidden) return {tier:'PAUSED' as const,targetFps:0,particleScale:0,parallax:false,shadows:false};
  const weak=(input.hardwareConcurrency??8)<=4||(input.deviceMemoryGb??8)<=4||(input.measuredFps!==undefined&&input.measuredFps<42);
  if(weak) return {tier:'LITE' as const,targetFps:30,particleScale:.45,parallax:false,shadows:false};
  const cinematic=input.motionPreset==='CINEMATIC';
  return {tier:cinematic?'CINEMATIC' as const:'FULL' as const,targetFps:60,particleScale:cinematic?1:.72,parallax:true,shadows:true};
}

export function thaiServerPulseState(state:ServerPulseState):string{
  return ({IDLE:'สงบนิ่ง',ACTIVE:'กำลังทำงาน',READY:'พร้อม',LIVE:'กำลังสด',SUCCESS:'สำเร็จ',WATCH:'เฝ้าระวัง',DEGRADED:'ประสิทธิภาพลดลง',INCIDENT:'เหตุผิดปกติ',MAINTENANCE:'บำรุงรักษา',SYNCING:'กำลังซิงก์',RECOVERY:'กำลังกู้คืน'} as Record<ServerPulseState,string>)[state];
}

export function thaiServerPulseReason(reason:string):string{
  const map:Record<string,string>={
    'critical incident open':'มีเหตุผิดปกติระดับวิกฤตที่ยังเปิดอยู่',
    'recovery workflow active':'กระบวนการกู้คืนกำลังทำงาน',
    'maintenance active':'อยู่ในช่วงบำรุงรักษา',
    'degraded component evidence':'พบหลักฐานว่าบางองค์ประกอบทำงานลดลง',
    'gaming session ready':'เซสชันเกมพร้อมเริ่ม',
    'live gaming/session activity':'มีกิจกรรมเกมหรือเซสชันกำลังดำเนินอยู่',
    'durable work in progress':'มีงานแบบคงทนกำลังดำเนินการ',
    'watch threshold reached':'ถึงเกณฑ์ที่ต้องเฝ้าระวัง',
    'event evidence stale':'ข้อมูลเหตุการณ์ล่าสุดเก่าเกินเกณฑ์',
    'no elevated state evidence':'ไม่พบสถานะผิดปกติจากข้อมูลล่าสุด',
  };
  return map[reason]??reason;
}

export type VisualOrchestratorDecision='START'|'PREEMPT'|'MERGE'|'SUPPRESS'|'DUPLICATE';
export interface VisualOrchestratorState{
  activeEventId?:string;
  activeDirective?:RealtimeVisualDirective;
  activeUntil:number;
  activeStartedAt:number;
  recentEventIds:string[];
  suppressed:number;
  merged:number;
  preempted:number;
}
export interface VisualOrchestratorResult{
  decision:VisualOrchestratorDecision;
  accepted:boolean;
  directive:RealtimeVisualDirective;
  state:VisualOrchestratorState;
}
export const initialVisualOrchestratorState=():VisualOrchestratorState=>({activeUntil:0,activeStartedAt:0,recentEventIds:[],suppressed:0,merged:0,preempted:0});

/**
 * Coordinates realtime FX so operationally important evidence wins visual attention.
 * This function only schedules presentation; it never mutates domain state or publishes events.
 */
export function orchestrateRealtimeVisual(state:VisualOrchestratorState,input:{eventId:string;type:string;payload?:Record<string,unknown>;occurredAt?:string},nowMs=Date.now()):VisualOrchestratorResult{
  if(!input.eventId)throw new Error('VISUAL_ORCHESTRATOR_EVENT_ID_REQUIRED');
  const directive=deriveRealtimeVisualDirective(input.type,input.payload??{});
  if(state.recentEventIds.includes(input.eventId))return{decision:'DUPLICATE',accepted:false,directive,state};
  const recent=[...state.recentEventIds,input.eventId].slice(-96);
  const active=state.activeDirective;
  const expired=!active||state.activeUntil<=nowMs;
  if(expired){
    const next={...state,activeEventId:input.eventId,activeDirective:directive,activeStartedAt:nowMs,activeUntil:nowMs+directive.durationMs,recentEventIds:recent};
    return{decision:'START',accepted:true,directive,state:next};
  }
  if(active.kind===directive.kind&&nowMs-state.activeStartedAt<=900){
    const merged:RealtimeVisualDirective={...directive,intensity:Math.min(1,Math.max(active.intensity,directive.intensity)+.08),particleCount:Math.min(56,Math.max(active.particleCount,directive.particleCount)+Math.ceil(directive.particleCount*.35)),durationMs:Math.min(3200,Math.max(active.durationMs,directive.durationMs)+260),priority:Math.max(active.priority,directive.priority)};
    const next={...state,activeEventId:input.eventId,activeDirective:merged,activeUntil:Math.max(state.activeUntil,nowMs+merged.durationMs),recentEventIds:recent,merged:state.merged+1};
    return{decision:'MERGE',accepted:true,directive:merged,state:next};
  }
  if(directive.priority>=active.priority+15){
    const next={...state,activeEventId:input.eventId,activeDirective:directive,activeStartedAt:nowMs,activeUntil:nowMs+directive.durationMs,recentEventIds:recent,preempted:state.preempted+1};
    return{decision:'PREEMPT',accepted:true,directive,state:next};
  }
  if(active.priority>=directive.priority+20){
    const next={...state,recentEventIds:recent,suppressed:state.suppressed+1};
    return{decision:'SUPPRESS',accepted:false,directive,state:next};
  }
  const layered:RealtimeVisualDirective={...directive,particleCount:Math.max(6,Math.round(directive.particleCount*.72)),intensity:Math.max(.25,directive.intensity*.82),durationMs:Math.min(2200,directive.durationMs)};
  const next={...state,activeEventId:input.eventId,activeDirective:layered,activeStartedAt:nowMs,activeUntil:Math.max(state.activeUntil,nowMs+layered.durationMs),recentEventIds:recent};
  return{decision:'START',accepted:true,directive:layered,state:next};
}

export type VisualRuntimeTier='STATIC'|'PAUSED'|'LITE'|'FULL'|'CINEMATIC';
export interface VisualPerformanceGovernorState{tier:VisualRuntimeTier;lowFpsStreak:number;highFpsStreak:number;lastMeasuredFps:number|null}
export interface VisualPerformanceGovernorResult{state:VisualPerformanceGovernorState;budget:{tier:VisualRuntimeTier;targetFps:number;particleScale:number;parallax:boolean;shadows:boolean}}
export const initialVisualPerformanceGovernorState=(motionPreset:MotionPreset='BALANCED'):VisualPerformanceGovernorState=>({tier:motionPreset==='STATIC'?'STATIC':motionPreset==='CINEMATIC'?'CINEMATIC':'FULL',lowFpsStreak:0,highFpsStreak:0,lastMeasuredFps:null});
function budgetForRuntimeTier(tier:VisualRuntimeTier){
  if(tier==='STATIC'||tier==='PAUSED')return{tier,targetFps:0,particleScale:0,parallax:false,shadows:false};
  if(tier==='LITE')return{tier,targetFps:30,particleScale:.45,parallax:false,shadows:false};
  if(tier==='CINEMATIC')return{tier,targetFps:60,particleScale:1,parallax:true,shadows:true};
  return{tier,targetFps:60,particleScale:.72,parallax:true,shadows:true};
}

/** Uses hysteresis so one slow frame does not cause repeated FULL/LITE oscillation. */
export function updateVisualPerformanceGovernor(previous:VisualPerformanceGovernorState,input:{reducedMotion:boolean;hidden:boolean;hardwareConcurrency?:number;deviceMemoryGb?:number;measuredFps?:number;motionPreset?:MotionPreset}):VisualPerformanceGovernorResult{
  const preset=input.motionPreset??'BALANCED';
  if(input.reducedMotion||preset==='STATIC'){
    const state={tier:'STATIC' as const,lowFpsStreak:0,highFpsStreak:0,lastMeasuredFps:input.measuredFps??previous.lastMeasuredFps};return{state,budget:budgetForRuntimeTier(state.tier)};
  }
  if(input.hidden){const state={tier:'PAUSED' as const,lowFpsStreak:0,highFpsStreak:0,lastMeasuredFps:input.measuredFps??previous.lastMeasuredFps};return{state,budget:budgetForRuntimeTier(state.tier)};}
  const weak=(input.hardwareConcurrency??8)<=4||(input.deviceMemoryGb??8)<=4;
  if(weak){const state={tier:'LITE' as const,lowFpsStreak:Math.max(previous.lowFpsStreak,1),highFpsStreak:0,lastMeasuredFps:input.measuredFps??previous.lastMeasuredFps};return{state,budget:budgetForRuntimeTier(state.tier)};}
  const fps=input.measuredFps;
  let low=fps!==undefined&&fps<42?previous.lowFpsStreak+1:0;
  let high=fps!==undefined&&fps>=55?previous.highFpsStreak+1:0;
  let tier:VisualRuntimeTier=previous.tier==='STATIC'||previous.tier==='PAUSED'?(preset==='CINEMATIC'?'CINEMATIC':'FULL'):previous.tier;
  if((fps!==undefined&&fps<30&&low>=2)||low>=3){tier='LITE';high=0;}
  else if(tier==='LITE'&&high>=5){tier=preset==='CINEMATIC'?'CINEMATIC':'FULL';low=0;high=0;}
  else if(tier!=='LITE')tier=preset==='CINEMATIC'?'CINEMATIC':'FULL';
  const state={tier,lowFpsStreak:low,highFpsStreak:high,lastMeasuredFps:fps??previous.lastMeasuredFps};
  return{state,budget:budgetForRuntimeTier(tier)};
}
