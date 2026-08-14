import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import type { DailyMetricRecord } from '@autoserver/analytics';

export type RecommendationRisk = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
export interface Recommendation { key: string; title: string; reason: string; risk: RecommendationRisk; destructive: boolean; evidence: Record<string, unknown>; }
export function mayAutoApplyRecommendation(recommendation: Recommendation, policy: 'NOTIFY_ONLY' | 'LOW_RISK_AUTO' | 'ASK_CONFIRMATION'): boolean {
  if (recommendation.destructive || recommendation.risk === 'HIGH') return false;
  return policy === 'LOW_RISK_AUTO' && (recommendation.risk === 'INFO' || recommendation.risk === 'LOW');
}

function value(metrics:readonly DailyMetricRecord[],key:string):number { return metrics.find((item)=>item.metricKey===key&&Object.keys(item.dimensions).length===0)?.value??0; }

export function recommendFromDailyMetrics(metrics:readonly DailyMetricRecord[]):Recommendation[] {
  const out:Recommendation[]=[];
  const joined=value(metrics,'members.joined'); const verified=value(metrics,'verification.succeeded');
  if(joined>=10 && verified/joined<0.6) out.push({key:'onboarding.verification-friction',title:'ตรวจแรงเสียดทานในขั้นตอนยืนยันตัวตน',reason:'จำนวนการยืนยันตัวตนสำเร็จรายวันต่ำกว่า 60% ของสมาชิกที่เข้าร่วมตามบันทึก',risk:'MEDIUM',destructive:false,evidence:{joined,verified,conversion:verified/joined}});
  const ticketCreated=value(metrics,'tickets.created'); const resolution=value(metrics,'tickets.resolution_minutes_avg');
  if(ticketCreated>=5 && resolution>720) out.push({key:'support.resolution-latency',title:'ตรวจความจุของทีมช่วยเหลือ',reason:'เวลาเฉลี่ยในการปิดคำขอช่วยเหลือเกิน 12 ชั่วโมงในวันที่มีปริมาณคำขอมากพอให้ประเมินได้',risk:'MEDIUM',destructive:false,evidence:{ticketCreated,resolutionMinutes:resolution}});
  const security=value(metrics,'security.observations');
  if(security>=10) out.push({key:'security.observation-spike',title:'ตรวจการพุ่งขึ้นของกิจกรรมความปลอดภัย',reason:'จำนวนข้อสังเกตด้านความปลอดภัยเชิงโครงสร้างเกินเกณฑ์ตรวจสอบรายวัน',risk:'HIGH',destructive:false,evidence:{observations:security}});
  const lfg=value(metrics,'gaming.lfg_created');
  if(lfg>=20) out.push({key:'gaming.lfg-capacity',title:'พิจารณาเพิ่มความจุห้องเสียงสำหรับปาร์ตี้',reason:'การสร้างกลุ่มหาเพื่อนเล่นมีปริมาณสูง การเพิ่มห้องเสียงชั่วคราวหรือจัดเส้นทางปาร์ตี้ให้ชัดขึ้นอาจลดความติดขัด',risk:'INFO',destructive:false,evidence:{lfgCreated:lfg}});
  const panelActions=value(metrics,'panels.interactions');
  if(joined>=10 && panelActions===0) out.push({key:'panels.zero-engagement',title:'ตรวจตำแหน่งและการมองเห็นของแผงควบคุม',reason:'มีสมาชิกใหม่ในวันเดียวกัน แต่ไม่พบการโต้ตอบกับแผงควบคุมที่ระบบดูแล',risk:'LOW',destructive:false,evidence:{joined,panelActions}});
  return out;
}

export class RecommendationService {
  constructor(private readonly database:Database) {}
  async refreshGuild(guildId:string,recommendations:readonly Recommendation[]):Promise<number> {
    let changed=0;
    for(const item of recommendations) {
      const existing=(await this.database.requirePool().query<any>(`select recommendation_id from recommendations where guild_id=$1 and recommendation_key=$2 and status='OPEN' order by created_at desc limit 1`,[guildId,item.key])).rows[0];
      if(existing) {
        await this.database.requirePool().query(`update recommendations set risk=$3,destructive=$4,title=$5,reason=$6,evidence=$7 where recommendation_id=$1 and guild_id=$2`,[existing.recommendation_id,guildId,item.risk,item.destructive,item.title,item.reason,item.evidence]);
      } else {
        await this.database.requirePool().query(`insert into recommendations(recommendation_id,guild_id,recommendation_key,risk,destructive,title,reason,evidence,status) values($1,$2,$3,$4,$5,$6,$7,$8,'OPEN')`,[randomUUID(),guildId,item.key,item.risk,item.destructive,item.title,item.reason,item.evidence]);
      }
      changed+=1;
    }
    return changed;
  }
  async listOpen(guildId:string,limit=25):Promise<Array<Recommendation & {recommendationId:string}>> {
    const {rows}=await this.database.requirePool().query<any>(`select * from recommendations where guild_id=$1 and status='OPEN' order by case risk when 'HIGH' then 4 when 'MEDIUM' then 3 when 'LOW' then 2 else 1 end desc,created_at desc limit $2`,[guildId,Math.max(1,Math.min(100,limit))]);
    return rows.map((row)=>({recommendationId:String(row.recommendation_id),key:String(row.recommendation_key),title:String(row.title),reason:String(row.reason),risk:row.risk,destructive:Boolean(row.destructive),evidence:row.evidence??{}}));
  }
}
