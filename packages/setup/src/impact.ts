export type SetupImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SetupImpactAction {
  type: 'CREATE' | 'ADOPT' | 'KEEP' | 'UPDATE' | 'SKIP' | 'CONFLICT';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  desired: { logicalKey: string; kind: string; module: string; required?: boolean };
}

export interface SetupImpactReport {
  level: SetupImpactLevel;
  score: number;
  mutationCount: number;
  highRiskCount: number;
  conflictCount: number;
  requiredConflictCount: number;
  affectedModules: string[];
  affectedKinds: Record<string, number>;
  approvalRecommended: boolean;
  reasons: string[];
}

const actionWeight: Record<SetupImpactAction['type'], number> = {
  CREATE: 2,
  ADOPT: 1,
  KEEP: 0,
  UPDATE: 3,
  SKIP: 0,
  CONFLICT: 8,
};
const riskWeight: Record<SetupImpactAction['risk'], number> = { LOW: 0, MEDIUM: 2, HIGH: 5 };

export function analyzeSetupImpact(actions: readonly SetupImpactAction[]): SetupImpactReport {
  if (actions.length > 5000) throw new Error('SETUP_IMPACT_ACTION_LIMIT');
  let score = 0;
  let mutationCount = 0;
  let highRiskCount = 0;
  let conflictCount = 0;
  let requiredConflictCount = 0;
  const modules = new Set<string>();
  const kinds: Record<string, number> = {};

  for (const action of actions) {
    if (!action.desired?.logicalKey || !action.desired?.kind || !action.desired?.module) throw new Error('SETUP_IMPACT_ACTION_INVALID');
    score += actionWeight[action.type] + riskWeight[action.risk];
    if (['CREATE', 'ADOPT', 'UPDATE'].includes(action.type)) {
      mutationCount += 1;
      modules.add(action.desired.module);
      kinds[action.desired.kind] = (kinds[action.desired.kind] ?? 0) + 1;
    }
    if (action.risk === 'HIGH') highRiskCount += 1;
    if (action.type === 'CONFLICT') {
      conflictCount += 1;
      if (action.desired.required) requiredConflictCount += 1;
    }
  }

  if (mutationCount >= 100) score += 12;
  else if (mutationCount >= 40) score += 7;
  else if (mutationCount >= 15) score += 3;
  if (modules.size >= 10) score += 4;
  if (requiredConflictCount) score += 10;
  score = Math.min(100, score);

  const level: SetupImpactLevel = requiredConflictCount > 0 || score >= 60
    ? 'CRITICAL'
    : conflictCount > 0 || highRiskCount >= 3 || score >= 35
      ? 'HIGH'
      : score >= 15 || mutationCount >= 10
        ? 'MEDIUM'
        : 'LOW';
  const reasons: string[] = [];
  if (conflictCount) reasons.push(`ข้อขัดแย้งของทรัพยากรที่ยังไม่แก้ ${conflictCount} รายการ`);
  if (requiredConflictCount) reasons.push(`ข้อขัดแย้งของทรัพยากรจำเป็น ${requiredConflictCount} รายการ`);
  if (highRiskCount) reasons.push(`การดำเนินการความเสี่ยงสูง ${highRiskCount} รายการ`);
  if (mutationCount >= 40) reasons.push(`มีการเปลี่ยนทรัพยากรที่ระบบดูแล ${mutationCount} รายการในการปรับใช้ครั้งเดียว`);
  if (modules.size >= 10) reasons.push(`กระทบ ${modules.size} โมดูล`);
  if (!reasons.length) reasons.push('การเปลี่ยนแปลงทรัพยากรที่ระบบดูแลอยู่ในขอบเขตและไม่มีข้อขัดแย้งค้าง');

  return {
    level,
    score,
    mutationCount,
    highRiskCount,
    conflictCount,
    requiredConflictCount,
    affectedModules: [...modules].sort(),
    affectedKinds: Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b))),
    approvalRecommended: level === 'HIGH' || level === 'CRITICAL',
    reasons,
  };
}
