export type DigitalTwinMutationType='CREATE'|'ADOPT'|'KEEP'|'UPDATE'|'SKIP'|'CONFLICT';
export type DigitalTwinRisk='LOW'|'MEDIUM'|'HIGH'|'CRITICAL';

export interface DigitalTwinActionInput{
  type:DigitalTwinMutationType;
  risk:'LOW'|'MEDIUM'|'HIGH';
  reason:string;
  desired:{logicalKey:string;kind:string;module:string;name:string;parentKey?:string;required?:boolean};
  actual?:{discordId?:string;name?:string;parentLogicalKey?:string};
}

export interface DigitalTwinNode{
  logicalKey:string;
  name:string;
  kind:string;
  module:string;
  parentKey?:string;
  state:DigitalTwinMutationType;
  risk:'LOW'|'MEDIUM'|'HIGH';
  required:boolean;
  actualId?:string;
  actualName?:string;
  mutatesDiscord:boolean;
  reason:string;
}

export interface DigitalTwinEdge{from:string;to:string;relation:'PARENT'}
export interface DigitalTwinLane{module:string;nodes:number;mutations:number;conflicts:number;highRisk:number}

export interface DigitalTwinReport{
  schemaVersion:1;
  mode:'READ_ONLY_PREVIEW';
  applyBlocked:boolean;
  overallRisk:DigitalTwinRisk;
  riskScore:number;
  nodes:DigitalTwinNode[];
  edges:DigitalTwinEdge[];
  lanes:DigitalTwinLane[];
  summary:{total:number;mutations:number;discordMutations:number;mappingOnly:number;conflicts:number;highRisk:number;requiredConflicts:number};
  apiPressure:{mutationUnits:number;modelRisk:'LOW'|'MEDIUM'|'HIGH';note:string};
  rollback:{snapshotRecommended:boolean;previousStateEvidence:number;createReversalCandidates:number;updateReversalCandidates:number;note:string};
  reasons:string[];
}

const riskRank:Record<DigitalTwinRisk,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function maxRisk(...levels:DigitalTwinRisk[]):DigitalTwinRisk{
  return levels.reduce((best,current)=>riskRank[current]>riskRank[best]?current:best,'LOW' as DigitalTwinRisk);
}

export function buildServerDigitalTwin(input:{
  actions:readonly DigitalTwinActionInput[];
  structuralImpact?:{level:DigitalTwinRisk;score:number;reasons?:readonly string[]};
  configurationImpact?:{level:DigitalTwinRisk;score:number;reasons?:readonly string[]};
}):DigitalTwinReport{
  if(input.actions.length>5000)throw new Error('DIGITAL_TWIN_ACTION_LIMIT');
  const nodes:DigitalTwinNode[]=[];
  const edges:DigitalTwinEdge[]=[];
  const laneMap=new Map<string,DigitalTwinLane>();
  let mutations=0,discordMutations=0,mappingOnly=0,conflicts=0,highRisk=0,requiredConflicts=0,previousStateEvidence=0,createReversalCandidates=0,updateReversalCandidates=0;
  for(const action of input.actions){
    const desired=action.desired;
    if(!desired?.logicalKey||!desired.kind||!desired.module||!desired.name)throw new Error('DIGITAL_TWIN_ACTION_INVALID');
    const mutatesDiscord=action.type==='CREATE'||action.type==='UPDATE';
    const mutation=mutatesDiscord||action.type==='ADOPT';
    if(mutation)mutations+=1;
    if(mutatesDiscord)discordMutations+=1;
    if(action.type==='ADOPT')mappingOnly+=1;
    if(action.type==='CONFLICT'){conflicts+=1;if(desired.required)requiredConflicts+=1;}
    if(action.risk==='HIGH')highRisk+=1;
    if(action.actual?.discordId||action.actual?.name)previousStateEvidence+=1;
    if(action.type==='CREATE')createReversalCandidates+=1;
    if(action.type==='UPDATE'&&action.actual)updateReversalCandidates+=1;
    nodes.push({logicalKey:desired.logicalKey,name:desired.name,kind:desired.kind,module:desired.module,parentKey:desired.parentKey,state:action.type,risk:action.risk,required:Boolean(desired.required),actualId:action.actual?.discordId,actualName:action.actual?.name,mutatesDiscord,reason:action.reason});
    if(desired.parentKey)edges.push({from:desired.parentKey,to:desired.logicalKey,relation:'PARENT'});
    const lane=laneMap.get(desired.module)??{module:desired.module,nodes:0,mutations:0,conflicts:0,highRisk:0};
    lane.nodes+=1;if(mutation)lane.mutations+=1;if(action.type==='CONFLICT')lane.conflicts+=1;if(action.risk==='HIGH')lane.highRisk+=1;laneMap.set(desired.module,lane);
  }
  nodes.sort((a,b)=>a.module.localeCompare(b.module)||a.parentKey?.localeCompare(b.parentKey??'')||a.logicalKey.localeCompare(b.logicalKey));
  edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
  const lanes=[...laneMap.values()].sort((a,b)=>b.conflicts-a.conflicts||b.highRisk-a.highRisk||b.mutations-a.mutations||a.module.localeCompare(b.module));
  const structural=input.structuralImpact??{level:'LOW' as const,score:0,reasons:[]};
  const configuration=input.configurationImpact??{level:'LOW' as const,score:0,reasons:[]};
  const conflictRisk:DigitalTwinRisk=requiredConflicts?'CRITICAL':conflicts?'HIGH':'LOW';
  const overallRisk=maxRisk(structural.level,configuration.level,conflictRisk);
  const riskScore=clamp(Math.max(structural.score,configuration.score)+Math.min(20,conflicts*5)+Math.min(10,highRisk*2),0,100);
  const modelRisk=discordMutations>=80?'HIGH':discordMutations>=25?'MEDIUM':'LOW';
  const reasons=[...(structural.reasons??[]),...(configuration.reasons??[])];
  if(conflicts)reasons.unshift(`มีข้อขัดแย้งในฝาแฝดจำลอง ${conflicts} รายการ`);
  if(discordMutations>=25)reasons.push(`มีการเปลี่ยนทรัพยากร Discord ${discordMutations} หน่วย ควรตรวจแรงกดดันต่อ API ก่อนนำไปใช้`);
  if(!reasons.length)reasons.push('ฝาแฝดจำลองไม่พบข้อขัดแย้งหรือสัญญาณความเสี่ยงที่ยกระดับ');
  return{
    schemaVersion:1,
    mode:'READ_ONLY_PREVIEW',
    applyBlocked:conflicts>0,
    overallRisk,
    riskScore,
    nodes,
    edges,
    lanes,
    summary:{total:nodes.length,mutations,discordMutations,mappingOnly,conflicts,highRisk,requiredConflicts},
    apiPressure:{mutationUnits:discordMutations,modelRisk,note:'หน่วยแรงกดดันนับเฉพาะการสร้างหรือแก้ทรัพยากร Discord จากแผน ไม่ใช่เวลาประมาณการและไม่ใช่จำนวนคำขอเครือข่ายที่รับประกัน'},
    rollback:{snapshotRecommended:overallRisk==='HIGH'||overallRisk==='CRITICAL'||discordMutations>=25,previousStateEvidence,createReversalCandidates,updateReversalCandidates,note:'ตัวอย่างการย้อนกลับเป็นหลักฐานประกอบเท่านั้น การย้อนจริงต้องใช้ข้อมูลสำรองสถานะ การอนุมัติ และตรวจสถานะ Discord ซ้ำก่อนทุกครั้ง'},
    reasons:[...new Set(reasons)].slice(0,12),
  };
}
