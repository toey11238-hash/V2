import { Boxes, GitBranch, ShieldAlert, Undo2, Waves } from 'lucide-react';
import { thModule, thValue } from '../ui-thai';

type TwinNode={logicalKey:string;name:string;kind:string;module:string;parentKey?:string;state:string;risk:string;required:boolean;mutatesDiscord:boolean;reason:string};
type TwinLane={module:string;nodes:number;mutations:number;conflicts:number;highRisk:number};
export type DigitalTwinReport={
  mode:'READ_ONLY_PREVIEW';applyBlocked:boolean;overallRisk:string;riskScore:number;nodes:TwinNode[];lanes:TwinLane[];
  summary:{total:number;mutations:number;discordMutations:number;mappingOnly:number;conflicts:number;highRisk:number;requiredConflicts:number};
  apiPressure:{mutationUnits:number;modelRisk:string;note:string};rollback:{snapshotRecommended:boolean;previousStateEvidence:number;createReversalCandidates:number;updateReversalCandidates:number;note:string};reasons:string[];
};

const stateLabel:Record<string,string>={CREATE:'สร้าง',ADOPT:'รับดูแล',KEEP:'คงไว้',UPDATE:'ปรับ',SKIP:'ข้าม',CONFLICT:'ขัดแย้ง'};

export function DigitalTwinConsole({twin}:{twin:DigitalTwinReport|null|undefined}){
  if(!twin)return <section className="panel twin-console twin-empty"><div className="panel-heading"><div><span className="kicker"><Boxes size={14}/> ฝาแฝดจำลอง</span><h2>เห็นผลกระทบก่อนแตะ Discord จริง</h2></div><span className="safety-badge">อ่านอย่างเดียว</span></div><p>กด “สแกนและดูตัวอย่าง” ในศูนย์ตั้งค่าเพื่อสร้างแผนผังจากสถานะเป้าหมายและสถานะ Discord จริง ระบบจะไม่สร้างสถานะจำลองขึ้นเอง</p></section>;
  const visibleLanes=twin.lanes.slice(0,12);
  const visibleNodes=twin.nodes.filter((node)=>['CREATE','UPDATE','ADOPT','CONFLICT'].includes(node.state)).slice(0,72);
  return <section className="panel twin-console" data-risk={twin.overallRisk.toLowerCase()}>
    <div className="panel-heading"><div><span className="kicker"><Boxes size={14}/> ฝาแฝดจำลองเซิร์ฟเวอร์</span><h2>สถานะจริง → เป้าหมาย → ผลกระทบ แบบอ่านอย่างเดียว</h2></div><span className={`twin-gate ${twin.applyBlocked?'blocked':'clear'}`}>{twin.applyBlocked?'ถูกบล็อกด้วยข้อขัดแย้ง':'พร้อมเข้าสู่ขั้นอนุมัติ'}</span></div>
    <div className="twin-command-spine" aria-label="หลักฐานผลกระทบของฝาแฝดจำลอง">
      <span><b>{thValue(twin.overallRisk)}</b>ความเสี่ยง · {twin.riskScore}/100</span><span><b>{twin.summary.discordMutations}</b>การเปลี่ยน Discord</span><span><b>{twin.summary.conflicts}</b>ข้อขัดแย้ง</span><span><b>{thValue(twin.apiPressure.modelRisk)}</b>แรงกดดัน API</span><span><b>{twin.rollback.snapshotRecommended?'ควรมี':'ไม่บังคับ'}</b>ข้อมูลสำรองสถานะก่อนใช้</span>
    </div>
    <div className="twin-layout">
      <div className="twin-topology" role="img" aria-label={`ฝาแฝดจำลอง ${visibleNodes.length} โหนดใน ${visibleLanes.length} โมดูล`}>
        <div className="twin-axis"><span>สถานะจริง</span><i/><span>สถานะเป้าหมาย</span></div>
        {visibleLanes.map((lane)=>{
          const nodes=visibleNodes.filter((node)=>node.module===lane.module);
          if(!nodes.length)return null;
          return <div className="twin-lane" key={lane.module}>
            <div className="twin-lane-label"><strong>{thModule(lane.module)}</strong><span>{lane.mutations} เปลี่ยน · {lane.conflicts} ขัดแย้ง</span></div>
            <div className="twin-node-track">{nodes.map((node)=><div key={node.logicalKey} className={`twin-node state-${node.state.toLowerCase()} risk-${node.risk.toLowerCase()}`} title={`${node.logicalKey} · ${node.reason}`}><i/><div><strong>{node.name}</strong><span>{stateLabel[node.state]??thValue(node.state)} · {thValue(node.kind)}</span></div></div>)}</div>
          </div>;
        })}
      </div>
      <aside className="twin-evidence">
        <div><GitBranch size={17}/><strong>ขอบเขตการเปลี่ยนแปลง</strong><p>{twin.summary.mutations} รายการ · เฉพาะการแมป {twin.summary.mappingOnly} · หลักฐานสถานะเดิม {twin.rollback.previousStateEvidence}</p></div>
        <div><Waves size={17}/><strong>แรงกดดัน API</strong><p>{twin.apiPressure.note}</p></div>
        <div><Undo2 size={17}/><strong>ขอบเขตย้อนกลับ</strong><p>{twin.rollback.note}</p></div>
        {twin.reasons.slice(0,5).map((reason,index)=><div className="twin-reason" key={`${reason}-${index}`}><ShieldAlert size={15}/><span>{reason}</span></div>)}
      </aside>
    </div>
  </section>;
}
