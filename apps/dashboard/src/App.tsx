import { useEffect, useMemo, useState } from 'react';
import { Activity, Braces, Clock3, Database, Gamepad2, Images, LogIn, LogOut, Radio, Server, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { RealtimeVisualStage } from './components/RealtimeVisualStage';
import { Metric } from './components/Metric';
import { OperationalDeck } from './components/OperationalDeck';
import { RecoveryConsole } from './components/RecoveryConsole';
import { DiagnosticsConsole } from './components/DiagnosticsConsole';
import { StructureConsole } from './components/StructureConsole';
import { ChangeControlConsole } from './components/ChangeControlConsole';
import { GovernanceConsole } from './components/GovernanceConsole';
import { ReleaseTruthConsole } from './components/ReleaseTruthConsole';
import { AuditExplorer } from './components/AuditExplorer';
import { ThemeStudio } from './components/ThemeStudio';
import { DigitalTwinConsole, type DigitalTwinReport } from './components/DigitalTwinConsole';
import { OperationsIntelligenceConsole } from './components/OperationsIntelligenceConsole';
import { EventReplayConsole } from './components/EventReplayConsole';
import { LiveServerMap } from './components/LiveServerMap';
import { ServerPulseCard } from './components/ServerPulseCard';
import { dashboardThemeVariables } from '@autoserver/visual-system';
import { dashboardText } from './i18n';
import { thEventType, thModule, thValue } from './ui-thai';

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:10000';

type Health = {
  status: string;
  timestamp: string;
  maturity: string;
  processRole: string;
  components: {
    api: { status: string };
    database: { status: string; latencyMs?: number; detail?: string };
    discord: { status: string; pingMs?: number };
    worker: { status: string };
    realtime: { status: string; connectedClients: number };
  };
};

type Capabilities = {
  slashCommands: { registeredByPhase1: string[]; topLevelCeiling: number; secondSlot: string };
  modules: string[];
  gaming: string[];
  panels?: { count: number; families: string[]; managedDeployment: boolean; assetBacked: boolean };
  setupControl?: { durableDrafts: boolean; profiles: string[]; moduleOverrideKeys: string[] };
  deploymentProfile: { zeroMandatoryCost: boolean; renderFreeCompatible: boolean; limitation: string };
};


type AuthState = {
  configured: boolean;
  authenticated: boolean;
  session: null | {
    userId: string;
    user: { username?: string; global_name?: string | null; avatar?: string | null };
    guilds: GuildAccess[];
    expiresAt: string;
    csrfToken: string;
  };
};

type GuildAccess = { guildId: string; name: string; icon: string | null; permissions: string; owner: boolean; botPresent?: boolean };
type GuildOverview = { guildId: string; botPresent: boolean; name?: string; members: number | null; roles: number | null; channels: number | null; categories: number | null; gatewayAvailable?: boolean };
type BlueprintSummary = { key: string; version: number; displayName: string; description: string; complexity: string; enabledModules: string[]; resourceCount: number; resourceSummary: { roles:number; categories:number; textChannels:number; forumChannels:number; voiceChannels:number; panels:number } };
type SyncCadence='OFF'|'DAILY'|'WEEKLY';
type BudgetPolicy={enabled:boolean;mode:'OBSERVE'|'ENFORCE';windowSeconds:number;maxUnits:number};
type SetupDraft = { blueprintKey: string; themeKey: string; locale: 'th'; timezone: string; modulePreset: string; gamingPreset: string; securityPreset: string; automationPreset: string; motionPreset: string; panelDensity: 'COMPACT'|'COMFORTABLE'|'SPACIOUS'; channelDecoration:'CLEAN'|'SIGNAL'|'ICONIC'; roleVisualStyle:'CLASSIC'|'THEMED'|'ENHANCED'; mediaDensity:'MINIMAL'|'BALANCED'|'RICH'; moduleOverrides: Record<string,boolean>; games: string[]; retentionProfile: 'MINIMAL'|'BALANCED'|'EXTENDED_AUDIT'; approvalMode:'SAFE_DEFAULTS'|'STRICT'|'ENTERPRISE'; backupSchedule:'OFF'|'DAILY'|'WEEKLY'; backupHourLocal:number; backupWeekday:number; resourceLocks:string[]; admissionPreset:'BALANCED'|'CONSERVATIVE'|'MAX_AVAILABILITY'; aiProvider:'local-rules'|'openai-responses'; budgets:{providerSync:BudgetPolicy;analytics:BudgetPolicy;backup:BudgetPolicy;notificationFanout:BudgetPolicy;bulkAutomation:BudgetPolicy}; integrations:{riotDataDragon:{enabled:boolean;locale:string;syncCadence:SyncCadence};githubReleases:{enabled:boolean;owner:string;repo:string;includePrereleases:boolean;syncCadence:SyncCadence};discordStatus:{enabled:boolean;syncCadence:SyncCadence};steamNews:{enabled:boolean;appId:number;count:number;maxLength:number;syncCadence:SyncCadence}} };
type SetupPreview = { planHash: string; summary: Record<string, number>; actionableCount: number; conflicts: number; panelCount: number; totalUnits?:number; draftFingerprint?:string; impact?:{level:string;score:number;approvalRecommended:boolean}; configurationImpact?:{level:string;score:number;approvalRecommended:boolean;changedFields:string[];reasons:string[]}; digitalTwin?:DigitalTwinReport; lockChanges?:{lock:string[];unlock:string[]}; actions: Array<{ type: string; logicalKey: string; kind: string; name: string; risk: string; reason: string }> };
type JobState = { jobId: string; status: string; currentStep?: string; completedUnits: number; totalUnits?: number; correlationId: string };

type VisualExperienceEvidence={
  visual:{theme:string;motionPreset:string;panelDensity:string;channelDecoration:string;roleVisualStyle:string;mediaDensity:string};
  capabilities:{guildConnected:boolean;enhancedRoleColors:boolean;roleIcons:boolean;componentsV2:boolean};
  realtime:{eventBacked:boolean;durable:boolean;states:Array<{panelId:string;state:string;reason:string;revision:number;changedAt:string;expiresAt:string|null;lastRenderedAt:string|null}>};
  catalog:{themes:number;scenes:number;visualPanels:number};
};

type PlatformEvent = {
  eventId: string;
  type: string;
  occurredAt: string;
  guildId?: string;
  correlationId: string;
  payload: Record<string, unknown>;
};

const moduleGroups = {
  'สร้างและจัดโครงสร้าง': ['setup','scanner','planner','blueprints','permissions','panels','forums','asset-fabric','visual-experience'],
  'ชุมชนและตัวตน': ['onboarding','verification','roles','notifications','community-programs','knowledge','member-services','partnerships','accessibility','localization','discovery','member-care'],
  'ช่วยเหลือและความน่าเชื่อถือ': ['tickets','applications','suggestions','reports','moderation','security','trust-safety','approvals','privacy','retention'],
  'กิจกรรมและระบบอัตโนมัติ': ['events','event-studio','giveaways','scheduler','automation','voice','maintenance','change-control','release-ops'],
  'ข้อมูลและรันไทม์': ['realtime','assets','integrations','backup','repair','diagnostics','operations-intelligence','event-replay','digital-twin','analytics','data-observatory','recommendations','feature-flags','reliability-ops'],
  'ระบบเฉพาะทาง': ['gaming','lfg','teams','clans','tournaments','creator','education','business','project-lab','content-studio','knowledge-ops','member-ops','plugins','ai-hooks'],
};

const panelAssets = [
  ['welcome','ต้อนรับ'],['rules','กติกา'],['verify','ยืนยันตัวตน'],['roles','ยศ'],['notifications','การแจ้งเตือน'],['ticket','ศูนย์ช่วยเหลือ'],['application','ใบสมัคร'],['report','รายงาน'],['suggestion','ข้อเสนอแนะ'],['announcement','ประกาศ'],['help','ช่วยเหลือ'],
  ['security','ความปลอดภัย'],['status','สถานะ'],['staff','ทีมงาน'],['moderation','ดูแลชุมชน'],['backup','สำรองข้อมูล'],['repair','ซ่อมแซม'],['integrations','การเชื่อมต่อ'],['privacy','ความเป็นส่วนตัว'],['event','กิจกรรม'],['giveaway','รางวัลเข้าร่วมฟรี'],
  ['gaming-hub','ศูนย์เกม'],['lfg','หากลุ่มเล่น'],['team-clan','ทีมและแคลน'],['tournament','การแข่งขัน'],['profile','โปรไฟล์ผู้เล่น'],['game-event','กิจกรรมเกม'],['creator','ครีเอเตอร์'],['education','การเรียนรู้'],['business','ธุรกิจ'],
  ['server-guide','คู่มือเซิร์ฟเวอร์'],['community-programs','โครงการชุมชน'],['knowledge','คลังความรู้'],['member-services','บริการสมาชิก'],['partnerships','พันธมิตร'],['media-lab','ห้องสื่อ'],['voice-lounge','ห้องเสียง'],['automation-lab','ห้องระบบอัตโนมัติ'],['trust-center','ศูนย์ความน่าเชื่อถือ'],['data-observatory','หอดูข้อมูล'],['change-control','ควบคุมการเปลี่ยนแปลง'],['asset-fabric','คลังสื่อ'],['game-knowledge','ความรู้เกม'],['creator-network','เครือข่ายครีเอเตอร์'],['learning-paths','เส้นทางการเรียนรู้'],['service-operations','งานบริการ'],
  ['accessibility-center','ศูนย์การเข้าถึง'],['language-center','ศูนย์ภาษา'],['volunteer-center','อาสาสมัคร'],['ambassador-center','ตัวแทนชุมชน'],['tutorial-library','คลังคู่มือ'],['resource-directory','สารบัญทรัพยากร'],['permission-review','ตรวจสิทธิ์'],['incident-timeline','ลำดับเหตุผิดปกติ'],['recommendation-review','ตรวจคำแนะนำ'],['deployment-log','บันทึกการนำขึ้นระบบ'],['partner-review','ตรวจพันธมิตร'],['creator-analytics','วิเคราะห์ครีเอเตอร์'],['learning-analytics','วิเคราะห์การเรียนรู้'],['business-analytics','วิเคราะห์บริการ'],['customer-success','ดูแลลูกค้า'],['known-issues','ปัญหาที่ทราบ'],
  ['theme-studio','สตูดิโอภาพ'],['asset-gallery','แกลเลอรีสื่อ'],['role-gallery','แกลเลอรียศ'],['server-pulse','ชีพจรเซิร์ฟเวอร์'],['scene-presets','ฉากสำเร็จรูป'],
  ['member-directory','รายชื่อสมาชิก'],['interest-hub','ศูนย์ความสนใจ'],['community-calendar','ปฏิทินชุมชน'],['member-care','ดูแลสมาชิก'],['accessibility-requests','คำขอการเข้าถึง'],['project-lab','ห้องโครงการ'],['help-wanted','ประกาศขอความช่วยเหลือ'],['project-showcase','ผลงานโครงการ'],['event-studio','สตูดิโอกิจกรรม'],['event-registration','ลงทะเบียนกิจกรรม'],['event-recaps','สรุปกิจกรรม'],['content-studio','สตูดิโอเนื้อหา'],['media-review','ตรวจสื่อ'],['brand-assets','สื่อแบรนด์'],['knowledge-ops','ดูแลความรู้'],['member-ops','งานสมาชิก'],['reliability-ops','งานความน่าเชื่อถือ'],['capacity-planning','วางแผนขีดความสามารถ'],['provider-health','สุขภาพผู้ให้บริการ'],['recovery-drills','ซ้อมกู้คืน'],
] as const;
function since(timestamp?: string): string {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`;
  return `${Math.floor(seconds / 3600)} ชั่วโมงที่แล้ว`;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [visualExperience, setVisualExperience] = useState<VisualExperienceEvidence | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [restrictedStream, setRestrictedStream] = useState(true);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [guilds, setGuilds] = useState<GuildAccess[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [guildOverview, setGuildOverview] = useState<GuildOverview | null>(null);
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>({ blueprintKey:'hybrid-standard', themeKey:'command-bridge', locale:'th', timezone:'Asia/Bangkok', modulePreset:'FULL_PLATFORM', gamingPreset:'OFF', securityPreset:'STRICT', automationPreset:'SMART', motionPreset:'BALANCED', panelDensity:'COMFORTABLE', channelDecoration:'SIGNAL', roleVisualStyle:'THEMED', mediaDensity:'BALANCED', moduleOverrides:{}, games:[], retentionProfile:'BALANCED', approvalMode:'STRICT', backupSchedule:'WEEKLY', backupHourLocal:4, backupWeekday:0, resourceLocks:[], admissionPreset:'BALANCED', aiProvider:'local-rules', budgets:{providerSync:{enabled:true,mode:'ENFORCE',windowSeconds:3600,maxUnits:24},analytics:{enabled:true,mode:'ENFORCE',windowSeconds:3600,maxUnits:24},backup:{enabled:true,mode:'ENFORCE',windowSeconds:86400,maxUnits:8},notificationFanout:{enabled:true,mode:'OBSERVE',windowSeconds:600,maxUnits:2000},bulkAutomation:{enabled:true,mode:'ENFORCE',windowSeconds:600,maxUnits:120}}, integrations:{riotDataDragon:{enabled:false,locale:'th_TH',syncCadence:'WEEKLY'},githubReleases:{enabled:false,owner:'',repo:'',includePrereleases:false,syncCadence:'WEEKLY'},discordStatus:{enabled:false,syncCadence:'DAILY'},steamNews:{enabled:false,appId:570,count:10,maxLength:1200,syncCadence:'DAILY'}} });
  const [setupPreview, setSetupPreview] = useState<SetupPreview | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [latestJob, setLatestJob] = useState<JobState | null>(null);
  const [portableConfig, setPortableConfig] = useState('');
  const [portableMessage, setPortableMessage] = useState('');
  const uiLocale='th' as const;
  const ui=dashboardText.th;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(()=>{document.documentElement.lang='th';},[]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const eventUrl = new URL(`${API}/api/events/recent`);
        eventUrl.searchParams.set('limit', '30');
        if (selectedGuildId) eventUrl.searchParams.set('guildId', selectedGuildId);
        const [h, c, a, e, b] = await Promise.all([
          fetch(`${API}/health`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`${API}/api/capabilities`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`${API}/api/auth/status`, { credentials: 'include' }).then((r) => r.json()),
          fetch(eventUrl, { credentials: 'include' }).then((r) => r.json()),
          fetch(`${API}/api/blueprints`, { credentials: 'include' }).then((r) => r.json()),
        ]);
        if (!cancelled) {
          setHealth(h); setCapabilities(c); setAuth(a); setEvents(e.events ?? []); setBlueprints(b.blueprints ?? []); setRestrictedStream(Boolean(e.restricted)); setError(null);
        }
        if (a.authenticated) {
          const g = await fetch(`${API}/api/guilds`, { credentials: 'include' }).then((r) => r.ok ? r.json() : { guilds: [] });
          if (!cancelled) {
            setGuilds(g.guilds ?? []);
            if (!selectedGuildId && g.guilds?.length) setSelectedGuildId(g.guilds[0].guildId);
          }
        } else if (!cancelled) {
          setGuilds([]); setSelectedGuildId(''); setGuildOverview(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อ API ได้');
      }
    };
    void load();
    const interval = window.setInterval(load, 20_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [selectedGuildId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let closed = false;
    const connect = () => {
      const wsUrl = API.replace(/^http/, 'ws') + '/ws';
      socket = new WebSocket(wsUrl);
      socket.onopen = () => { setConnected(true); setError(null); };
      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          if (data.type === 'event' && data.event && (!selectedGuildId || !data.event.guildId || data.event.guildId === selectedGuildId)) setEvents((current) => [data.event, ...current].slice(0, 50));
          if (data.type === 'auth') setRestrictedStream(Boolean(data.restricted));
          if (data.type === 'hello') setRestrictedStream(true);
        } catch { /* ignored malformed client frame */ }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(connect, 2500);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { closed = true; if (retry) clearTimeout(retry); socket?.close(); };
  }, [selectedGuildId]);

  useEffect(() => {
    if (!selectedGuildId || !auth?.authenticated) return;
    let cancelled = false;
    void fetch(`${API}/api/guilds/${selectedGuildId}/blueprints`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data?.blueprints) setBlueprints(data.blueprints); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedGuildId, auth?.authenticated]);

  useEffect(() => {
    if (!selectedGuildId || !auth?.authenticated) return;
    let cancelled=false;
    setSetupPreview(null);
    void fetch(`${API}/api/guilds/${selectedGuildId}/setup/current`,{credentials:'include'})
      .then(async(response)=>{const data=await response.json(); if(!response.ok)throw new Error(data.message||data.error||'โหลดสถานะการตั้งค่าไม่สำเร็จ'); return data;})
      .then((data)=>{if(!cancelled&&data?.draft){setSetupDraft({...data.draft,locale:'th'});setError(null);}})
      .catch((err)=>{if(!cancelled)setError(err instanceof Error?err.message:'โหลดสถานะการตั้งค่าไม่สำเร็จ');});
    return ()=>{cancelled=true;};
  },[selectedGuildId,auth?.authenticated]);

  useEffect(() => {
    if (!selectedGuildId || !auth?.authenticated) { setVisualExperience(null); return; }
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      void fetch(`${API}/api/guilds/${selectedGuildId}/visual-experience`,{credentials:'include',signal:controller.signal})
        .then(async(response)=>{const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'โหลดสถานะภาพไม่สำเร็จ');return data;})
        .then((data)=>{if(data?.visual&&data?.capabilities&&data?.realtime)setVisualExperience(data as VisualExperienceEvidence);})
        .catch((err)=>{if(err instanceof DOMException&&err.name==='AbortError')return;setVisualExperience(null);});
    },events[0]?.eventId?350:0);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[selectedGuildId,auth?.authenticated,events[0]?.eventId]);

  useEffect(() => {
    if (!selectedGuildId || !auth?.authenticated) { setGuildOverview(null); return; }
    let cancelled = false;
    void fetch(`${API}/api/guilds/${selectedGuildId}/overview`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled) setGuildOverview(data); })
      .catch(() => { if (!cancelled) setGuildOverview(null); });
    return () => { cancelled = true; };
  }, [selectedGuildId, auth?.authenticated]);

  const login = () => { window.location.assign(`${API}/api/auth/login`); };
  const logout = async () => {
    const csrf = auth?.session?.csrfToken;
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: csrf ? { 'x-csrf-token': csrf } : {} });
    setAuth((current) => current ? { ...current, authenticated: false, session: null } : current);
    setGuilds([]); setSelectedGuildId(''); setGuildOverview(null);
  };

  useEffect(() => {
    if (!selectedGuildId || !auth?.authenticated) { setLatestJob(null); return; }
    let stopped = false;
    let timer: number | undefined;
    const loadJob = async () => {
      try {
        const response = await fetch(`${API}/api/guilds/${selectedGuildId}/jobs/latest`, { credentials: 'include' });
        const data = response.ok ? await response.json() : { job: null };
        if (!stopped) setLatestJob(data.job ?? null);
      } finally {
        if (!stopped) timer = window.setTimeout(loadJob, 3000);
      }
    };
    void loadJob();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [selectedGuildId, auth?.authenticated]);

  const patchDraft = (patch: Partial<SetupDraft>) => { setSetupDraft((current) => ({ ...current, ...patch })); setSetupPreview(null); };
  const previewSetup = async () => {
    if (!selectedGuildId) return;
    setSetupBusy(true);
    try {
      const response = await fetch(`${API}/api/guilds/${selectedGuildId}/setup/preview`, { method:'POST', credentials:'include', headers:{ 'content-type':'application/json' }, body:JSON.stringify(setupDraft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'สร้างตัวอย่างการตั้งค่าไม่สำเร็จ');
      setSetupPreview(data); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'สร้างตัวอย่างการตั้งค่าไม่สำเร็จ'); }
    finally { setSetupBusy(false); }
  };
  const applySetup = async () => {
    if (!selectedGuildId || !setupPreview || !auth?.session?.csrfToken) return;
    setSetupBusy(true);
    try {
      const response = await fetch(`${API}/api/guilds/${selectedGuildId}/setup/apply`, { method:'POST', credentials:'include', headers:{ 'content-type':'application/json', 'x-csrf-token':auth.session.csrfToken }, body:JSON.stringify({ draft:setupDraft, planHash:setupPreview.planHash }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'นำการตั้งค่าไปใช้ไม่สำเร็จ');
      setSetupPreview(null); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'นำการตั้งค่าไปใช้ไม่สำเร็จ'); }
    finally { setSetupBusy(false); }
  };
  const exportPortableConfig = async () => {
    if (!selectedGuildId) return;
    try {
      const response = await fetch(`${API}/api/guilds/${selectedGuildId}/config/export`, { credentials:'include' });
      const data = await response.json(); if (!response.ok) throw new Error(data.message||data.error||'ส่งออกไม่สำเร็จ');
      setPortableConfig(JSON.stringify(data,null,2)); setPortableMessage('ส่งออกชุดตั้งค่าพกพาพร้อมเช็กซัมแล้ว');
    } catch (err) { setPortableMessage(err instanceof Error?err.message:'ส่งออกไม่สำเร็จ'); }
  };
  const previewPortableConfig = async () => {
    if (!selectedGuildId || !auth?.session?.csrfToken) return;
    try {
      const envelope=JSON.parse(portableConfig);
      const response=await fetch(`${API}/api/guilds/${selectedGuildId}/config/import-preview`,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':auth.session.csrfToken},body:JSON.stringify(envelope)});
      const data=await response.json(); if(!response.ok) throw new Error(data.message||data.error||'ตรวจสอบการนำเข้าไม่สำเร็จ');
      setSetupDraft(data.draft); setSetupPreview({planHash:data.planHash,summary:data.summary,actionableCount:data.actionableCount,conflicts:data.conflicts,panelCount:data.panelCount,totalUnits:data.totalUnits,draftFingerprint:data.draftFingerprint,impact:data.impact,configurationImpact:data.configurationImpact,lockChanges:data.lockChanges,actions:data.actions});
      setPortableMessage(`ตรวจสอบเซิร์ฟเวอร์ต้นทาง ${data.sourceGuildId} แล้ว และโหลดเข้าสู่ตัวอย่างการตั้งค่าโดยยังไม่ได้เปลี่ยนแปลงระบบจริง`);
    } catch (err) { setPortableMessage(err instanceof Error?err.message:'ตรวจสอบการนำเข้าไม่สำเร็จ'); }
  };

  const cancelLatestJob = async () => {
    if (!selectedGuildId || !latestJob || !auth?.session?.csrfToken) return;
    await fetch(`${API}/api/guilds/${selectedGuildId}/jobs/${latestJob.jobId}/cancel`, { method:'POST', credentials:'include', headers:{ 'x-csrf-token':auth.session.csrfToken } });
  };

  const lastEvent = events[0];
  const liveClients = health?.components.realtime.connectedClients ?? (connected ? 1 : 0);
  const healthLabel = health?.status ?? 'unknown';
  const dbLabel = health?.components.database.status ?? 'unknown';
  const discordLabel = health?.components.discord.status ?? 'unknown';

  const gamingBuckets = useMemo(() => {
    const all = capabilities?.gaming ?? [];
    return [
      { title: 'เล่นด้วยกัน', items: all.filter((x) => ['lfg','party','teams','clans','recruitment','voice'].includes(x)) },
      { title: 'แข่งขันอย่างปลอดภัย', items: all.filter((x) => ['scrims','tournaments','matches','events'].includes(x)) },
      { title: 'พัฒนาและสร้างสรรค์', items: all.filter((x) => ['xp','quests','achievements','seasonal-progression','guides','clips','coaching'].includes(x)) },
      { title: 'เชื่อมต่อ', items: all.filter((x) => ['game-registry','profiles','news-status-adapters'].includes(x)) },
    ];
  }, [capabilities]);

  const selectedBlueprint = useMemo(() => blueprints.find((blueprint) => blueprint.key === setupDraft.blueprintKey) ?? null, [blueprints, setupDraft.blueprintKey]);
  const themeVariables = useMemo(() => dashboardThemeVariables(setupDraft.themeKey) as React.CSSProperties, [setupDraft.themeKey]);

  return <div className="app-shell visual-shell" data-visual-theme={setupDraft.themeKey} style={themeVariables}>
    <header className="topbar">
      <div className="brand-lockup"><span className="brand-mark">อ</span><div><strong>ออโต้เซิร์ฟเวอร์</strong><span>ศูนย์ควบคุม · รุ่น 2</span></div></div>
      <div className="top-status">
        <span className="locale-lock" aria-label={ui.language}>ภาษาไทย</span>
        {auth?.authenticated ? <div className="identity-pill"><ShieldCheck size={14}/><span>{auth.session?.user.global_name || auth.session?.user.username || 'ผู้ดูแล Discord'}</span><button type="button" onClick={() => void logout()} aria-label={ui.signOut}><LogOut size={14}/></button></div>
          : <button className="discord-login" type="button" onClick={login} disabled={auth?.configured === false}><LogIn size={14}/>{auth?.configured === false ? ui.oauthMissing : ui.signIn}</button>}
        <span className={connected ? 'live-pill' : 'live-pill offline'}><Radio size={14}/>{connected ? (auth?.authenticated ? ui.live : restrictedStream ? ui.publicLive : 'ข้อมูลสด') : ui.reconnecting}</span>
        <span className="clock"><Clock3 size={14}/>{clock.toLocaleTimeString([], { hour12: false })}</span>
      </div>
    </header>

    <main>
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15}/> {ui.eyebrow}</div>
          <h1>{ui.heroA}<br/><em>{ui.heroB}</em></h1>
          <p className="lead">{ui.lead}</p>
          <div className="command-rail"><code>/setup</code><span>{ui.command}</span></div>
          {error && <div className="warning-strip">การเชื่อมต่อ API ผิดปกติ · {error}</div>}
        </div>
        <RealtimeVisualStage events={events} themeKey={setupDraft.themeKey} motionPreset={setupDraft.motionPreset} connected={connected} guildName={guildOverview?.name}/>
      </section>

      <section className="metric-grid" aria-label="สุขภาพระบบสด">
        <Metric label="แพลตฟอร์ม" value={thValue(healthLabel)} detail={health?.maturity ? thValue(health.maturity) : 'กำลังรอข้อมูลรันไทม์'} icon={<Server size={18}/>}/>
        <Metric label="Discord" value={thValue(discordLabel)} detail={health?.components.discord.pingMs != null ? `${health.components.discord.pingMs} มิลลิวินาที · หน่วงเกตเวย์` : 'ยังไม่มีค่าหน่วงเกตเวย์ที่วัดได้'} icon={<Activity size={18}/>}/>
        <Metric label="ฐานข้อมูล" value={thValue(dbLabel)} detail={health?.components.database.latencyMs != null ? `${health.components.database.latencyMs} มิลลิวินาที · คิวรี` : health?.components.database.detail ?? 'ยังไม่มีสัญญาณฐานข้อมูล'} icon={<Database size={18}/>}/>
        <Metric label="พื้นผิวคำสั่ง" value={`${capabilities?.slashCommands.registeredByPhase1.length ?? 0}/${capabilities?.slashCommands.topLevelCeiling ?? 2}`} detail="บังคับเพดานคำสั่งระดับบนสุดแล้ว" icon={<Braces size={18}/>}/>
      </section>

      <section className="guild-control" aria-label="ขอบเขตควบคุมเซิร์ฟเวอร์">
        <div className="guild-control-copy"><span className="kicker"><Users size={14}/> ขอบเขตเซิร์ฟเวอร์</span><h2>{auth?.authenticated ? 'ทำงานเฉพาะเซิร์ฟเวอร์ที่คุณมีสิทธิ์จัดการ' : 'Discord OAuth ควบคุมการเข้าถึงงานระดับเซิร์ฟเวอร์'}</h2><p>{auth?.authenticated ? 'API และข้อมูลเหตุการณ์สดถูกจำกัดเฉพาะเซิร์ฟเวอร์ที่ Discord ยืนยันว่าบัญชีนี้จัดการได้' : 'เข้าสู่ระบบเพื่อดูเซิร์ฟเวอร์ที่จัดการได้ ข้อมูลสุขภาพสาธารณะยังดูได้โดยไม่เปิดเผยข้อมูลสิทธิ์พิเศษ'}</p></div>
        <div className="guild-selector">
          <label htmlFor="guild-select">เซิร์ฟเวอร์ที่ใช้งาน</label>
          <select id="guild-select" value={selectedGuildId} onChange={(event) => setSelectedGuildId(event.target.value)} disabled={!guilds.length}>
            {!guilds.length && <option value="">ยังไม่ได้เลือกเซิร์ฟเวอร์</option>}
            {guilds.map((guild) => <option value={guild.guildId} key={guild.guildId}>{guild.name}{guild.botPresent ? '' : ' · ยังไม่ได้ติดตั้งบอต'}</option>)}
          </select>
          <div className="guild-mini-metrics">
            <span><strong>{guildOverview?.members ?? '—'}</strong> สมาชิก</span><span><strong>{guildOverview?.roles ?? '—'}</strong> ยศ</span><span><strong>{guildOverview?.channels ?? '—'}</strong> ช่อง</span>
          </div>
        </div>
      </section>

      <section className="setup-console panel" aria-label="ศูนย์ตั้งค่าระบบ">
        <div className="panel-heading"><div><span className="kicker"><Braces size={14}/> ศูนย์ตั้งค่าระบบ</span><h2>ตั้งค่าทุกระบบจากศูนย์กลางเดียวภายใต้การควบคุม</h2></div><div className="v2-badges"><span className="v2-badge">หน้าจอรุ่น 2</span><span className="safety-badge">/setup</span></div></div>
        <div className="fabric-v2-summary" aria-label="โครงสร้างแม่แบบเซิร์ฟเวอร์ที่เลือก">
          <div className="fabric-v2-intro"><span>โครงสร้างเซิร์ฟเวอร์รุ่น 2</span><strong>{selectedBlueprint?.displayName ?? 'เลือกแม่แบบเซิร์ฟเวอร์'}</strong><small>{selectedBlueprint?.description ?? 'โครงสร้างจะแสดงหลังโหลดรายการแม่แบบแล้ว'}</small></div>
          <div className="fabric-v2-stat"><b>{selectedBlueprint?.resourceSummary.categories ?? '—'}</b><span>หมวดหมู่</span></div>
          <div className="fabric-v2-stat"><b>{selectedBlueprint ? selectedBlueprint.resourceSummary.textChannels + selectedBlueprint.resourceSummary.forumChannels + selectedBlueprint.resourceSummary.voiceChannels : '—'}</b><span>ห้อง</span><small>{selectedBlueprint ? `${selectedBlueprint.resourceSummary.forumChannels} ฟอรัม · ${selectedBlueprint.resourceSummary.voiceChannels} ช่องเสียง` : '—'}</small></div>
          <div className="fabric-v2-stat"><b>{selectedBlueprint?.resourceSummary.roles ?? '—'}</b><span>ยศ</span></div>
          <div className="fabric-v2-stat"><b>{selectedBlueprint?.resourceSummary.panels ?? '—'}</b><span>แผงที่ระบบดูแล</span><small>คอมโพเนนต์รุ่น 2</small></div>
        </div>
        <div className="visual-command-grid">
          <ThemeStudio themeKey={setupDraft.themeKey} motionPreset={setupDraft.motionPreset} panelDensity={setupDraft.panelDensity} channelDecoration={setupDraft.channelDecoration} roleVisualStyle={setupDraft.roleVisualStyle} mediaDensity={setupDraft.mediaDensity} capabilities={visualExperience?.capabilities} liveStateCount={visualExperience?.realtime.states.length} onPatch={(patch)=>patchDraft(patch as Partial<SetupDraft>)}/>
          <div className="visual-side-stack"><ServerPulseCard themeKey={setupDraft.themeKey} healthStatus={health?.status} connected={connected} events={events} durableState={visualExperience?.realtime.states.find((state)=>state.panelId==='PANEL_SERVER_PULSE')??null}/><LiveServerMap name={selectedBlueprint?.displayName} summary={selectedBlueprint?.resourceSummary} live={connected&&Boolean(visualExperience?.realtime.eventBacked)} themeKey={setupDraft.themeKey}/></div>
        </div>
        <div className="setup-console-grid">
          <div className="setup-form">
            <label>แม่แบบ<select value={setupDraft.blueprintKey} onChange={(event) => patchDraft({ blueprintKey:event.target.value })}>{blueprints.map((blueprint) => <option value={blueprint.key} key={blueprint.key}>{blueprint.displayName} · {thValue(blueprint.complexity)}</option>)}</select></label>
            <label>โปรไฟล์ระบบ<select value={setupDraft.modulePreset} onChange={(event) => patchDraft({ modulePreset:event.target.value })}><option value="FULL_PLATFORM">แพลตฟอร์มเต็ม</option><option value="COMMUNITY">ชุมชน</option><option value="GAMING_MAX">เกมเต็มรูปแบบ</option><option value="CREATOR">ครีเอเตอร์</option><option value="EDUCATION">การเรียนรู้</option><option value="OPERATIONS">งานระบบ</option></select></label>
            <label>ระบบเกม<select value={setupDraft.gamingPreset} onChange={(event) => patchDraft({ gamingPreset:event.target.value })}><option value="OFF">ปิด</option><option value="COMMUNITY">ชุมชน</option><option value="COMPETITIVE">แข่งขัน</option><option value="MMO_GUILD">กิลด์ MMO</option><option value="FULL">เต็ม</option></select></label>
            <label>ความปลอดภัย<select value={setupDraft.securityPreset} onChange={(event) => patchDraft({ securityPreset:event.target.value })}><option value="STANDARD">มาตรฐาน</option><option value="STRICT">เข้มงวด</option><option value="ENTERPRISE">องค์กร</option></select></label>
            <label>ระบบอัตโนมัติ<select value={setupDraft.automationPreset} onChange={(event) => patchDraft({ automationPreset:event.target.value })}><option value="ESSENTIAL">จำเป็น</option><option value="SMART">อัจฉริยะ</option><option value="FULL">เต็ม</option></select></label>
                        <label>ภาษา<select value="th" disabled aria-label="ภาษาของระบบ"><option value="th">ไทย</option></select></label>
            <label>เขตเวลา<input value={setupDraft.timezone} onChange={(event)=>patchDraft({timezone:event.target.value})} placeholder="เช่น Asia/Bangkok"/></label>
            <label>การเก็บข้อมูล<select value={setupDraft.retentionProfile} onChange={(event)=>patchDraft({retentionProfile:event.target.value as SetupDraft['retentionProfile']})}><option value="MINIMAL">น้อย</option><option value="BALANCED">สมดุล</option><option value="EXTENDED_AUDIT">บันทึกตรวจสอบแบบขยาย</option></select></label>
            <label>การอนุมัติ<select value={setupDraft.approvalMode} onChange={(event)=>patchDraft({approvalMode:event.target.value as SetupDraft['approvalMode']})}><option value="SAFE_DEFAULTS">ค่าเริ่มต้นปลอดภัย</option><option value="STRICT">เข้มงวด</option><option value="ENTERPRISE">องค์กร</option></select></label>
            <label>การรับสมาชิก<select value={setupDraft.admissionPreset} onChange={(event)=>patchDraft({admissionPreset:event.target.value as SetupDraft['admissionPreset']})}><option value="BALANCED">สมดุล</option><option value="CONSERVATIVE">ระมัดระวัง</option><option value="MAX_AVAILABILITY">พร้อมใช้งานสูงสุด</option></select></label>
            <label>สำรองข้อมูลตามเวลา<select value={setupDraft.backupSchedule} onChange={(event)=>patchDraft({backupSchedule:event.target.value as SetupDraft['backupSchedule']})}><option value="OFF">ปิด</option><option value="DAILY">รายวัน</option><option value="WEEKLY">รายสัปดาห์</option></select></label>
            <label>ชั่วโมงสำรองข้อมูลตามเวลาท้องถิ่น<input type="number" min="0" max="23" value={setupDraft.backupHourLocal} onChange={(event)=>patchDraft({backupHourLocal:Math.max(0,Math.min(23,Number(event.target.value)||0))})}/></label>
            {setupDraft.backupSchedule==='WEEKLY'&&<label>วันสำรองข้อมูลประจำสัปดาห์<select value={setupDraft.backupWeekday} onChange={(event)=>patchDraft({backupWeekday:Number(event.target.value)})}><option value={0}>อาทิตย์</option><option value={1}>จันทร์</option><option value={2}>อังคาร</option><option value={3}>พุธ</option><option value={4}>พฤหัสบดี</option><option value={5}>ศุกร์</option><option value={6}>เสาร์</option></select></label>}
            <details className="setup-advanced"><summary>การควบคุมย่อย</summary><div className="advanced-grid">
              <label>คีย์เกม<input value={setupDraft.games.join(', ')} onChange={(event)=>patchDraft({games:event.target.value.split(',').map((value)=>value.trim()).filter(Boolean)})} placeholder="เช่น valorant, minecraft"/><small>ใช้คีย์คงที่ การเชื่อมต่อภายนอกยังถูกควบคุมด้วยความสามารถที่อนุญาต</small></label>
              <label>ทรัพยากรตรรกะที่ล็อก<input value={setupDraft.resourceLocks.join(', ')} onChange={(event)=>patchDraft({resourceLocks:event.target.value.split(',').map((value)=>value.trim()).filter(Boolean)})} placeholder="เช่น CHANNEL_RULES, ROLE_MEMBER"/><small>ระบบจะรายงานความคลาดเคลื่อนแต่จะไม่แก้ทรัพยากรที่ล็อกโดยอัตโนมัติ</small></label>
              <label>ผู้ให้บริการปัญญาประดิษฐ์<select value={setupDraft.aiProvider} onChange={(event)=>patchDraft({aiProvider:event.target.value as SetupDraft['aiProvider']})}><option value="local-rules">กฎภายใน · ค่าเริ่มต้น</option><option value="openai-responses">OpenAI Responses · เปิดใช้ภายนอกตามสิทธิ์</option></select><small>AI ภายนอกต้องเปิดใช้ฝั่งเซิร์ฟเวอร์ กำหนดรายการความสามารถ/ชั้นข้อมูลที่อนุญาตอย่างชัดเจน และมีสิทธิ์เซิร์ฟเวอร์จริง</small></label>
              <div className="provider-fabric"><span>การเชื่อมต่อผู้ให้บริการ · แสดงเฉพาะค่าที่เปิดเผยได้</span>
                <div className="provider-card"><strong>คลังข้อมูล Riot Data Dragon</strong><label className="checkline"><input type="checkbox" checked={setupDraft.integrations.riotDataDragon.enabled} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,riotDataDragon:{...setupDraft.integrations.riotDataDragon,enabled:event.target.checked}}})}/>เปิดใช้</label><select aria-label="ภาษาข้อมูล Riot Data Dragon" value={setupDraft.integrations.riotDataDragon.locale} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,riotDataDragon:{...setupDraft.integrations.riotDataDragon,locale:event.target.value}}})}><option value="th_TH">ไทย (th_TH)</option><option value="en_US">อังกฤษ (en_US)</option><option value="ja_JP">ญี่ปุ่น (ja_JP)</option><option value="ko_KR">เกาหลี (ko_KR)</option><option value="zh_TW">จีนไต้หวัน (zh_TW)</option></select><select aria-label="รอบซิงก์ Riot Data Dragon" value={setupDraft.integrations.riotDataDragon.syncCadence} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,riotDataDragon:{...setupDraft.integrations.riotDataDragon,syncCadence:event.target.value as SyncCadence}}})}><option value="OFF">ปิด</option><option value="DAILY">รายวัน</option><option value="WEEKLY">รายสัปดาห์</option></select></div>
                <div className="provider-card"><strong>รุ่นเผยแพร่จาก GitHub</strong><label className="checkline"><input type="checkbox" checked={setupDraft.integrations.githubReleases.enabled} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,githubReleases:{...setupDraft.integrations.githubReleases,enabled:event.target.checked}}})}/>เปิดใช้</label><input aria-label="เจ้าของคลัง GitHub" value={setupDraft.integrations.githubReleases.owner} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,githubReleases:{...setupDraft.integrations.githubReleases,owner:event.target.value}}})} placeholder="เช่น owner"/><input aria-label="คลัง GitHub" value={setupDraft.integrations.githubReleases.repo} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,githubReleases:{...setupDraft.integrations.githubReleases,repo:event.target.value}}})} placeholder="เช่น repository"/><select aria-label="รอบซิงก์รุ่นเผยแพร่ GitHub" value={setupDraft.integrations.githubReleases.syncCadence} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,githubReleases:{...setupDraft.integrations.githubReleases,syncCadence:event.target.value as SyncCadence}}})}><option value="OFF">ปิด</option><option value="DAILY">รายวัน</option><option value="WEEKLY">รายสัปดาห์</option></select><label className="checkline"><input type="checkbox" checked={setupDraft.integrations.githubReleases.includePrereleases} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,githubReleases:{...setupDraft.integrations.githubReleases,includePrereleases:event.target.checked}}})}/>รุ่นก่อนเผยแพร่</label></div>
                <div className="provider-card"><strong>สถานะ Discord</strong><label className="checkline"><input type="checkbox" checked={setupDraft.integrations.discordStatus.enabled} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,discordStatus:{...setupDraft.integrations.discordStatus,enabled:event.target.checked}}})}/>เปิดใช้</label><select aria-label="รอบซิงก์สถานะ Discord" value={setupDraft.integrations.discordStatus.syncCadence} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,discordStatus:{...setupDraft.integrations.discordStatus,syncCadence:event.target.value as SyncCadence}}})}><option value="OFF">ปิด</option><option value="DAILY">รายวัน</option><option value="WEEKLY">รายสัปดาห์</option></select></div>
                <div className="provider-card"><strong>ข่าว Steam</strong><label className="checkline"><input type="checkbox" checked={setupDraft.integrations.steamNews.enabled} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,steamNews:{...setupDraft.integrations.steamNews,enabled:event.target.checked}}})}/>เปิดใช้</label><input aria-label="รหัสแอป Steam" type="number" min="1" max="4294967295" value={setupDraft.integrations.steamNews.appId} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,steamNews:{...setupDraft.integrations.steamNews,appId:Math.max(1,Number(event.target.value)||1)}}})}/><select aria-label="จำนวนข่าว Steam" value={setupDraft.integrations.steamNews.count} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,steamNews:{...setupDraft.integrations.steamNews,count:Number(event.target.value)}}})}><option value={5}>5 รายการ</option><option value={10}>10 รายการ</option><option value={20}>20 รายการ</option></select><select aria-label="ความยาวข้อความข่าว Steam สูงสุด" value={setupDraft.integrations.steamNews.maxLength} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,steamNews:{...setupDraft.integrations.steamNews,maxLength:Number(event.target.value)}}})}><option value={600}>600 อักขระ</option><option value={1200}>1200 อักขระ</option><option value={2000}>2000 อักขระ</option><option value={4000}>4000 อักขระ</option></select><select aria-label="รอบซิงก์ข่าว Steam" value={setupDraft.integrations.steamNews.syncCadence} onChange={(event)=>patchDraft({integrations:{...setupDraft.integrations,steamNews:{...setupDraft.integrations.steamNews,syncCadence:event.target.value as SyncCadence}}})}><option value="OFF">ปิด</option><option value="DAILY">รายวัน</option><option value="WEEKLY">รายสัปดาห์</option></select></div>
              </div>
              <div className="module-overrides"><span>งบทรัพยากร</span>{([
                  ['ซิงก์ผู้ให้บริการ','providerSync'],['วิเคราะห์ข้อมูล','analytics'],['สำรองข้อมูล','backup'],['กระจายการแจ้งเตือน','notificationFanout'],['ระบบอัตโนมัติแบบชุด','bulkAutomation'],
                ] as const).map(([label,key])=>{const budget=setupDraft.budgets[key];return <label key={key}><b>{label}</b><input type="checkbox" checked={budget.enabled} onChange={(event)=>patchDraft({budgets:{...setupDraft.budgets,[key]:{...budget,enabled:event.target.checked}}})}/><select value={budget.mode} onChange={(event)=>patchDraft({budgets:{...setupDraft.budgets,[key]:{...budget,mode:event.target.value as BudgetPolicy['mode']}}})}><option value="OBSERVE">เฝ้าดู</option><option value="ENFORCE">บังคับใช้</option></select><input aria-label={`${label} ช่วงเวลาเป็นวินาที`} type="number" min="60" max="86400" value={budget.windowSeconds} onChange={(event)=>patchDraft({budgets:{...setupDraft.budgets,[key]:{...budget,windowSeconds:Math.max(60,Math.min(86400,Number(event.target.value)||60))}}})}/><input aria-label={`${label} จำนวนหน่วยสูงสุด`} type="number" min="1" max="1000000" value={budget.maxUnits} onChange={(event)=>patchDraft({budgets:{...setupDraft.budgets,[key]:{...budget,maxUnits:Math.max(1,Math.min(1000000,Number(event.target.value)||1))}}})}/></label>})}</div>
              <div className="module-overrides"><span>กำหนดโมดูลเฉพาะ</span>{(capabilities?.setupControl?.moduleOverrideKeys??[]).map((module)=><label key={module}><b>{thModule(module)}</b><select value={setupDraft.moduleOverrides[module]===true?'ON':setupDraft.moduleOverrides[module]===false?'OFF':'INHERIT'} onChange={(event)=>{ const next={...setupDraft.moduleOverrides}; if(event.target.value==='INHERIT') delete next[module]; else next[module]=event.target.value==='ON'; patchDraft({moduleOverrides:next}); }}><option value="INHERIT">สืบทอด</option><option value="ON">เปิด</option><option value="OFF">ปิด</option></select></label>)}</div>
            </div></details>
          </div>
          <div className="setup-plan">
            <div className="setup-plan-head"><span>ตัวอย่างสถานะเป้าหมาย</span><strong>{setupPreview ? `${setupPreview.actionableCount} การเปลี่ยนแปลง` : 'ยังไม่ได้สแกน'}</strong></div>
            {setupPreview ? <><div className="plan-metrics"><span><b>{setupPreview.summary.CREATE ?? 0}</b>สร้าง</span><span><b>{setupPreview.summary.UPDATE ?? 0}</b>อัปเดต</span><span><b>{setupPreview.summary.ADOPT ?? 0}</b>รับดูแล</span><span><b>{setupPreview.conflicts}</b>ข้อขัดแย้ง</span><span><b>{setupPreview.panelCount}</b>แผง</span><span><b>{(setupPreview.lockChanges?.lock.length??0)+(setupPreview.lockChanges?.unlock.length??0)}</b>การล็อก</span><span><b>{thValue(setupPreview.impact?.level??'—')}</b>โครงสร้าง</span><span><b>{thValue(setupPreview.configurationImpact?.level??'—')}</b>การตั้งค่า</span><span><b>{setupPreview.totalUnits??'—'}</b>หน่วย</span></div><div className="plan-list">{setupPreview.actions.slice(0,8).map((action) => <div key={action.logicalKey}><span className={`plan-action ${action.type.toLowerCase()}`}>{thValue(action.type)}</span><strong>{action.name}</strong><small>{action.logicalKey}</small></div>)}</div></> : <div className="setup-empty">ตัวอย่างจะคำนวณความคลาดเคลื่อนจาก Discord จริง และจะไม่เปลี่ยนสิ่งใดจนกว่าแฮชแผนจะได้รับอนุมัติ</div>}
            <div className="setup-actions"><button type="button" className="secondary-action" disabled={!auth?.authenticated || !selectedGuildId || setupBusy} onClick={() => void previewSetup()}>{setupBusy ? 'กำลังทำงาน…' : 'สแกนและดูตัวอย่าง'}</button><button type="button" className="primary-action" disabled={!setupPreview || setupPreview.conflicts > 0 || setupBusy} onClick={() => void applySetup()}>ใช้แผนที่อนุมัติแล้ว</button></div>
            <details className="portable-config"><summary>ชุดตั้งค่าพกพา · ตรวจเช็กซัม</summary><p>ส่งออกเฉพาะการตั้งค่าที่ปลอดภัยสำหรับระบบตั้งค่า การนำเข้าจะกลายเป็นตัวอย่างก่อนเสมอและไม่แก้ Discord โดยตรง</p><textarea value={portableConfig} onChange={(event)=>setPortableConfig(event.target.value)} placeholder="ซองข้อมูลตั้งค่าพกพา"/><div className="action-row"><button type="button" className="secondary-action" disabled={!auth?.authenticated||!selectedGuildId} onClick={()=>void exportPortableConfig()}>ส่งออกการตั้งค่าปัจจุบัน</button><button type="button" className="secondary-action" disabled={!portableConfig||!auth?.session?.csrfToken} onClick={()=>void previewPortableConfig()}>ตรวจสอบและดูตัวอย่างการนำเข้า</button></div>{portableMessage&&<small>{portableMessage}</small>}</details>
            {latestJob && <div className="job-strip"><div><span>งานล่าสุด</span><strong>{thValue(latestJob.status)} · {latestJob.currentStep ? thValue(latestJob.currentStep) : 'รอคิว'}</strong></div><div className="job-progress"><i style={{ width:`${latestJob.totalUnits ? Math.min(100,Math.round(latestJob.completedUnits/latestJob.totalUnits*100)) : 12}%` }}/></div>{['QUEUED','RUNNING','RETRYING'].includes(latestJob.status) && <button type="button" onClick={() => void cancelLatestJob()}>ยกเลิกอย่างปลอดภัย</button>}</div>}
          </div>
        </div>
      </section>

      <DigitalTwinConsole twin={setupPreview?.digitalTwin} />

      <section className="section-grid two-col">
        <article className="panel major-panel">
          <div className="panel-heading"><div><span className="kicker">แผนผังระบบ</span><h2>โมดูลแพลตฟอร์ม</h2></div><ShieldCheck size={24}/></div>
          <div className="module-groups">
            {Object.entries(moduleGroups).map(([group, names]) => <div className="module-group" key={group}>
              <h3>{group}</h3>
              <div className="chip-wrap">{names.map((name) => <span className={(capabilities?.modules ?? []).includes(name) ? 'chip active' : 'chip'} key={name}>{thModule(name)}</span>)}</div>
            </div>)}
          </div>
        </article>

        <article className="panel feed-panel">
          <div className="panel-heading"><div><span className="kicker">สายเหตุการณ์</span><h2>กิจกรรมสด</h2></div><span className="mono-note">{lastEvent ? since(lastEvent.occurredAt) : 'ยังไม่มีข้อมูล'}</span></div>
          <div className="event-feed">
            {events.length === 0 ? <div className="empty-state"><Radio size={24}/><strong>ยังไม่มีเหตุการณ์</strong><span>เหตุการณ์จริงจะแสดงที่นี่ทันทีเมื่อแพลตฟอร์มเผยแพร่</span></div> : events.slice(0, 9).map((event) => <div className="event-row" key={event.eventId}>
              <span className="event-dot"/><div><strong>{thEventType(event.type)}</strong><span>{event.guildId ? `เซิร์ฟเวอร์ ${event.guildId}` : 'แพลตฟอร์ม'} · {since(event.occurredAt)}</span></div>
            </div>)}
          </div>
        </article>
      </section>

      <OperationsIntelligenceConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} />
      <EventReplayConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} />
      <OperationalDeck api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} csrf={auth?.session?.csrfToken} />
      <AuditExplorer api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} />
      <StructureConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} />
      <DiagnosticsConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} />
      <RecoveryConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} csrf={auth?.session?.csrfToken} />
      <ChangeControlConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} csrf={auth?.session?.csrfToken} draft={setupDraft} />
      <GovernanceConsole api={API} guildId={selectedGuildId} authenticated={Boolean(auth?.authenticated)} csrf={auth?.session?.csrfToken} />
      <ReleaseTruthConsole api={API} authenticated={Boolean(auth?.authenticated)} />

      <section className="panel panel-fabric">
        <div className="panel-heading"><div><span className="kicker"><Images size={14}/> ระบบแผงภาพ</span><h2>สื่อที่สร้างแล้วเชื่อมกับพื้นผิวที่ระบบดูแลจริง</h2></div><span className="safety-badge">{capabilities?.panels?.count ?? panelAssets.length} แผง</span></div>
        <p className="fabric-copy">ทุกแผงที่ระบบดูแลมีรหัสถาวร รุ่นเนื้อหา ช่องเป้าหมาย คีย์สื่อ และนโยบายซ่อมแซม สื่ออยู่ในโปรเจกต์จริง พื้นผิว Discord แสดงผ่านคอมโพเนนต์รุ่น 2 และการซ่อมจะอัปเดตข้อความเดิมโดยไม่สร้างข้อความซ้ำ</p>
        <div className="asset-rail" aria-label="แกลเลอรีสื่อของแผง">
          {panelAssets.map(([key,label]) => <figure className="asset-card" key={key}><img src={`/assets/panels/${key}.png`} alt={`${label} ภาพประกอบแผง`}/><figcaption><strong>{label}</strong><span>ระบบดูแล · มีรุ่น</span></figcaption></figure>)}
        </div>
      </section>

      <section className="panel gaming-panel">
        <div className="panel-heading"><div><span className="kicker"><Gamepad2 size={14}/> ระบบเกม</span><h2>สร้างเป็นแพลตฟอร์มครบระบบ ไม่ใช่เพียงชุดช่อง</h2></div><span className="safety-badge">ไม่มีการเดิมพัน</span></div>
        <div className="gaming-grid">
          {gamingBuckets.map((bucket) => <div className="gaming-bucket" key={bucket.title}><h3>{bucket.title}</h3><div className="chip-wrap">{bucket.items.map((item) => <span className="chip game" key={item}>{thModule(item)}</span>)}</div></div>)}
        </div>
      </section>

      <section className="deploy-strip">
        <div><span className="kicker">{ui.zeroCost}</span><strong>{ui.zeroCostTitle}</strong></div>
        <p>{capabilities?.deploymentProfile.limitation ?? 'ข้อจำกัดของแผนฟรีจะแสดงอย่างตรงไปตรงมา ไม่ซ่อนจากผู้ดูแล'}</p>
      </section>
    </main>
  </div>;
}
