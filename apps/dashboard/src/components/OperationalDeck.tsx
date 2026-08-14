import { useEffect, useMemo, useState } from 'react';
import { thField, thValue } from '../ui-thai';

const VIEWS = [
  ['panels','แผงควบคุม'],['resources','โครงสร้าง'],['access','การเข้าถึง'],['tickets','คำขอช่วยเหลือ'],['workflows','เวิร์กโฟลว์และโครงข่าย'],['events','กิจกรรม'],['gaming','ระบบเกม'],['incidents','เหตุขัดข้อง'],['capacity','ความจุ'],['admission','การรับงาน'],['recovery_drills','การซ้อมกู้คืน'],
  ['budgets','งบทรัพยากร'],['automation','ระบบอัตโนมัติ'],['security','ความปลอดภัย'],['integrations','การเชื่อมต่อ'],['scheduler','ตัวกำหนดเวลา'],['analytics','ตัวช่วยวิเคราะห์'],['audit','บันทึกตรวจสอบ'],['governance','การกำกับ'],['plugins','ส่วนเสริม'],['settings','การตั้งค่า'],
] as const;

const PAGE_SIZE=20;
type ViewKey = typeof VIEWS[number][0];
type ViewPayload = { key: ViewKey; summary: Record<string, number|string|boolean|null>; items: Array<Record<string, unknown>>; generatedAt: string; source: string };

type WorkflowKind='application'|'report'|'suggestion'|'fabric_work';
type VerticalWorkflowKind='creator_content'|'mentor_request'|'business_support';

const WORKFLOW_TARGETS:Record<WorkflowKind,Record<string,readonly string[]>>={
  application:{SUBMITTED:['UNDER_REVIEW'],UNDER_REVIEW:['INTERVIEW','ACCEPTED','REJECTED'],INTERVIEW:['ACCEPTED','REJECTED'],ACCEPTED:['ARCHIVED'],REJECTED:['ARCHIVED']},
  report:{OPEN:['TRIAGED','DISMISSED'],TRIAGED:['INVESTIGATING','DISMISSED'],INVESTIGATING:['ACTIONED','CLOSED','DISMISSED'],ACTIONED:['CLOSED']},
  suggestion:{OPEN:['UNDER_REVIEW','DUPLICATE','ARCHIVED'],UNDER_REVIEW:['ACCEPTED','REJECTED','DUPLICATE','ARCHIVED'],ACCEPTED:['IMPLEMENTED','ARCHIVED'],REJECTED:['ARCHIVED'],IMPLEMENTED:['ARCHIVED'],DUPLICATE:['ARCHIVED']},
  fabric_work:{OPEN:['IN_REVIEW','APPROVED','ACTIVE','REJECTED','CANCELLED'],IN_REVIEW:['APPROVED','ACTIVE','REJECTED','CANCELLED'],APPROVED:['ACTIVE','COMPLETED','RESOLVED','CANCELLED'],ACTIVE:['BLOCKED','COMPLETED','RESOLVED','CANCELLED'],BLOCKED:['ACTIVE','CANCELLED']},
};

function cell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
  if (typeof value === 'object') return JSON.stringify(value);
  const raw = String(value);
  const localized=thValue(raw); return localized.length > 72 ? `${localized.slice(0,69)}…` : localized;
}

function rowId(item:Record<string,unknown>,fallback:string):string{
  return String(item.id??item.logical_key??item.panel_id??fallback);
}

function workflowTargets(item:Record<string,unknown>):readonly string[]{
  const kind=String(item.kind??'') as WorkflowKind; const status=String(item.status??'');
  return WORKFLOW_TARGETS[kind]?.[status]??[];
}



const RECOVERY_DRILL_TARGETS:Record<string,readonly string[]>={PLANNED:['RUNNING','CANCELLED'],RUNNING:['BLOCKED','PASSED','FAILED','CANCELLED'],BLOCKED:['RUNNING','FAILED','CANCELLED']};
function recoveryDrillTargets(item:Record<string,unknown>):readonly string[]{return RECOVERY_DRILL_TARGETS[String(item.status??'')]??[];}

const INCIDENT_TARGETS:Record<string,readonly string[]>={
  OPEN:['INVESTIGATING','MITIGATING','RESOLVED'],
  INVESTIGATING:['MITIGATING','MONITORING','RESOLVED'],
  MITIGATING:['INVESTIGATING','MONITORING','RESOLVED'],
  MONITORING:['INVESTIGATING','MITIGATING','RESOLVED'],
  RESOLVED:['MONITORING','CLOSED'],
};
function incidentTargets(item:Record<string,unknown>):readonly string[]{
  if(String(item.kind??'')==='incident_event')return [];
  return INCIDENT_TARGETS[String(item.status??'')]??[];
}

function verticalActionable(item:Record<string,unknown>):boolean{
  const kind=String(item.kind??'') as VerticalWorkflowKind; const status=String(item.status??'');
  if(kind==='creator_content')return status==='REVIEW'||status==='APPROVED';
  if(kind==='mentor_request')return status==='CLAIMED'||status==='SCHEDULED';
  if(kind==='business_support')return ['OPEN','CLAIMED','RESOLVED'].includes(status);
  return false;
}

function actionable(active:ViewKey,item:Record<string,unknown>):boolean{
  if(active==='workflows')return workflowTargets(item).length>0||verticalActionable(item);
  if(active==='incidents')return incidentTargets(item).length>0;
  if(active==='recovery_drills')return recoveryDrillTargets(item).length>0;
  if(active==='scheduler')return item.cancellable===true;
  if(active==='integrations')return Boolean(item.integration_key);
  if(active==='admission')return item.kind==='policy';
  if(active==='budgets')return item.kind==='policy';
  if(active==='automation')return item.kind==='rule';
  return false;
}

export function OperationalDeck({ api, guildId, authenticated, csrf }:{ api:string; guildId:string; authenticated:boolean; csrf?:string }) {
  const [active,setActive]=useState<ViewKey>('panels');
  const [data,setData]=useState<ViewPayload|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [page,setPage]=useState(0);
  const [selected,setSelected]=useState<Record<string,unknown>|null>(null);
  const [reason,setReason]=useState('');
  const [runAt,setRunAt]=useState('');
  const [channelKey,setChannelKey]=useState('CH_UPLOADS');
  const [timezone,setTimezone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
  const [integrationLocale,setIntegrationLocale]=useState('th_TH');
  const [integrationOwner,setIntegrationOwner]=useState('');
  const [integrationRepo,setIntegrationRepo]=useState('');
  const [integrationPrerelease,setIntegrationPrerelease]=useState(false);
  const [drillChecksPassed,setDrillChecksPassed]=useState('0');
  const [drillChecksFailed,setDrillChecksFailed]=useState('0');
  const [drillArtifact,setDrillArtifact]=useState('');
  const [admissionPreset,setAdmissionPreset]=useState<'BALANCED'|'CONSERVATIVE'|'MAX_AVAILABILITY'>('BALANCED');
  const [admissionMode,setAdmissionMode]=useState<'OBSERVE'|'ENFORCE'>('ENFORCE');
  const [admissionFailClosed,setAdmissionFailClosed]=useState(true);
  const [budgetEnabled,setBudgetEnabled]=useState(true);
  const [budgetMode,setBudgetMode]=useState<'OBSERVE'|'ENFORCE'>('ENFORCE');
  const [budgetWindowSeconds,setBudgetWindowSeconds]=useState('3600');
  const [budgetMaxUnits,setBudgetMaxUnits]=useState('60');
  const [automationPayload,setAutomationPayload]=useState('{}');
  const [actionState,setActionState]=useState<{busy:boolean;message:string|null;error:boolean}>({busy:false,message:null,error:false});

  const load=async()=>{
    if(!guildId||!authenticated){ setData(null); return; }
    setBusy(true);
    try{
      const response=await fetch(`${api}/api/guilds/${guildId}/operations/${active}`,{credentials:'include'});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message||body.error||'ไม่สามารถโหลดมุมมองการปฏิบัติงานได้');
      setData(body); setError(null); setPage(0); setSelected(null);
    }catch(err){ setError(err instanceof Error?err.message:'ไม่สามารถโหลดมุมมองการปฏิบัติงานได้'); setData(null); }
    finally{ setBusy(false); }
  };

  useEffect(()=>{ void load(); },[guildId,authenticated,active]);
  const columns=useMemo(()=>{
    const found:string[]=[];
    for(const item of data?.items.slice(0,40)??[]) for(const key of Object.keys(item)) if(!found.includes(key)&&found.length<7) found.push(key);
    return found;
  },[data]);
  const pageCount=Math.max(1,Math.ceil((data?.items.length??0)/PAGE_SIZE));
  const safePage=Math.min(page,pageCount-1);
  const pageItems=data?.items.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE)??[];
  const from=data?.items.length?safePage*PAGE_SIZE+1:0;
  const to=Math.min((safePage+1)*PAGE_SIZE,data?.items.length??0);
  const mutationView=active==='workflows'||active==='incidents'||active==='recovery_drills'||active==='scheduler'||active==='integrations'||active==='admission'||active==='budgets'||active==='automation';

  const post=async(path:string,body?:Record<string,unknown>)=>{
    if(!csrf)throw new Error('เซสชันแดชบอร์ดขาดโทเค็นความปลอดภัย โปรดรีเฟรชและเข้าสู่ระบบใหม่');
    const response=await fetch(`${api}${path}`,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':csrf},body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>({})); if(!response.ok)throw new Error(payload.message||payload.error||'การดำเนินการถูกปฏิเสธ'); return payload;
  };

  const runCapacityAssessment=async()=>{
    setActionState({busy:true,message:null,error:false});
    try{await post(`/api/guilds/${guildId}/capacity/assess`);await load();setActionState({busy:false,message:'บันทึกหลักฐานความจุปัจจุบันแล้ว',error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การประเมินความจุถูกปฏิเสธ',error:true});}
  };

  const runAdmissionPolicy=async()=>{
    setActionState({busy:true,message:null,error:false});
    try{await post(`/api/guilds/${guildId}/admission`,{preset:admissionPreset,mode:admissionMode,failClosedWhenUnknown:admissionFailClosed});await load();setActionState({busy:false,message:'อัปเดตนโยบายควบคุมการรับงานแล้ว',error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'นโยบายควบคุมการรับงานถูกปฏิเสธ',error:true});}
  };

  const runBudgetPolicy=async()=>{
    if(!selected)return;const budgetKey=String(selected.budget_key??selected.id??'');const windowSeconds=Number(budgetWindowSeconds),maxUnits=Number(budgetMaxUnits);
    setActionState({busy:true,message:null,error:false});
    try{if(!budgetKey)throw new Error('ไม่พบคีย์งบทรัพยากร');if(!Number.isInteger(windowSeconds)||windowSeconds<60||windowSeconds>86400)throw new Error('ช่วงเวลาต้องอยู่ระหว่าง 60–86400 วินาที');if(!Number.isInteger(maxUnits)||maxUnits<1||maxUnits>1000000)throw new Error('จำนวนหน่วยสูงสุดต้องอยู่ระหว่าง 1–1,000,000');await post(`/api/guilds/${guildId}/budgets/${encodeURIComponent(budgetKey)}`,{enabled:budgetEnabled,mode:budgetMode,windowSeconds,maxUnits});await load();setActionState({busy:false,message:`อัปเดตงบทรัพยากร ${budgetKey} แล้ว`,error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การอัปเดตงบทรัพยากรถูกปฏิเสธ',error:true});}
  };

  const runAutomationSimulation=async()=>{
    if(!selected)return;const ruleKey=String(selected.rule_key??'');const eventType=String(selected.event_type??'');setActionState({busy:true,message:null,error:false});
    try{if(!ruleKey||!eventType)throw new Error('ข้อมูลกฎระบบอัตโนมัติไม่ครบถ้วน');const payload=JSON.parse(automationPayload||'{}');if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('ข้อมูลสำหรับทดลองต้องเป็นวัตถุ JSON');const result=await post(`/api/guilds/${guildId}/automation/rules/${encodeURIComponent(ruleKey)}/simulate`,{eventType,payload});const simulation=result.simulation as {matched?:boolean;conditions?:Array<{path:string;passed:boolean}>;actionIntents?:Array<{summary:string}>};const lint=result.lint as {risk?:string;findings?:Array<{code:string}>}|undefined;const failed=(simulation.conditions??[]).filter((item)=>!item.passed).map((item)=>item.path).slice(0,4);const intents=(simulation.actionIntents??[]).map((item)=>item.summary).slice(0,4);const lintNote=lint?` · ผลตรวจ ${thValue(lint.risk??'UNKNOWN')}${lint.findings?.length?` (${lint.findings.slice(0,3).map((item)=>item.code).join(', ')})`:''}`:'';setActionState({busy:false,message:(simulation.matched?`การทดลองตรงเงื่อนไข · เจตนาการดำเนินการ: ${intents.join(', ')||'ไม่มี'}`:`การทดลองไม่ตรงเงื่อนไข${failed.length?` · เงื่อนไขที่ไม่ผ่าน: ${failed.join(', ')}`:''}`)+lintNote,error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การทดลองระบบอัตโนมัติถูกปฏิเสธ',error:true});}
  };

  const runAutomationToggle=async()=>{
    if(!selected)return;const ruleKey=String(selected.rule_key??'');const eventType=String(selected.event_type??'');const conditions=Array.isArray(selected.conditions)?selected.conditions:[];const actions=Array.isArray(selected.actions)?selected.actions:[];
    setActionState({busy:true,message:null,error:false});
    try{if(!ruleKey||!eventType||!actions.length)throw new Error('ข้อมูลกฎระบบอัตโนมัติไม่ครบถ้วน');await post(`/api/guilds/${guildId}/automation/rules/${encodeURIComponent(ruleKey)}`,{eventType,conditions,actions,enabled:selected.enabled!==true});await load();setActionState({busy:false,message:`กฎอัตโนมัติ ${ruleKey} ${selected.enabled===true?'ถูกปิดแล้ว':'ถูกเปิดแล้ว'}`,error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การอัปเดตกฎอัตโนมัติถูกปฏิเสธ',error:true});}
  };

  const runWorkflow=async(next:string)=>{
    if(!selected)return; const kind=String(selected.kind??''); const id=rowId(selected,'');
    setActionState({busy:true,message:null,error:false});
    try{await post(`/api/guilds/${guildId}/workflows/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/transition`,{next,reason:reason||undefined});setReason('');await load();setActionState({busy:false,message:`ย้ายเวิร์กโฟลว์ไปสถานะ ${thValue(next)} แล้ว`,error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การเปลี่ยนสถานะถูกปฏิเสธ',error:true});}
  };

  const runIncident=async(next:string)=>{
    if(!selected)return;const id=rowId(selected,'');setActionState({busy:true,message:null,error:false});
    try{await post(`/api/guilds/${guildId}/incidents/${encodeURIComponent(id)}/transition`,{next,note:reason||undefined});setReason('');await load();setActionState({busy:false,message:`ย้ายเหตุขัดข้องไปสถานะ ${thValue(next)} แล้ว`,error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การเปลี่ยนสถานะเหตุขัดข้องถูกปฏิเสธ',error:true});}
  };

  const runRecoveryDrill=async(next:string)=>{
    if(!selected)return;const id=rowId(selected,'');setActionState({busy:true,message:null,error:false});
    try{const checksPassed=Number(drillChecksPassed),checksFailed=Number(drillChecksFailed);if(!Number.isInteger(checksPassed)||checksPassed<0||!Number.isInteger(checksFailed)||checksFailed<0)throw new Error('จำนวนรายการตรวจต้องเป็นจำนวนเต็มที่ไม่ติดลบ');await post(`/api/guilds/${guildId}/recovery-drills/${encodeURIComponent(id)}/transition`,{next,checksPassed,checksFailed,artifactRefs:drillArtifact.trim()?[drillArtifact.trim()]:[],blockers:['BLOCKED','FAILED'].includes(next)&&reason.trim()?[reason.trim()]:[],note:reason||undefined});setReason('');setDrillArtifact('');setDrillChecksPassed('0');setDrillChecksFailed('0');await load();setActionState({busy:false,message:`ย้ายการซ้อมกู้คืนไปสถานะ ${thValue(next)} แล้ว`,error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การเปลี่ยนสถานะการซ้อมกู้คืนถูกปฏิเสธ',error:true});}
  };

  const resetVerticalInputs=()=>{
    const future=new Date(Date.now()+60*60_000); const local=new Date(future.getTime()-future.getTimezoneOffset()*60_000).toISOString().slice(0,16);
    setRunAt(local); setChannelKey('CH_UPLOADS'); setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
  };

  const runVertical=async(action:'approve'|'reject'|'creator-schedule'|'creator-cancel'|'mentor-schedule'|'mentor-complete'|'business-claim'|'business-resolve'|'business-close')=>{
    if(!selected)return; const kind=String(selected.kind??''); const id=rowId(selected,''); setActionState({busy:true,message:null,error:false});
    try{
      if(action==='approve'||action==='reject')await post(`/api/guilds/${guildId}/vertical/creator/${encodeURIComponent(id)}/review`,{decision:action==='approve'?'APPROVED':'REJECTED',reason:reason||undefined});
      if(action==='creator-schedule'){
        if(!runAt)throw new Error('โปรดเลือกเวลาเผยแพร่ในอนาคต');
        await post(`/api/guilds/${guildId}/vertical/creator/${encodeURIComponent(id)}/schedule`,{runAt:new Date(runAt).toISOString(),channelKey,timezone});
      }
      if(action==='creator-cancel')await post(`/api/guilds/${guildId}/vertical/creator/${encodeURIComponent(id)}/cancel-schedule`);
      if(action==='mentor-schedule'){
        if(!runAt)throw new Error('โปรดเลือกเวลาเซสชันพี่เลี้ยงในอนาคต');
        await post(`/api/guilds/${guildId}/vertical/mentor/${encodeURIComponent(id)}/schedule`,{runAt:new Date(runAt).toISOString(),timezone});
      }
      if(action==='mentor-complete')await post(`/api/guilds/${guildId}/vertical/mentor/${encodeURIComponent(id)}/complete`);
      if(action==='business-claim')await post(`/api/guilds/${guildId}/vertical/business/${encodeURIComponent(id)}/claim`);
      if(action==='business-resolve'||action==='business-close')await post(`/api/guilds/${guildId}/vertical/business/${encodeURIComponent(id)}/resolve`,{next:action==='business-resolve'?'RESOLVED':'CLOSED'});
      await load(); setReason(''); setActionState({busy:false,message:`ดำเนินการ ${thValue(kind)} เสร็จแล้ว`,error:false});
    }catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การดำเนินการเวิร์กโฟลว์เฉพาะด้านถูกปฏิเสธ',error:true});}
  };

  const resetIntegrationInputs=(item:Record<string,unknown>)=>{
    const config=item.config&&typeof item.config==='object'&&!Array.isArray(item.config)?item.config as Record<string,unknown>:{};
    setIntegrationLocale(String(config.locale??'th_TH'));setIntegrationOwner(String(config.owner??''));setIntegrationRepo(String(config.repo??''));setIntegrationPrerelease(config.includePrereleases===true);
  };

  const cancelScheduled=async()=>{
    if(!selected)return; const id=rowId(selected,''); setActionState({busy:true,message:null,error:false});
    try{await post(`/api/guilds/${guildId}/scheduler/${encodeURIComponent(id)}/cancel`);await load();setActionState({busy:false,message:'ยกเลิกงานตามกำหนดก่อนถูกเริ่มทำงานแล้ว',error:false});}
    catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การยกเลิกถูกปฏิเสธ',error:true});}
  };

  const integrationAction=async(action:'health'|'toggle'|'webhook'|'sync'|'save-config')=>{
    if(!selected)return; const key=String(selected.integration_key??selected.id??''); setActionState({busy:true,message:null,error:false});
    try{
      if(action==='health')await post(`/api/guilds/${guildId}/integrations/${encodeURIComponent(key)}/health`);
      else if(action==='sync')await post(`/api/guilds/${guildId}/integrations/${encodeURIComponent(key)}/sync`);
      else if(action==='save-config'){
        const config=key==='riot-data-dragon'?{locale:integrationLocale}:key==='github-releases'?{owner:integrationOwner,repo:integrationRepo,includePrereleases:integrationPrerelease}:{};
        await post(`/api/guilds/${guildId}/integrations/${encodeURIComponent(key)}/config`,{config});
      }
      else if(action==='webhook'){const envKey=`INTEGRATION_${key.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')}_WEBHOOK_SECRET`;await post(`/api/guilds/${guildId}/integrations/${encodeURIComponent(key)}/webhook-config`,{secretRef:`env:${envKey}`});}
      else await post(`/api/guilds/${guildId}/integrations/${encodeURIComponent(key)}/state`,{enabled:selected.enabled!==true});
      await load(); const messages:Record<string,string>={health:'บันทึกหลักฐานสุขภาพการเชื่อมต่อแล้ว',webhook:'ผูกข้อมูลอ้างอิงตัวแปรแวดล้อมของเว็บฮุกแล้ว โดยค่าลับยังอยู่นอกฐานข้อมูล',toggle:'อัปเดตสถานะการเชื่อมต่อแล้ว',sync:'ซิงก์เนื้อหาผู้ให้บริการและบันทึกแฮชเป็นภาพสถานะถาวรแล้ว','save-config':'ตรวจสอบและบันทึกการตั้งค่าการเชื่อมต่อสาธารณะแล้ว'}; setActionState({busy:false,message:messages[action]??'ดำเนินการการเชื่อมต่อเสร็จแล้ว',error:false});
    }catch(err){setActionState({busy:false,message:err instanceof Error?err.message:'การดำเนินการการเชื่อมต่อถูกปฏิเสธ',error:true});}
  };

  return <section className="panel operational-deck" aria-label="ศูนย์ควบคุมการปฏิบัติงาน">
    <div className="panel-heading"><div><span className="kicker">ศูนย์ควบคุมผู้ดูแล</span><h2>พื้นที่ปฏิบัติงานที่จำกัดขอบเขตตามเซิร์ฟเวอร์</h2></div><div className="operator-action-buttons">{active==='capacity'&&<button className="secondary-action compact-action" type="button" disabled={actionState.busy||!guildId||!csrf} onClick={()=>void runCapacityAssessment()}>{actionState.busy?'กำลังประเมิน…':'บันทึกหลักฐานความจุ'}</button>}<button className="secondary-action compact-action" type="button" disabled={busy||!guildId} onClick={()=>void load()}>{busy?'กำลังรีเฟรช…':'รีเฟรช'}</button></div></div>
    <div className="operational-tabs" role="tablist" aria-label="พื้นที่ปฏิบัติงาน">
      {VIEWS.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={active===key} className={active===key?'active':''} onClick={()=>{setActive(key);setPage(0);setSelected(null);}}>{label}</button>)}
    </div>
    {!authenticated||!guildId?<div className="setup-empty">เข้าสู่ระบบด้วย Discord และเลือกเซิร์ฟเวอร์ที่คุณจัดการได้เพื่ออ่านสถานะปฏิบัติงานถาวร</div>:
      error?<div className="operator-error">{error}</div>:
      <>
        <div className="operator-summary">{Object.entries(data?.summary??{}).map(([key,value])=><div key={key}><span>{thField(key)}</span><strong>{cell(value)}</strong></div>)}</div>
        {data?.items.length?<>
          <div className="operator-table-wrap"><table className="operator-table"><thead><tr>{mutationView&&<th>ควบคุม</th>}{columns.map((column)=><th key={column}>{thField(column)}</th>)}</tr></thead><tbody>{pageItems.map((item,index)=>{
            const id=rowId(item,`${active}-${safePage*PAGE_SIZE+index}`); const canAct=actionable(active,item); const isSelected=selected&&rowId(selected,'')===id;
            return <tr key={id} className={isSelected?'operator-row-selected':undefined}>{mutationView&&<td>{canAct?<button type="button" className="operator-row-action" aria-pressed={Boolean(isSelected)} onClick={()=>{setSelected(item);setReason('');setDrillArtifact('');setDrillChecksPassed('0');setDrillChecksFailed('0');resetVerticalInputs();if(active==='integrations')resetIntegrationInputs(item);if(active==='admission'){setAdmissionPreset(String(item.preset??'BALANCED') as any);setAdmissionMode(String(item.status??'ENFORCE')==='OBSERVE'?'OBSERVE':'ENFORCE');setAdmissionFailClosed(item.fail_closed_when_unknown!==false);}if(active==='budgets'){setBudgetEnabled(item.enabled!==false);setBudgetMode(String(item.status??'ENFORCE')==='OBSERVE'?'OBSERVE':'ENFORCE');setBudgetWindowSeconds(String(item.window_seconds??3600));setBudgetMaxUnits(String(item.max_units??60));}setActionState({busy:false,message:null,error:false});}}>{active==='workflows'?'ตรวจทาน':'จัดการ'}</button>:<span className="operator-muted">ล็อก</span>}</td>}{columns.map((column)=><td key={column} title={cell(item[column])}>{cell(item[column])}</td>)}</tr>;
          })}</tbody></table></div>
          <nav className="operator-pagination" aria-label="การแบ่งหน้ารายการปฏิบัติงาน"><span>{from}–{to} จาก {data.items.length}</span><div><button type="button" className="secondary-action compact-action" disabled={safePage===0} onClick={()=>setPage(value=>Math.max(0,value-1))}>ก่อนหน้า</button><span>หน้า {safePage+1} / {pageCount}</span><button type="button" className="secondary-action compact-action" disabled={safePage>=pageCount-1} onClick={()=>setPage(value=>Math.min(pageCount-1,value+1))}>ถัดไป</button></div></nav>
        </>:<div className="setup-empty">ยังไม่มีรายการถาวรในพื้นที่นี้</div>}
        {selected&&mutationView&&<aside className="operator-action-rail" aria-live="polite">
          <div><span className="kicker">การเปลี่ยนแปลงแบบควบคุม</span><h3>{active==='workflows'?'ตรวจทานเวิร์กโฟลว์':active==='incidents'?'ตอบสนองเหตุขัดข้อง':active==='recovery_drills'?'หลักฐานการซ้อมกู้คืน':active==='scheduler'?'ยกเลิกกำหนดการที่รออยู่':active==='admission'?'นโยบายควบคุมการรับงาน':active==='budgets'?'นโยบายงบทรัพยากร':'ควบคุมการเชื่อมต่อ'}</h3><p>รายการ <code>{rowId(selected,'—')}</code>. การดำเนินการถูกจำกัดรายการฝั่งเซิร์ฟเวอร์ จำกัดขอบเขตตามเซิร์ฟเวอร์ และตรวจสิทธิ์ซ้ำขณะดำเนินการ</p></div>
          {active==='workflows'&&<div className="operator-action-body">
            {workflowTargets(selected).length>0&&<><label>บันทึกการตัดสินใจ <input value={reason} maxLength={500} onChange={(event)=>setReason(event.target.value)} placeholder="เหตุผลประกอบบันทึกตรวจสอบ (ไม่บังคับ)" /></label><div className="operator-action-buttons">{workflowTargets(selected).map((next)=><button type="button" className="secondary-action compact-action" key={next} disabled={actionState.busy||!csrf} onClick={()=>void runWorkflow(next)}>{thValue(next)}</button>)}</div></>}
            {selected.kind==='creator_content'&&selected.status==='REVIEW'&&<><label>บันทึกการตรวจทาน <input value={reason} maxLength={500} onChange={(event)=>setReason(event.target.value)} placeholder="เหตุผลการตรวจทาน (ไม่บังคับ)" /></label><div className="operator-action-buttons"><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('approve')}>อนุมัติ</button><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('reject')}>ปฏิเสธ</button></div></>}
            {selected.kind==='creator_content'&&selected.status==='APPROVED'&&<><div className="operator-schedule-grid"><label>เผยแพร่เมื่อ <input type="datetime-local" value={runAt} onChange={(event)=>setRunAt(event.target.value)} /></label><label>เขตเวลา <input value={timezone} maxLength={80} onChange={(event)=>setTimezone(event.target.value)} /></label><label>คีย์ช่อง <input value={channelKey} maxLength={80} onChange={(event)=>setChannelKey(event.target.value.toUpperCase())} /></label></div><div className="operator-action-buttons"><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf||!runAt} onClick={()=>void runVertical('creator-schedule')}>กำหนดเวลาเผยแพร่</button>{selected.next_at!=null&&<button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('creator-cancel')}>ยกเลิกการเผยแพร่</button>}</div></>}
            {selected.kind==='mentor_request'&&selected.status==='CLAIMED'&&<><div className="operator-schedule-grid"><label>เซสชันเมื่อ <input type="datetime-local" value={runAt} onChange={(event)=>setRunAt(event.target.value)} /></label><label>เขตเวลา <input value={timezone} maxLength={80} onChange={(event)=>setTimezone(event.target.value)} /></label></div><button type="button" className="secondary-action" disabled={actionState.busy||!csrf||!runAt} onClick={()=>void runVertical('mentor-schedule')}>กำหนดเซสชันพี่เลี้ยง</button></>}
            {selected.kind==='mentor_request'&&selected.status==='SCHEDULED'&&<button type="button" className="secondary-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('mentor-complete')}>ทำเครื่องหมายว่าเซสชันเสร็จแล้ว</button>}
            {selected.kind==='business_support'&&<div className="operator-action-buttons">{selected.status==='OPEN'&&<button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('business-claim')}>รับเคส</button>}{['OPEN','CLAIMED'].includes(String(selected.status))&&<button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('business-resolve')}>แก้ไขแล้ว</button>}{['OPEN','CLAIMED','RESOLVED'].includes(String(selected.status))&&<button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void runVertical('business-close')}>ปิด</button>}</div>}
          </div>}
          {active==='incidents'&&<div className="operator-action-body"><p>การเปลี่ยนสถานะเหตุขัดข้องถูกบันทึกถาวรและตรวจสอบย้อนหลังได้ การแก้ไขหรือปิดต้องมีบันทึกหลักฐานที่มีสาระ</p><label>บันทึกไทม์ไลน์ / การบรรเทา <input value={reason} maxLength={1500} onChange={(event)=>setReason(event.target.value)} placeholder="ระบุสิ่งที่เปลี่ยน สิ่งที่ตรวจสอบ หรือเหตุผลที่ถือว่าแก้ไขแล้ว" /></label><div className="operator-action-buttons">{incidentTargets(selected).map((next)=><button type="button" className="secondary-action compact-action" key={next} disabled={actionState.busy||!csrf||(['RESOLVED','CLOSED'].includes(next)&&reason.trim().length<8)} onClick={()=>void runIncident(next)}>{thValue(next)}</button>)}</div></div>}
          {active==='recovery_drills'&&<div className="operator-action-body"><p>สถานะการซ้อมต้องอิงหลักฐาน การผ่านต้องมีการตรวจผ่านอย่างน้อยสองรายการ ไม่มีรายการล้มเหลว และมีข้อมูลอ้างอิงหนึ่งรายการ ส่วนสถานะติดขัดหรือล้มเหลวต้องมีบันทึกสาเหตุ</p><div className="operator-schedule-grid"><label>รายการตรวจที่ผ่าน<input inputMode="numeric" value={drillChecksPassed} onChange={(event)=>setDrillChecksPassed(event.target.value)} /></label><label>รายการตรวจที่ล้มเหลว<input inputMode="numeric" value={drillChecksFailed} onChange={(event)=>setDrillChecksFailed(event.target.value)} /></label><label>ข้อมูลอ้างอิงหลักฐาน<input value={drillArtifact} maxLength={240} onChange={(event)=>setDrillArtifact(event.target.value)} placeholder="เช่น backup:... / report:... / audit:..." /></label></div><label>บันทึกหลักฐาน / สาเหตุติดขัด<input value={reason} maxLength={1000} onChange={(event)=>setReason(event.target.value)} placeholder="สิ่งที่ตรวจสอบแล้ว หรือสิ่งที่ทำให้การซ้อมติดขัด" /></label><div className="operator-action-buttons">{recoveryDrillTargets(selected).map((next)=>{const blocked=['BLOCKED','FAILED'].includes(next)&&reason.trim().length<3;const pass=next==='PASSED'&&(Number(drillChecksPassed)<2||Number(drillChecksFailed)!==0||!drillArtifact.trim());return <button type="button" className="secondary-action compact-action" key={next} disabled={actionState.busy||!csrf||blocked||pass} onClick={()=>void runRecoveryDrill(next)}>{thValue(next)}</button>;})}</div></div>}
          {active==='scheduler'&&<div className="operator-action-body"><p>ที่นี่สามารถยกเลิกได้เฉพาะการเผยแพร่ประกาศ การเตือนกิจกรรม และการเริ่มบำรุงรักษาที่ยังรอดำเนินการ งานความปลอดภัย การหมดอายุ และการเก็บข้อมูลจะไม่ถูกยกเลิกจากหน้านี้</p><button type="button" className="secondary-action" disabled={actionState.busy||!csrf||selected.cancellable!==true} onClick={()=>void cancelScheduled()}>ยกเลิกงานตามกำหนด</button></div>}
          {active==='automation'&&<div className="operator-action-body"><p>ระบบอัตโนมัติอิงเหตุการณ์จริงและปิดแบบปลอดภัย การทดลองจะแสดงผลเงื่อนไขและเจตนาการดำเนินการที่ปลอดภัยโดยไม่สร้างใบรับรอง การแจ้งเตือน หรือผลข้างเคียงในบันทึกตรวจสอบ</p><div className="operator-schedule-grid"><label>ชนิดเหตุการณ์<input value={String(selected.event_type??'')} readOnly /></label><label>รุ่นกฎ<input value={String(selected.version??'—')} readOnly /></label><label>การดำเนินการที่ปลอดภัย<input value={String(Array.isArray(selected.actions)?selected.actions.length:0)} readOnly /></label></div><label>ข้อมูลเหตุการณ์สำหรับทดลอง<textarea value={automationPayload} maxLength={6000} onChange={(event)=>setAutomationPayload(event.target.value)} rows={5} spellCheck={false} /></label><div className="operator-action-buttons"><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf||selected.kind!=='rule'} onClick={()=>void runAutomationSimulation()}>ทดลองทำงาน</button><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf||selected.kind!=='rule'} onClick={()=>void runAutomationToggle()}>{selected.enabled===true?'ปิดกฎ':'เปิดกฎ'}</button></div></div>}
          {active==='admission'&&<div className="operator-action-body"><p>การควบคุมการรับงานสงวนความจุสำหรับการกู้คืนโดยไม่ลดขนาดเซิร์ฟเวอร์ งานความปลอดภัย การสนับสนุน และการวินิจฉัยยังทำงานได้ ส่วนงานโครงสร้าง เบื้องหลัง ผู้ให้บริการ และงานชุดอาจเลื่อนตามหลักฐานความจุล่าสุด</p><div className="operator-schedule-grid"><label>ชุดค่า<select value={admissionPreset} onChange={(event)=>setAdmissionPreset(event.target.value as typeof admissionPreset)}><option value="BALANCED">สมดุล</option><option value="CONSERVATIVE">ระมัดระวัง</option><option value="MAX_AVAILABILITY">ความพร้อมใช้งานสูงสุด</option></select></label><label>โหมด<select value={admissionMode} onChange={(event)=>setAdmissionMode(event.target.value==='OBSERVE'?'OBSERVE':'ENFORCE')}><option value="ENFORCE">บังคับใช้</option><option value="OBSERVE">เฝ้าดูเท่านั้น</option></select></label><label className="operator-checkbox"><input type="checkbox" checked={admissionFailClosed} onChange={(event)=>setAdmissionFailClosed(event.target.checked)} /> ปิดแบบปลอดภัยสำหรับงานผลกระทบสูงเมื่อหลักฐานความจุล้าสมัย</label></div><button type="button" className="secondary-action" disabled={actionState.busy||!csrf} onClick={()=>void runAdmissionPolicy()}>{actionState.busy?'กำลังบันทึก…':'บันทึกนโยบายการรับงาน'}</button></div>}
          {active==='budgets'&&<div className="operator-action-body"><p>งบทรัพยากรปกป้องขอบเขตควบคุมและโควตา งานที่ไม่จำเป็นจะถูกเลื่อนเมื่อบังคับใช้ ส่วนโหมดเฝ้าดูจะบันทึกหลักฐานเกินงบโดยไม่บล็อก งานความปลอดภัยและการสนับสนุนไม่ผ่านงบงานเสริมเหล่านี้</p><div className="operator-schedule-grid"><label className="operator-checkbox"><input type="checkbox" checked={budgetEnabled} onChange={(event)=>setBudgetEnabled(event.target.checked)} /> เปิดใช้</label><label>โหมด<select value={budgetMode} onChange={(event)=>setBudgetMode(event.target.value==='OBSERVE'?'OBSERVE':'ENFORCE')}><option value="ENFORCE">บังคับใช้</option><option value="OBSERVE">เฝ้าดูเท่านั้น</option></select></label><label>ช่วงเวลา (วินาที)<input inputMode="numeric" value={budgetWindowSeconds} onChange={(event)=>setBudgetWindowSeconds(event.target.value)} /></label><label>จำนวนหน่วยสูงสุด<input inputMode="numeric" value={budgetMaxUnits} onChange={(event)=>setBudgetMaxUnits(event.target.value)} /></label></div><button type="button" className="secondary-action" disabled={actionState.busy||!csrf} onClick={()=>void runBudgetPolicy()}>{actionState.busy?'กำลังบันทึก…':'บันทึกนโยบายงบทรัพยากร'}</button></div>}
          {active==='integrations'&&<div className="operator-action-body"><p>การเปิดใช้ต้องมีอะแดปเตอร์ที่ลงทะเบียนในรันไทม์ การตั้งค่าผู้ให้บริการสาธารณะจะตรวจตามสคีมา และจะปฏิเสธค่าที่มีข้อมูลลับ</p>
            {String(selected.integration_key)==='riot-data-dragon'&&<div className="operator-schedule-grid"><label>ภาษาข้อมูล Data Dragon<select value={integrationLocale} onChange={(event)=>setIntegrationLocale(event.target.value)}><option value="th_TH">ไทย (th_TH)</option><option value="en_US">อังกฤษ (en_US)</option><option value="ja_JP">ญี่ปุ่น (ja_JP)</option><option value="ko_KR">เกาหลี (ko_KR)</option><option value="zh_TW">จีน (zh_TW)</option></select></label><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void integrationAction('save-config')}>บันทึกภาษา</button></div>}
            {String(selected.integration_key)==='github-releases'&&<div className="operator-schedule-grid"><label>เจ้าของคลัง<input value={integrationOwner} maxLength={100} onChange={(event)=>setIntegrationOwner(event.target.value)} placeholder="ชื่อเจ้าของคลัง" /></label><label>คลัง<input value={integrationRepo} maxLength={100} onChange={(event)=>setIntegrationRepo(event.target.value)} placeholder="ชื่อคลัง" /></label><label className="operator-checkbox"><input type="checkbox" checked={integrationPrerelease} onChange={(event)=>setIntegrationPrerelease(event.target.checked)} /> รวมรุ่นก่อนเผยแพร่</label><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf||!integrationOwner||!integrationRepo} onClick={()=>void integrationAction('save-config')}>บันทึกคลัง</button></div>}
            <div className="operator-action-buttons"><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void integrationAction('health')}>ตรวจสุขภาพระบบ</button><button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void integrationAction('toggle')}>{selected.enabled===true?'ปิดใช้':'เปิดใช้'}</button>{Boolean((selected.capabilities as Record<string,unknown>|undefined)?.webhooks)&&<button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf} onClick={()=>void integrationAction('webhook')}>ผูกค่าตัวแปรแวดล้อมของเว็บฮุก</button>}{Boolean((selected.capabilities as Record<string,unknown>|undefined)?.content)&&<button type="button" className="secondary-action compact-action" disabled={actionState.busy||!csrf||selected.enabled!==true} onClick={()=>void integrationAction('sync')}>ซิงก์เนื้อหาจากผู้ให้บริการ</button>}</div></div>}
        </aside>}
        {actionState.message&&<div className={actionState.error?'operator-action-message error':'operator-action-message success'}>{actionState.message}</div>}
        <div className="operator-foot"><span>{thValue(data?.source??'durable-state')}</span><span>{data?.generatedAt?new Date(data.generatedAt).toLocaleString('th-TH'):'—'}</span><span>{mutationView?'อนุญาตเฉพาะการดำเนินการที่ควบคุม ไม่มีการแก้ไขตามอำเภอใจ':'หลักฐานปฏิบัติงานแบบอ่านอย่างเดียว'}</span></div>
      </>}
  </section>;
}
