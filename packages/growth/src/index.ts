export type GrowthMode = 'SMALL' | 'STANDARD' | 'LARGE' | 'ENTERPRISE';
export interface GuildCapacitySignals { memberCount: number; roleCount: number; channelCount: number; activeTickets7d?: number; events30d?: number; lfg30d?: number; staffCount?: number; }
export interface GrowthAssessment { mode: GrowthMode; score: number; reasons: string[]; recommendations: string[]; recommendedComplexity: 'compact'|'standard'|'advanced'|'enterprise'; recommendedModules: string[]; operationalControls: string[]; }

export function assessGrowth(signals: GuildCapacitySignals): GrowthAssessment {
  const memberScore = Math.min(55, Math.log10(Math.max(10, signals.memberCount)) * 18);
  const structureScore = Math.min(20, signals.channelCount / 8 + signals.roleCount / 12);
  const activityScore = Math.min(25, (signals.activeTickets7d ?? 0) / 8 + (signals.events30d ?? 0) / 5 + (signals.lfg30d ?? 0) / 20);
  const score = Math.round(Math.min(100, memberScore + structureScore + activityScore));
  const mode: GrowthMode = score >= 78 || signals.memberCount >= 20_000 ? 'ENTERPRISE' : score >= 60 || signals.memberCount >= 5_000 ? 'LARGE' : score >= 35 || signals.memberCount >= 500 ? 'STANDARD' : 'SMALL';
  const reasons = [`สมาชิก ${signals.memberCount} คน`, `ช่อง ${signals.channelCount} ช่อง`, `ยศ ${signals.roleCount} ยศ`];
  if ((signals.activeTickets7d ?? 0) >= 50) reasons.push('ปริมาณคำขอช่วยเหลือสูง');
  if ((signals.lfg30d ?? 0) >= 200) reasons.push('กิจกรรมหาเพื่อนเล่นสูง');
  const recommendations: string[] = [];
  if (mode === 'SMALL') recommendations.push('ใช้โครงสร้างกะทัดรัดและหลีกเลี่ยงช่องที่มีสัญญาณการใช้งานต่ำ');
  if (mode === 'STANDARD') recommendations.push('จัดหมวดตามโมดูลและกำหนดการทำความสะอาดพื้นผิวที่ไม่มีการใช้งาน');
  if (mode === 'LARGE') recommendations.push('เพิ่มการแบ่งหน้าที่ทีมงาน นโยบายเก็บถาวร และการสังเกตสถานะคิวให้ละเอียดขึ้น');
  if (mode === 'ENTERPRISE') recommendations.push('บังคับการอนุมัติที่เข้มงวด เปลี่ยนแปลงเป็นระยะ ทยอยเปิดใช้ และเตรียมพร้อมสำหรับหลายเวิร์กเกอร์หรือการแบ่งชาร์ด');
  const recommendedComplexity:GrowthAssessment['recommendedComplexity']=mode==='SMALL'?'compact':mode==='STANDARD'?'standard':mode==='LARGE'?'advanced':'enterprise';
  const recommendedModules=mode==='SMALL'?['welcome','verification','roles','tickets','moderation','events']:mode==='STANDARD'?['welcome','verification','roles','tickets','moderation','events','scheduler','backup','analytics']:mode==='LARGE'?['tickets','reports','moderation','security','events','scheduler','backup','repair','diagnostics','analytics','recommendations']:['approvals','change-control','security','backup','repair','diagnostics','analytics','recommendations','feature-flags','maintenance','retention'];
  const operationalControls=mode==='SMALL'?['บันทึกแบบกะทัดรัด','คิวช่วยเหลือเดียว']:mode==='STANDARD'?['ทำความสะอาดตามกำหนด','กำหนดเจ้าของโมดูล']:mode==='LARGE'?['แบ่งหน้าที่ทีมงาน','สุขภาพคิว','นโยบายเก็บรักษา','แจ้งเตือนเหตุผิดปกติ']:['อนุมัติแยกอิสระ','เปลี่ยนแปลงเป็นระยะ','ทยอยเปิดใช้','พร้อมรองรับหลายเวิร์กเกอร์','ซ้อมกู้คืน'];
  return { mode, score, reasons, recommendations, recommendedComplexity, recommendedModules, operationalControls };
}

export interface RecommendationCandidate { key: string; purpose: string; expectedWeeklyUse: number; audienceCoverage: number; moderationCost: number; duplicateRisk: number; }
export interface RecommendationScore { key: string; score: number; recommendation: 'RECOMMEND' | 'OPTIONAL' | 'OMIT'; rationale: string[]; }
export function scoreChannelRecommendation(candidate: RecommendationCandidate): RecommendationScore {
  const use = Math.min(45, Math.max(0, candidate.expectedWeeklyUse) * 4.5);
  const coverage = Math.min(30, Math.max(0, candidate.audienceCoverage) * 30);
  const penalty = Math.min(45, Math.max(0, candidate.moderationCost) * 20 + Math.max(0, candidate.duplicateRisk) * 25);
  const score = Math.round(Math.max(0, Math.min(100, 30 + use + coverage - penalty)));
  return { key: candidate.key, score, recommendation: score >= 70 ? 'RECOMMEND' : score >= 45 ? 'OPTIONAL' : 'OMIT', rationale: [`purpose:${candidate.purpose}`, `weekly-use:${candidate.expectedWeeklyUse}`, `audience:${Math.round(candidate.audienceCoverage * 100)}%`, `moderation-cost:${candidate.moderationCost}`, `duplicate-risk:${candidate.duplicateRisk}`] };
}
export function scoreRoleRecommendation(candidate: RecommendationCandidate): RecommendationScore { return scoreChannelRecommendation({ ...candidate, moderationCost: candidate.moderationCost * 1.15 }); }
