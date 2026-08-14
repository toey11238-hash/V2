import { useMemo, useState } from 'react';
import { thValue } from '../ui-thai';

type SetupDraftLike = Record<string, unknown> & { blueprintKey: string };
type Preview = { mode:string; target:{key:string;version:number}; risk:string; impact?:{level:string;score:number;affectedModules:string[];approvalRecommended:boolean;reasons:string[]}; planHash:string; destructiveActions:number; summary:Record<string,number>; actionableCount:number; conflicts:number; retirements:Array<{logicalKey:string;disposition:string;reason:string}>; actions:Array<{type:string;logicalKey:string;kind:string;name:string;risk:string;reason:string}> };
type RequestState = { changeRunId:string; approvalId:string; risk:string; requiredApprovals:number; planHash:string; correlationId:string };
type ResourceKind = 'CATEGORY'|'ROLE'|'TEXT_CHANNEL'|'FORUM_CHANNEL'|'VOICE_CHANNEL';
type Complexity = 'compact'|'standard'|'advanced'|'enterprise';
type ResourceDraft = { id:string; logicalKey:string; kind:ResourceKind; name:string; parentKey:string; module:string; ownership:'SYSTEM_OWNED'|'TEMPLATE_OWNED'; required:boolean; visibility:'PUBLIC'|'VERIFIED'|'NEW_MEMBER'|'STAFF'|'EVENT'|'BOT'|'ARCHIVE' };

const RESOURCE_KINDS: Array<{kind:ResourceKind;label:string;glyph:string}> = [
  {kind:'CATEGORY',label:'หมวดหมู่',glyph:'⌗'},
  {kind:'TEXT_CHANNEL',label:'ข้อความ',glyph:'#'},
  {kind:'FORUM_CHANNEL',label:'ฟอรัม',glyph:'◫'},
  {kind:'VOICE_CHANNEL',label:'เสียง',glyph:'◉'},
  {kind:'ROLE',label:'ยศ',glyph:'◆'},
];

function nextLogicalKey(kind:ResourceKind,index:number):string {
  const prefix=kind==='ROLE'?'ROLE':kind==='CATEGORY'?'CATEGORY':kind==='VOICE_CHANNEL'?'VOICE':kind==='FORUM_CHANNEL'?'FORUM':'CHANNEL';
  return `${prefix}_CUSTOM_${String(index).padStart(2,'0')}`;
}
function slugName(kind:ResourceKind,index:number):string {
  if(kind==='CATEGORY')return `กำหนดเอง ${index}`;
  if(kind==='ROLE')return `ยศกำหนดเอง ${index}`;
  if(kind==='VOICE_CHANNEL')return `เสียง-กำหนดเอง-${index}`;
  if(kind==='FORUM_CHANNEL')return `ฟอรัม-กำหนดเอง-${index}`;
  return `ห้อง-กำหนดเอง-${index}`;
}
function emptyResource(kind:ResourceKind,index:number):ResourceDraft {
  return {id:crypto.randomUUID(),logicalKey:nextLogicalKey(kind,index),kind,name:slugName(kind,index),parentKey:'',module:'custom',ownership:'TEMPLATE_OWNED',required:true,visibility:kind==='ROLE'||kind==='CATEGORY'?'PUBLIC':'VERIFIED'};
}

export function ChangeControlConsole({api,guildId,authenticated,csrf,draft}:{api:string;guildId:string;authenticated:boolean;csrf?:string;draft:SetupDraftLike}){
  const [mode,setMode]=useState('TEMPLATE_MIGRATION');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [requestState,setRequestState]=useState<RequestState|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [blueprintJson,setBlueprintJson]=useState('');
  const [blueprintKey,setBlueprintKey]=useState('community-plus');
  const [blueprintName,setBlueprintName]=useState('คอมมูนิตี้ พลัส');
  const [blueprintDescription,setBlueprintDescription]=useState('แม่แบบเซิร์ฟเวอร์กำหนดเองที่สร้างจากศูนย์ควบคุมผู้ดูแล');
  const [complexity,setComplexity]=useState<Complexity>('advanced');
  const [resources,setResources]=useState<ResourceDraft[]>([emptyResource('CATEGORY',1),emptyResource('TEXT_CHANNEL',1)]);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const headers=():Record<string,string>=>csrf?{'content-type':'application/json','x-csrf-token':csrf}:{'content-type':'application/json'};
  const call=async(path:string,body?:unknown)=>{const response=await fetch(`${api}${path}`,{method:'POST',credentials:'include',headers:headers(),body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'คำขอล้มเหลว');return data;};
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(err){setMessage(err instanceof Error?err.message:'คำขอล้มเหลว');}finally{setBusy(false);}};
  const previewChange=()=>run(async()=>{const data=await call(`/api/guilds/${guildId}/change/preview`,{mode,draft});setPreview(data);setRequestState(null);setMessage(`สร้างตัวอย่าง ${data.planHash} · ${data.actionableCount} การดำเนินการ · ${data.retirements?.length??0} รายการทบทวนการเลิกใช้`);});
  const requestChange=()=>run(async()=>{if(!preview)return;const data=await call(`/api/guilds/${guildId}/change/request`,{mode,draft,planHash:preview.planHash});setRequestState(data);setMessage(`ส่งคำขออนุมัติแล้ว · ${thValue(data.risk)} · ต้องมีผู้อนุมัติอิสระ ${data.requiredApprovals} คน`);});
  const approve=()=>run(async()=>{if(!requestState)return;await call(`/api/guilds/${guildId}/approvals/${requestState.approvalId}/approve`,{});setMessage('บันทึกการอนุมัติแล้ว ผู้ร้องขอจะอนุมัติคำขอของตนเองไม่ได้เมื่อขัดนโยบาย');});
  const execute=()=>run(async()=>{if(!requestState)return;const data=await call(`/api/guilds/${guildId}/change/${requestState.changeRunId}/execute`,{});setMessage(`เข้าคิวงาน ${data.jobId} แล้ว และสร้างข้อมูลสำรองก่อนย้าย ${data.preMigrationBackupId}`);});

  const blueprint=useMemo(()=>{
    const enabledModules=[...new Set(resources.map(item=>item.module.trim()).filter(Boolean))];
    return {key:blueprintKey,version:1,displayName:blueprintName,description:blueprintDescription,complexity,enabledModules,resources:resources.map(({id,parentKey,visibility,...resource})=>({
      ...resource,
      parentKey:parentKey||undefined,
      visibility:resource.kind==='ROLE'||resource.kind==='CATEGORY'?undefined:visibility,
      reason:`แม่แบบกำหนดเอง: ${blueprintName}`,
    }))};
  },[blueprintKey,blueprintName,blueprintDescription,complexity,resources]);

  const categories=resources.filter(item=>item.kind==='CATEGORY');
  const resourceCounts=useMemo(()=>Object.fromEntries(RESOURCE_KINDS.map(({kind})=>[kind,resources.filter(item=>item.kind===kind).length])),[resources]);
  const addResource=(kind:ResourceKind)=>setResources(current=>[...current,emptyResource(kind,current.filter(item=>item.kind===kind).length+1)]);
  const patchResource=(id:string,patch:Partial<ResourceDraft>)=>setResources(current=>current.map(item=>item.id===id?{...item,...patch}:item));
  const removeResource=(id:string)=>setResources(current=>{const removed=current.find(item=>item.id===id);return current.filter(item=>item.id!==id).map(item=>removed&&item.parentKey===removed.logicalKey?{...item,parentKey:''}:item);});
  const syncJson=()=>{setBlueprintJson(JSON.stringify(blueprint,null,2));setAdvancedOpen(true);};
  const loadJson=()=>run(async()=>{const parsed=JSON.parse(blueprintJson);const incoming=Array.isArray(parsed.resources)?parsed.resources:[];setBlueprintKey(String(parsed.key??'community-plus').replace(/^custom:/,''));setBlueprintName(String(parsed.displayName??'แม่แบบกำหนดเอง'));setBlueprintDescription(String(parsed.description??''));setComplexity(['compact','standard','advanced','enterprise'].includes(parsed.complexity)?parsed.complexity:'advanced');setResources(incoming.map((item:any,index:number)=>({id:crypto.randomUUID(),logicalKey:String(item.logicalKey??`RESOURCE_${index+1}`),kind:item.kind as ResourceKind,name:String(item.name??'ทรัพยากร'),parentKey:String(item.parentKey??''),module:String(item.module??'custom'),ownership:item.ownership==='SYSTEM_OWNED'?'SYSTEM_OWNED':'TEMPLATE_OWNED',required:item.required!==false,visibility:item.visibility??'VERIFIED'})));setMessage('โหลด JSON ขั้นสูงเข้าสู่ตัวสร้างภาพแล้ว โปรดตรวจสอบก่อนบันทึก');});
  const saveVisualBlueprint=()=>run(async()=>{const data=await call(`/api/guilds/${guildId}/custom-blueprints`,{blueprint,publish:false});setBlueprintJson(JSON.stringify(blueprint,null,2));setMessage(`บันทึกแม่แบบกำหนดเอง ${data.blueprint.key} รุ่น ${data.blueprint.version} เป็นฉบับร่างแล้ว · เช็กซัม ${data.checksum?.slice?.(0,12)??'บันทึกแล้ว'}`);});
  const saveRawBlueprint=()=>run(async()=>{const payload=JSON.parse(blueprintJson);const data=await call(`/api/guilds/${guildId}/custom-blueprints`,{blueprint:payload,publish:false});setMessage(`บันทึกแม่แบบกำหนดเอง ${data.blueprint.key} รุ่น ${data.blueprint.version} เป็นฉบับร่างแล้ว · เช็กซัม ${data.checksum?.slice?.(0,12)??'บันทึกแล้ว'}`);});
  const snapshotAppliedBlueprint=()=>run(async()=>{const data=await call(`/api/guilds/${guildId}/documentation/blueprint/snapshot`,{});setMessage(`บันทึกภาพรวมรายงานแม่แบบที่ใช้งานเป็น ${data.documentId} · SHA-256 ${String(data.contentHash).slice(0,12)}…`);});

  if(!authenticated||!guildId)return <section className="panel change-control"><div className="setup-empty">เข้าสู่ระบบและเลือกเซิร์ฟเวอร์ที่คุณจัดการได้เพื่อใช้ระบบควบคุมการเปลี่ยนแปลง</div></section>;
  return <section className="panel change-control" aria-label="การควบคุมการเปลี่ยนแปลงแบบมีการกำกับ">
    <div className="panel-heading"><div><span className="kicker">ควบคุมการเปลี่ยนแปลง</span><h2>ตรวจตัวอย่าง อนุมัติ สำรองข้อมูล แล้วจึงนำไปใช้</h2></div><span className="safety-badge">ไม่ลบอัตโนมัติ</span></div>
    <div className="change-grid">
      <div><label>โหมดการเปลี่ยนแปลง<select value={mode} onChange={e=>{setMode(e.target.value);setPreview(null);setRequestState(null);}}><option value="TEMPLATE_MIGRATION">ย้ายแม่แบบ</option><option value="SAFE_REBUILD">สร้างใหม่แบบปลอดภัย</option><option value="PARTIAL_REBUILD">สร้างใหม่บางส่วน</option></select></label>
        <p>แม่แบบเป้าหมาย: <strong>{draft.blueprintKey}</strong>. ทรัพยากรส่วนเกินที่ระบบดูแลจะเข้าสู่รายการทบทวนการเลิกใช้ ส่วนทรัพยากรของผู้ใช้และทรัพยากรที่ล็อกจะถูกเก็บไว้</p>
        <div className="action-row"><button disabled={busy} onClick={()=>void previewChange()}>ดูตัวอย่างความต่าง</button><button disabled={busy||!preview||preview.conflicts>0} onClick={()=>void requestChange()}>ขออนุมัติ</button><button disabled={busy||!requestState} onClick={()=>void approve()}>อนุมัติ</button><button className="danger-outline" disabled={busy||!requestState} onClick={()=>void execute()}>ดำเนินงาน</button></div>
        {preview&&<><div className="change-metrics"><span>ความเสี่ยง <b>{thValue(preview.risk)}</b></span><span>ผลกระทบ <b>{thValue(preview.impact?.level??'—')} {preview.impact?`(${preview.impact.score}/100)`:''}</b></span><span>การดำเนินการ <b>{preview.actionableCount}</b></span><span>ข้อขัดแย้ง <b>{preview.conflicts}</b></span><span>ทำลายข้อมูล <b>{preview.destructiveActions}</b></span></div>{preview.impact&&<div className="retirement-list"><div><code>เหตุผลของผลกระทบ</code><span>{preview.impact.approvalRecommended?'แนะนำให้ขออนุมัติ':'อยู่ในขอบเขต'}</span><small>{preview.impact.reasons.slice(0,3).join(' · ')}</small></div></div>}</>}
        {preview?.retirements?.length?<div className="retirement-list">{preview.retirements.slice(0,8).map(item=><div key={item.logicalKey}><code>{item.logicalKey}</code><span>{thValue(item.disposition)}</span><small>{item.reason}</small></div>)}</div>:null}
      </div>

      <div className="blueprint-composer">
        <div className="composer-head"><div><span className="kicker">ตัวสร้างแม่แบบ</span><h3>ออกแบบโครงสร้างแบบเห็นภาพ</h3></div><div className="composer-count">{resources.length}<small>ทรัพยากร</small></div></div>
        <div className="composer-meta-grid">
          <label>คีย์<input value={blueprintKey} onChange={e=>setBlueprintKey(e.target.value.replace(/^custom:/,''))} placeholder="เช่น community-plus"/></label>
          <label>ชื่อ<input value={blueprintName} onChange={e=>setBlueprintName(e.target.value)} placeholder="คอมมูนิตี้ พลัส"/></label>
          <label>ความซับซ้อน<select value={complexity} onChange={e=>setComplexity(e.target.value as Complexity)}><option value="compact">กะทัดรัด</option><option value="standard">มาตรฐาน</option><option value="advanced">ขั้นสูง</option><option value="enterprise">องค์กร</option></select></label>
          <label className="composer-description">วัตถุประสงค์<input value={blueprintDescription} onChange={e=>setBlueprintDescription(e.target.value)} placeholder="โครงสร้างเซิร์ฟเวอร์นี้ใช้เพื่ออะไร"/></label>
        </div>
        <div className="resource-palette" aria-label="เพิ่มทรัพยากรแม่แบบ">{RESOURCE_KINDS.map(item=><button type="button" key={item.kind} onClick={()=>addResource(item.kind)}><b>{item.glyph}</b><span>{item.label}</span><small>{resourceCounts[item.kind]??0}</small></button>)}</div>
        <div className="resource-stack">{resources.map((item,index)=><article className="resource-card" key={item.id}>
          <div className="resource-card-head"><span className={`resource-kind kind-${item.kind.toLowerCase()}`}>{RESOURCE_KINDS.find(entry=>entry.kind===item.kind)?.glyph} {thValue(item.kind)}</span><strong>{String(index+1).padStart(2,'0')}</strong><button type="button" className="icon-danger" aria-label={`นำ ${item.logicalKey} ออก`} onClick={()=>removeResource(item.id)}>×</button></div>
          <div className="resource-fields">
            <label>คีย์ตรรกะ<input value={item.logicalKey} onChange={e=>patchResource(item.id,{logicalKey:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,'_')})}/></label>
            <label>ชื่อใน Discord<input value={item.name} onChange={e=>patchResource(item.id,{name:e.target.value})}/></label>
            <label>ชนิด<select value={item.kind} onChange={e=>patchResource(item.id,{kind:e.target.value as ResourceKind,parentKey:e.target.value==='ROLE'||e.target.value==='CATEGORY'?'':item.parentKey})}>{RESOURCE_KINDS.map(entry=><option value={entry.kind} key={entry.kind}>{entry.label}</option>)}</select></label>
            <label>โมดูล<input value={item.module} onChange={e=>patchResource(item.id,{module:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')})}/></label>
            {item.kind!=='ROLE'&&item.kind!=='CATEGORY'?<label>หมวดหลัก<select value={item.parentKey} onChange={e=>patchResource(item.id,{parentKey:e.target.value})}><option value="">ไม่มีหมวด</option>{categories.filter(category=>category.id!==item.id).map(category=><option value={category.logicalKey} key={category.id}>{category.name} · {category.logicalKey}</option>)}</select></label>:null}
            {item.kind!=='ROLE'&&item.kind!=='CATEGORY'?<label>การมองเห็น<select value={item.visibility} onChange={e=>patchResource(item.id,{visibility:e.target.value as ResourceDraft['visibility']})}><option value="PUBLIC">สาธารณะ</option><option value="VERIFIED">ยืนยันแล้ว</option><option value="NEW_MEMBER">สมาชิกใหม่</option><option value="STAFF">ทีมงาน</option><option value="EVENT">กิจกรรม</option><option value="BOT">บอต</option><option value="ARCHIVE">คลังเก็บ</option></select></label>:null}
          </div>
          <div className="resource-card-foot"><label className="checkline"><input type="checkbox" checked={item.required} onChange={e=>patchResource(item.id,{required:e.target.checked})}/>จำเป็น</label><label>เจ้าของทรัพยากร<select value={item.ownership} onChange={e=>patchResource(item.id,{ownership:e.target.value as ResourceDraft['ownership']})}><option value="TEMPLATE_OWNED">แม่แบบเป็นเจ้าของ</option><option value="SYSTEM_OWNED">ระบบเป็นเจ้าของ</option></select></label></div>
        </article>)}</div>
        <div className="blueprint-tree-preview" aria-label="ตัวอย่างต้นไม้แม่แบบ"><span className="kicker">โครงสร้างสด</span><strong>{blueprintName||'แม่แบบยังไม่มีชื่อ'}</strong>{categories.map(category=><div className="tree-category" key={category.id}><code>⌗ {category.name}</code>{resources.filter(item=>item.parentKey===category.logicalKey).map(child=><span key={child.id}>└─ {RESOURCE_KINDS.find(entry=>entry.kind===child.kind)?.glyph} {child.name}</span>)}</div>)}{resources.filter(item=>item.kind==='ROLE').map(role=><div className="tree-role" key={role.id}>◆ {role.name}</div>)}</div>
        <div className="action-row"><button disabled={busy||resources.length===0||!blueprintKey.trim()||!blueprintName.trim()} onClick={()=>void saveVisualBlueprint()}>ตรวจสอบและบันทึกฉบับร่าง</button><button type="button" className="secondary-action" onClick={syncJson}>เปิด JSON ขั้นสูง</button><button type="button" className="secondary-action" disabled={busy||!csrf} onClick={()=>void snapshotAppliedBlueprint()}>บันทึกภาพรวมรายงานที่ใช้งาน</button></div>
        <details className="advanced-blueprint" open={advancedOpen} onToggle={e=>setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}><summary>JSON ขั้นสูงสำหรับกรณีพิเศษ</summary><p>ใช้เฉพาะคุณสมบัติที่ตัวสร้างภาพยังไม่รองรับ การโหลด JSON จะไม่เปลี่ยน Discord โดยตรง</p><textarea value={blueprintJson} onChange={e=>setBlueprintJson(e.target.value)} placeholder='{"key":"community-plus","version":1,"displayName":"คอมมูนิตี้ พลัส",...}'/><div className="action-row"><button type="button" className="secondary-action" disabled={busy||!blueprintJson.trim()} onClick={()=>void loadJson()}>โหลดเข้าสู่ตัวสร้าง</button><button disabled={busy||!blueprintJson.trim()} onClick={()=>void saveRawBlueprint()}>ตรวจสอบฉบับร่างดิบ</button></div></details>
      </div>
    </div>
    {message&&<div className="recovery-message">{message}</div>}
  </section>;
}
