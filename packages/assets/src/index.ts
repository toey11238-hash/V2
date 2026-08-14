import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from '@autoserver/core';
import { resolveThemePack, pulseColor, type ServerPulseState, type VisualThemePack } from '@autoserver/visual-system';

export interface RenderedAsset {
  logicalKey: string;
  path: string;
  format: 'png' | 'gif';
  width: number;
  height: number;
  bytes: number;
  hash: string;
}

export interface AssetTheme {
  name: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  accent?: string;
  secondary?: string;
  motif?: 'ORBIT' | 'GRID' | 'WAVE' | 'BRACKET' | 'SHIELD' | 'NODE' | 'PETAL' | 'RASTER' | 'MONO';
}

const palette = {
  obsidian: '#0A1020', navy: '#111B35', cobalt: '#5B7CFA', ice: '#B8E5FF', amber: '#F5B544', pearl: '#F4F7FF',
  mint: '#39D98A', danger: '#F45B69', violet: '#9A7CFF', cyan: '#49D4FF',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);
}

export function commandBridgeSvg(theme: AssetTheme, phase = 0, width = 1600, height = 600): string {
  const orbit = 520 + Math.sin(phase * Math.PI * 2) * 22;
  const pulse = 0.28 + (Math.sin(phase * Math.PI * 2) + 1) * 0.12;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.obsidian}"/><stop offset="0.62" stop-color="${palette.navy}"/><stop offset="1" stop-color="#17234A"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${palette.cobalt}" stop-opacity="${pulse.toFixed(2)}"/><stop offset="1" stop-color="${palette.cobalt}" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="28"/></filter>
  </defs>
  <rect width="100%" height="100%" rx="42" fill="url(#bg)"/>
  <circle cx="1280" cy="300" r="${orbit}" fill="url(#glow)" filter="url(#blur)"/>
  <g opacity="0.46" stroke="${palette.ice}" fill="none">
    <circle cx="1280" cy="300" r="220"/><circle cx="1280" cy="300" r="154" stroke-dasharray="12 18"/>
    <circle cx="1280" cy="300" r="92" stroke="${palette.amber}" stroke-dasharray="2 14"/><path d="M1045 300H1515M1280 65V535" opacity="0.26"/>
  </g>
  <g fill="${palette.pearl}">
    <text x="110" y="170" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" letter-spacing="7" fill="${palette.ice}">${escapeXml(theme.eyebrow.toUpperCase())}</text>
    <text x="104" y="278" font-family="Arial,Helvetica,sans-serif" font-size="82" font-weight="800" letter-spacing="-3">${escapeXml(theme.title)}</text>
    <text x="110" y="352" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="500" fill="#C8D1EA">${escapeXml(theme.subtitle)}</text>
  </g>
  <g transform="translate(110 430)"><rect width="250" height="52" rx="26" fill="${palette.cobalt}" fill-opacity="0.18" stroke="${palette.cobalt}"/><circle cx="28" cy="26" r="7" fill="${palette.mint}"/><text x="48" y="34" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="${palette.pearl}">บัญญัติหลักพร้อมใช้</text></g>
  <g transform="translate(380 430)"><rect width="250" height="52" rx="26" fill="${palette.amber}" fill-opacity="0.11" stroke="${palette.amber}"/><text x="24" y="34" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="${palette.pearl}">สดจากเหตุการณ์จริง</text></g>
  </svg>`;
}

function motifSvg(motif: AssetTheme['motif'], accent: string, secondary: string, phase: number): string {
  const turn = Math.round(phase * 360);
  if (motif === 'GRID') return `<g opacity=".3" stroke="${accent}"><path d="M1030 90H1510M1030 170H1510M1030 250H1510M1030 330H1510M1030 410H1510M1110 50V500M1210 50V500M1310 50V500M1410 50V500"/><circle cx="1310" cy="280" r="92" fill="${accent}" fill-opacity=".06"/></g>`;
  if (motif === 'WAVE') return `<g fill="none" stroke="${accent}" opacity=".42"><path d="M950 250 C1050 ${140 + Math.sin(phase*6.28)*30},1160 390,1280 250 S1490 120,1590 250" stroke-width="5"/><path d="M960 315 C1100 190,1260 430,1540 220" stroke="${secondary}" stroke-width="2"/></g>`;
  if (motif === 'BRACKET') return `<g fill="none" stroke="${accent}" opacity=".46" stroke-width="4"><path d="M1080 120h140v80h130v80h130M1080 420h140v-80h130v-60"/><circle cx="1080" cy="120" r="10" fill="${secondary}"/><circle cx="1080" cy="420" r="10" fill="${secondary}"/><circle cx="1480" cy="280" r="12" fill="${secondary}"/></g>`;
  if (motif === 'SHIELD') return `<g transform="translate(1250 85) rotate(${Math.sin(phase*6.28)*2})"><path d="M0 0 L180 55 V205 C180 320 90 385 0 425 C-90 385-180 320-180 205V55Z" fill="${accent}" fill-opacity=".08" stroke="${accent}" stroke-width="4"/><path d="M-55 210l42 42 94-112" fill="none" stroke="${secondary}" stroke-width="16" stroke-linecap="round"/></g>`;
  if (motif === 'NODE') return `<g transform="translate(1280 285) rotate(${turn/12})" fill="none" stroke="${accent}" opacity=".5"><circle r="170"/><circle r="110" stroke-dasharray="8 16"/><path d="M-220 0H220M0-220V220"/><circle cx="170" cy="0" r="10" fill="${secondary}"/><circle cx="0" cy="-110" r="8" fill="${secondary}"/></g>`;
  if (motif === 'PETAL') return `<g transform="translate(1280 285) rotate(${Math.sin(phase*6.28)*3})" fill="none" stroke="${accent}" opacity=".48"><path d="M0-175C95-160 120-70 0 0C-120-70-95-160 0-175Z"/><path d="M175 0C160 95 70 120 0 0C70-120 160-95 175 0Z"/><path d="M0 175C-95 160-120 70 0 0C120 70 95 160 0 175Z"/><path d="M-175 0C-160-95-70-120 0 0C-70 120-160 95-175 0Z"/><circle r="32" fill="${secondary}" fill-opacity=".18"/></g>`;
  if (motif === 'RASTER') return `<g opacity=".34" fill="${accent}">${Array.from({length:9},(_,i)=>`<rect x="${1050+i*52}" y="${120+(i%2)*18}" width="22" height="${230+i*10}" rx="11" transform="rotate(${Math.sin(phase*6.28+i)*2} ${1061+i*52} 280)"/>`).join('')}</g>`;
  if (motif === 'MONO') return `<g transform="translate(1280 285)" fill="none" stroke="${accent}" opacity=".5"><rect x="-190" y="-150" width="380" height="300" rx="18"/><path d="M-190-70H190M-110-150V150M95-150V150"/><circle cx="95" cy="-70" r="18" fill="${secondary}" fill-opacity=".35"/></g>`;
  return `<g transform="translate(1280 285) rotate(${turn/20})" fill="none"><circle r="190" stroke="${accent}" stroke-opacity=".42"/><circle r="130" stroke="${secondary}" stroke-opacity=".28" stroke-dasharray="12 18"/><circle r="72" stroke="${accent}" stroke-opacity=".5"/><circle cx="190" cy="0" r="9" fill="${secondary}"/></g>`;
}

export function panelAssetSvg(theme: AssetTheme, phase = 0, width = 1600, height = 600): string {
  const accent = theme.accent ?? palette.cobalt;
  const secondary = theme.secondary ?? palette.ice;
  const motif = theme.motif ?? 'ORBIT';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080D1A"/><stop offset=".58" stop-color="#111A32"/><stop offset="1" stop-color="#181F38"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="${accent}" stop-opacity=".28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <filter id="blur2"><feGaussianBlur stdDeviation="32"/></filter>
  </defs>
  <rect width="100%" height="100%" rx="42" fill="url(#bg2)"/>
  <circle cx="1290" cy="290" r="400" fill="url(#halo)" filter="url(#blur2)"/>
  <path d="M0 518 C280 480 410 565 690 520 S1170 450 1600 510V600H0Z" fill="${accent}" fill-opacity=".035"/>
  ${motifSvg(motif, accent, secondary, phase)}
  <g font-family="Arial,Helvetica,sans-serif">
    <text x="104" y="138" font-size="24" font-weight="700" letter-spacing="7" fill="${secondary}">${escapeXml(theme.eyebrow.toUpperCase())}</text>
    <text x="100" y="255" font-size="78" font-weight="800" letter-spacing="-2.8" fill="${palette.pearl}">${escapeXml(theme.title)}</text>
    <text x="104" y="325" font-size="29" font-weight="500" fill="#C8D1EA">${escapeXml(theme.subtitle)}</text>
    <rect x="104" y="400" width="210" height="48" rx="24" fill="${accent}" fill-opacity=".11" stroke="${accent}" stroke-opacity=".7"/>
    <circle cx="132" cy="424" r="7" fill="${palette.mint}"/><text x="150" y="431" font-size="18" fill="${palette.pearl}">พื้นผิวที่ระบบดูแล</text>
  </g>
  </svg>`;
}


export function assetThemeFromVisualTheme(themeKey:string):AssetTheme{
  const pack=resolveThemePack(themeKey);
  return {name:pack.key,eyebrow:'ศูนย์บัญชาการภาพ',title:pack.label,subtitle:pack.signature,accent:pack.tokens.accent,secondary:pack.tokens.accentSecondary,motif:pack.motif};
}

const THAI_PULSE_STATE:Record<ServerPulseState,string>={IDLE:'สงบ',ACTIVE:'กำลังทำงาน',READY:'พร้อม',LIVE:'สด',SUCCESS:'สำเร็จ',WATCH:'เฝ้าระวัง',DEGRADED:'ประสิทธิภาพลดลง',INCIDENT:'เหตุผิดปกติ',MAINTENANCE:'บำรุงรักษา',SYNCING:'กำลังซิงก์',RECOVERY:'กำลังกู้คืน'};

export function pulseAssetTheme(themeKey:string,state:ServerPulseState):AssetTheme{
  const pack=resolveThemePack(themeKey);
  return {name:`${pack.key}-${state.toLowerCase()}`,eyebrow:'ชีพจรเซิร์ฟเวอร์',title:THAI_PULSE_STATE[state],subtitle:pack.signature,accent:pulseColor(pack.key,state),secondary:pack.tokens.accentSecondary,motif:pack.motif};
}

export const PANEL_ASSET_THEMES: Record<string, AssetTheme> = {
  welcome: { name: 'welcome', eyebrow: 'เริ่มต้นใช้งาน', title: 'ประตูต้อนรับ', subtitle: 'ยืนยันสิทธิ์จริง · ขั้นตอนชัดเจน · ตรวจสอบและกู้คืนได้', accent: palette.cobalt, secondary: palette.ice, motif: 'ORBIT' },
  rules: { name: 'rules', eyebrow: 'เริ่มต้นใช้งาน', title: 'กติกาและนโยบายเซิร์ฟเวอร์', subtitle: 'ยืนยันสิทธิ์จริง · ขั้นตอนชัดเจน · ตรวจสอบและกู้คืนได้', accent: palette.ice, secondary: palette.cobalt, motif: 'GRID' },
  verify: { name: 'verify', eyebrow: 'เริ่มต้นใช้งาน', title: 'ด่านยืนยันตัวตน', subtitle: 'ยืนยันสิทธิ์จริง · ขั้นตอนชัดเจน · ตรวจสอบและกู้คืนได้', accent: palette.mint, secondary: palette.ice, motif: 'SHIELD' },
  roles: { name: 'roles', eyebrow: 'อัตลักษณ์สมาชิก', title: 'อัตลักษณ์และยศ', subtitle: 'ยศและความต้องการ · สิทธิ์จริง · หลักสิทธิ์น้อยที่สุด', accent: palette.violet, secondary: palette.ice, motif: 'NODE' },
  notifications: { name: 'notifications', eyebrow: 'อัตลักษณ์สมาชิก', title: 'การแจ้งเตือนส่วนบุคคล', subtitle: 'ยศและความต้องการ · สิทธิ์จริง · หลักสิทธิ์น้อยที่สุด', accent: palette.cobalt, secondary: palette.cyan, motif: 'WAVE' },
  ticket: { name: 'ticket', eyebrow: 'งานช่วยเหลือ', title: 'ศูนย์ช่วยเหลือส่วนตัว', subtitle: 'รับเรื่องส่วนตัว · จัดคิว · ติดตามสถานะ · ตรวจสอบได้', accent: palette.amber, secondary: palette.ice, motif: 'NODE' },
  application: { name: 'application', eyebrow: 'งานช่วยเหลือ', title: 'ศูนย์รับสมัคร', subtitle: 'รับเรื่องส่วนตัว · จัดคิว · ติดตามสถานะ · ตรวจสอบได้', accent: palette.violet, secondary: palette.ice, motif: 'NODE' },
  report: { name: 'report', eyebrow: 'งานช่วยเหลือ', title: 'ศูนย์รายงานส่วนตัว', subtitle: 'รับเรื่องส่วนตัว · จัดคิว · ติดตามสถานะ · ตรวจสอบได้', accent: palette.danger, secondary: palette.amber, motif: 'SHIELD' },
  suggestion: { name: 'suggestion', eyebrow: 'งานช่วยเหลือ', title: 'ห้องทดลองข้อเสนอแนะ', subtitle: 'รับเรื่องส่วนตัว · จัดคิว · ติดตามสถานะ · ตรวจสอบได้', accent: palette.cyan, secondary: palette.violet, motif: 'ORBIT' },
  announcement: { name: 'announcement', eyebrow: 'กิจกรรม', title: 'ศูนย์ประกาศ', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.cobalt, secondary: palette.ice, motif: 'WAVE' },
  help: { name: 'help', eyebrow: 'งานช่วยเหลือ', title: 'ศูนย์ช่วยเหลือ', subtitle: 'รับเรื่องส่วนตัว · จัดคิว · ติดตามสถานะ · ตรวจสอบได้', accent: palette.ice, secondary: palette.violet, motif: 'GRID' },
  security: { name: 'security', eyebrow: 'ปฏิบัติการ', title: 'ศูนย์ความปลอดภัย', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.danger, secondary: palette.amber, motif: 'SHIELD' },
  status: { name: 'status', eyebrow: 'ปฏิบัติการ', title: 'สถานะเซิร์ฟเวอร์', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.mint, secondary: palette.ice, motif: 'WAVE' },
  staff: { name: 'staff', eyebrow: 'ปฏิบัติการ', title: 'ศูนย์บัญชาการทีมดูแล', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.violet, secondary: palette.ice, motif: 'NODE' },
  moderation: { name: 'moderation', eyebrow: 'ปฏิบัติการ', title: 'ศูนย์ดูแลชุมชน', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.danger, secondary: palette.amber, motif: 'SHIELD' },
  backup: { name: 'backup', eyebrow: 'ปฏิบัติการ', title: 'คลังสำรองข้อมูล', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.cyan, secondary: palette.mint, motif: 'GRID' },
  repair: { name: 'repair', eyebrow: 'ปฏิบัติการ', title: 'ศูนย์ซ่อมและตรวจความคลาดเคลื่อน', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.amber, secondary: palette.ice, motif: 'NODE' },
  integrations: { name: 'integrations', eyebrow: 'ปฏิบัติการ', title: 'ศูนย์การเชื่อมต่อ', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.cobalt, secondary: palette.cyan, motif: 'ORBIT' },
  privacy: { name: 'privacy', eyebrow: 'ปฏิบัติการ', title: 'ศูนย์ความเป็นส่วนตัวและการเก็บรักษา', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.violet, secondary: palette.ice, motif: 'SHIELD' },
  event: { name: 'event', eyebrow: 'กิจกรรม', title: 'ศูนย์กิจกรรม', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.amber, secondary: palette.violet, motif: 'ORBIT' },
  giveaway: { name: 'giveaway', eyebrow: 'กิจกรรม', title: 'กิจกรรมแจกของชุมชน', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.mint, secondary: palette.amber, motif: 'ORBIT' },
  'gaming-hub': { name: 'gaming-hub', eyebrow: 'ระบบเกม', title: 'ศูนย์เกมและชุมชนผู้เล่น', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.cobalt, secondary: palette.cyan, motif: 'NODE' },
  lfg: { name: 'lfg', eyebrow: 'ระบบเกม', title: 'ค้นหาปาร์ตี้', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.cyan, secondary: palette.ice, motif: 'WAVE' },
  'team-clan': { name: 'team-clan', eyebrow: 'ระบบเกม', title: 'ทีม แคลน และการรับสมาชิก', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.violet, secondary: palette.cyan, motif: 'NODE' },
  tournament: { name: 'tournament', eyebrow: 'ระบบเกม', title: 'ศูนย์การแข่งขัน', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.amber, secondary: palette.cobalt, motif: 'BRACKET' },
  profile: { name: 'profile', eyebrow: 'ระบบเกม', title: 'โปรไฟล์ผู้เล่น', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.ice, secondary: palette.violet, motif: 'ORBIT' },
  'game-event': { name: 'game-event', eyebrow: 'ระบบเกม', title: 'กิจกรรมเกม', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.mint, secondary: palette.cobalt, motif: 'BRACKET' },
  creator: { name: 'creator', eyebrow: 'ครีเอเตอร์', title: 'สตูดิโอครีเอเตอร์', subtitle: 'โจทย์งาน · สื่อ · ตรวจสอบ · เผยแพร่ · ทำงานร่วมกัน', accent: palette.violet, secondary: palette.amber, motif: 'WAVE' },
  education: { name: 'education', eyebrow: 'การเรียนรู้', title: 'ศูนย์การเรียนรู้', subtitle: 'ทรัพยากร · กลุ่มเรียน · พี่เลี้ยง · เส้นทางพัฒนา', accent: palette.cyan, secondary: palette.mint, motif: 'GRID' },
  business: { name: 'business', eyebrow: 'บริการและธุรกิจ', title: 'ศูนย์ธุรกิจ', subtitle: 'บริการ · การช่วยเหลือ · รีวิว · การดำเนินงานที่ตรวจสอบได้', accent: palette.amber, secondary: palette.ice, motif: 'GRID' },
  'server-guide': { name: 'server-guide', eyebrow: 'เริ่มต้นใช้งาน', title: 'แผนที่นำทางเซิร์ฟเวอร์', subtitle: 'ยืนยันสิทธิ์จริง · ขั้นตอนชัดเจน · ตรวจสอบและกู้คืนได้', accent: palette.ice, secondary: palette.cobalt, motif: 'GRID' },
  'community-programs': { name: 'community-programs', eyebrow: 'ชุมชน', title: 'โครงการชุมชน', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.cobalt, secondary: palette.mint, motif: 'NODE' },
  knowledge: { name: 'knowledge', eyebrow: 'คลังความรู้', title: 'คลังความรู้', subtitle: 'คู่มือ · ทรัพยากร · ผู้ดูแลเนื้อหา · ความสดใหม่', accent: palette.cyan, secondary: palette.ice, motif: 'GRID' },
  'member-services': { name: 'member-services', eyebrow: 'บริการสมาชิก', title: 'บริการสมาชิก', subtitle: 'การเข้าถึง · ภาษา · ความช่วยเหลือ · ข้อเสนอแนะ', accent: palette.mint, secondary: palette.ice, motif: 'ORBIT' },
  partnerships: { name: 'partnerships', eyebrow: 'พันธมิตร', title: 'เครือข่ายพันธมิตร', subtitle: 'ความร่วมมือ · ตรวจสอบสถานะ · ความรับผิดชอบ · บันทึกหลักฐาน', accent: palette.violet, secondary: palette.cyan, motif: 'NODE' },
  'media-lab': { name: 'media-lab', eyebrow: 'สื่อและแบรนด์', title: 'ห้องทดลองสื่อ', subtitle: 'สื่อ · อัตลักษณ์ · เวอร์ชัน · ตรวจสอบ · เผยแพร่', accent: palette.violet, secondary: palette.amber, motif: 'WAVE' },
  'voice-lounge': { name: 'voice-lounge', eyebrow: 'ชุมชน', title: 'เลานจ์เสียง', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.cobalt, secondary: palette.cyan, motif: 'WAVE' },
  'automation-lab': { name: 'automation-lab', eyebrow: 'ระบบอัตโนมัติ', title: 'ห้องทดลองอัตโนมัติ', subtitle: 'กฎ · กำหนดเวลา · งานคงทน · เหตุการณ์ · กู้คืนได้', accent: palette.cobalt, secondary: palette.amber, motif: 'NODE' },
  'trust-center': { name: 'trust-center', eyebrow: 'ความเชื่อมั่นและความปลอดภัย', title: 'ศูนย์ความไว้วางใจและความปลอดภัย', subtitle: 'สิทธิ์ · สัญญาณความเสี่ยง · เหตุผิดปกติ · การตรวจโดยมนุษย์', accent: palette.danger, secondary: palette.amber, motif: 'SHIELD' },
  'data-observatory': { name: 'data-observatory', eyebrow: 'ข้อมูลและการวิเคราะห์', title: 'หอสังเกตการณ์ข้อมูล', subtitle: 'ข้อมูลจริง · คุณภาพข้อมูล · ข้อจำกัดชัดเจน · ตัดสินใจจากหลักฐาน', accent: palette.ice, secondary: palette.violet, motif: 'GRID' },
  'change-control': { name: 'change-control', eyebrow: 'ควบคุมการเปลี่ยนแปลง', title: 'ศูนย์ควบคุมการเปลี่ยนแปลง', subtitle: 'พรีวิว · อนุมัติ · สำรอง · คานารี · ความจริงหลังเผยแพร่', accent: palette.amber, secondary: palette.cobalt, motif: 'BRACKET' },
  'asset-fabric': { name: 'asset-fabric', eyebrow: 'ปฏิบัติการ', title: 'โรงงานสื่ออัตโนมัติ', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.violet, secondary: palette.ice, motif: 'ORBIT' },
  'game-knowledge': { name: 'game-knowledge', eyebrow: 'ระบบเกม', title: 'คลังความรู้เกม', subtitle: 'ทีม · ปาร์ตี้ · โปรไฟล์ · ความก้าวหน้า · ไม่มีการเดิมพัน', accent: palette.cobalt, secondary: palette.cyan, motif: 'GRID' },
  'creator-network': { name: 'creator-network', eyebrow: 'ครีเอเตอร์', title: 'เครือข่ายครีเอเตอร์', subtitle: 'โจทย์งาน · สื่อ · ตรวจสอบ · เผยแพร่ · ทำงานร่วมกัน', accent: palette.violet, secondary: palette.amber, motif: 'WAVE' },
  'learning-paths': { name: 'learning-paths', eyebrow: 'การเรียนรู้', title: 'เส้นทางการเรียนรู้', subtitle: 'ทรัพยากร · กลุ่มเรียน · พี่เลี้ยง · เส้นทางพัฒนา', accent: palette.cyan, secondary: palette.mint, motif: 'GRID' },
  'service-operations': { name: 'service-operations', eyebrow: 'บริการและธุรกิจ', title: 'ปฏิบัติการบริการ', subtitle: 'บริการ · การช่วยเหลือ · รีวิว · การดำเนินงานที่ตรวจสอบได้', accent: palette.mint, secondary: palette.amber, motif: 'NODE' },
  'accessibility-center': { name: 'accessibility-center', eyebrow: 'บริการสมาชิก', title: 'ศูนย์การเข้าถึง', subtitle: 'การเข้าถึง · ภาษา · ความช่วยเหลือ · ข้อเสนอแนะ', accent: palette.mint, secondary: palette.ice, motif: 'ORBIT' },
  'language-center': { name: 'language-center', eyebrow: 'บริการสมาชิก', title: 'ศูนย์ภาษา', subtitle: 'การเข้าถึง · ภาษา · ความช่วยเหลือ · ข้อเสนอแนะ', accent: palette.cyan, secondary: palette.ice, motif: 'WAVE' },
  'volunteer-center': { name: 'volunteer-center', eyebrow: 'ชุมชน', title: 'ศูนย์อาสาสมัคร', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.mint, secondary: palette.cobalt, motif: 'NODE' },
  'ambassador-center': { name: 'ambassador-center', eyebrow: 'ชุมชน', title: 'ศูนย์ทูตชุมชน', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.violet, secondary: palette.cyan, motif: 'ORBIT' },
  'tutorial-library': { name: 'tutorial-library', eyebrow: 'คลังความรู้', title: 'ห้องสมุดบทเรียน', subtitle: 'คู่มือ · ทรัพยากร · ผู้ดูแลเนื้อหา · ความสดใหม่', accent: palette.ice, secondary: palette.cobalt, motif: 'GRID' },
  'resource-directory': { name: 'resource-directory', eyebrow: 'คลังความรู้', title: 'สารบัญทรัพยากร', subtitle: 'คู่มือ · ทรัพยากร · ผู้ดูแลเนื้อหา · ความสดใหม่', accent: palette.cobalt, secondary: palette.ice, motif: 'GRID' },
  'permission-review': { name: 'permission-review', eyebrow: 'ความเชื่อมั่นและความปลอดภัย', title: 'ตรวจสอบสิทธิ์', subtitle: 'สิทธิ์ · สัญญาณความเสี่ยง · เหตุผิดปกติ · การตรวจโดยมนุษย์', accent: palette.danger, secondary: palette.amber, motif: 'SHIELD' },
  'incident-timeline': { name: 'incident-timeline', eyebrow: 'ความเชื่อมั่นและความปลอดภัย', title: 'ไทม์ไลน์เหตุผิดปกติ', subtitle: 'สิทธิ์ · สัญญาณความเสี่ยง · เหตุผิดปกติ · การตรวจโดยมนุษย์', accent: palette.danger, secondary: palette.ice, motif: 'WAVE' },
  'recommendation-review': { name: 'recommendation-review', eyebrow: 'ข้อมูลและการวิเคราะห์', title: 'ตรวจสอบคำแนะนำระบบ', subtitle: 'ข้อมูลจริง · คุณภาพข้อมูล · ข้อจำกัดชัดเจน · ตัดสินใจจากหลักฐาน', accent: palette.ice, secondary: palette.violet, motif: 'NODE' },
  'deployment-log': { name: 'deployment-log', eyebrow: 'ควบคุมการเปลี่ยนแปลง', title: 'บันทึกการนำระบบขึ้นใช้งาน', subtitle: 'พรีวิว · อนุมัติ · สำรอง · คานารี · ความจริงหลังเผยแพร่', accent: palette.amber, secondary: palette.cobalt, motif: 'BRACKET' },
  'partner-review': { name: 'partner-review', eyebrow: 'พันธมิตร', title: 'ตรวจสอบพันธมิตร', subtitle: 'ความร่วมมือ · ตรวจสอบสถานะ · ความรับผิดชอบ · บันทึกหลักฐาน', accent: palette.amber, secondary: palette.violet, motif: 'GRID' },
  'creator-analytics': { name: 'creator-analytics', eyebrow: 'ครีเอเตอร์', title: 'วิเคราะห์ครีเอเตอร์', subtitle: 'โจทย์งาน · สื่อ · ตรวจสอบ · เผยแพร่ · ทำงานร่วมกัน', accent: palette.violet, secondary: palette.amber, motif: 'WAVE' },
  'learning-analytics': { name: 'learning-analytics', eyebrow: 'การเรียนรู้', title: 'วิเคราะห์การเรียนรู้', subtitle: 'ทรัพยากร · กลุ่มเรียน · พี่เลี้ยง · เส้นทางพัฒนา', accent: palette.cyan, secondary: palette.mint, motif: 'GRID' },
  'business-analytics': { name: 'business-analytics', eyebrow: 'บริการและธุรกิจ', title: 'วิเคราะห์บริการ', subtitle: 'บริการ · การช่วยเหลือ · รีวิว · การดำเนินงานที่ตรวจสอบได้', accent: palette.mint, secondary: palette.amber, motif: 'NODE' },
  'customer-success': { name: 'customer-success', eyebrow: 'บริการและธุรกิจ', title: 'ความสำเร็จของผู้รับบริการ', subtitle: 'บริการ · การช่วยเหลือ · รีวิว · การดำเนินงานที่ตรวจสอบได้', accent: palette.mint, secondary: palette.ice, motif: 'ORBIT' },
  'known-issues': { name: 'known-issues', eyebrow: 'บริการและธุรกิจ', title: 'ปัญหาที่ทราบแล้ว', subtitle: 'บริการ · การช่วยเหลือ · รีวิว · การดำเนินงานที่ตรวจสอบได้', accent: palette.amber, secondary: palette.danger, motif: 'GRID' },
  'member-directory': { name: 'member-directory', eyebrow: 'ชุมชน', title: 'ทำเนียบสมาชิก', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.ice, secondary: palette.cobalt, motif: 'NODE' },
  'interest-hub': { name: 'interest-hub', eyebrow: 'ชุมชน', title: 'ศูนย์ความสนใจ', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.cobalt, secondary: palette.cyan, motif: 'ORBIT' },
  'community-calendar': { name: 'community-calendar', eyebrow: 'กิจกรรม', title: 'ปฏิทินชุมชน', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.amber, secondary: palette.cobalt, motif: 'BRACKET' },
  'member-care': { name: 'member-care', eyebrow: 'บริการสมาชิก', title: 'ดูแลสมาชิก', subtitle: 'การเข้าถึง · ภาษา · ความช่วยเหลือ · ข้อเสนอแนะ', accent: palette.mint, secondary: palette.ice, motif: 'ORBIT' },
  'accessibility-requests': { name: 'accessibility-requests', eyebrow: 'บริการสมาชิก', title: 'คำขอด้านการเข้าถึง', subtitle: 'การเข้าถึง · ภาษา · ความช่วยเหลือ · ข้อเสนอแนะ', accent: palette.mint, secondary: palette.cyan, motif: 'WAVE' },
  'project-lab': { name: 'project-lab', eyebrow: 'ชุมชน', title: 'ห้องทดลองโครงการ', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.violet, secondary: palette.cyan, motif: 'NODE' },
  'help-wanted': { name: 'help-wanted', eyebrow: 'ชุมชน', title: 'ประกาศตามหาผู้ช่วย', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.ice, secondary: palette.violet, motif: 'GRID' },
  'project-showcase': { name: 'project-showcase', eyebrow: 'ชุมชน', title: 'เวทีแสดงผลงาน', subtitle: 'โครงการ · อาสา · กิจกรรม · การมีส่วนร่วมอย่างเป็นระบบ', accent: palette.violet, secondary: palette.amber, motif: 'WAVE' },
  'event-studio': { name: 'event-studio', eyebrow: 'กิจกรรม', title: 'สตูดิโอกิจกรรม', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.amber, secondary: palette.violet, motif: 'BRACKET' },
  'event-registration': { name: 'event-registration', eyebrow: 'กิจกรรม', title: 'ลงทะเบียนกิจกรรม', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.cobalt, secondary: palette.amber, motif: 'ORBIT' },
  'event-recaps': { name: 'event-recaps', eyebrow: 'กิจกรรม', title: 'สรุปกิจกรรม', subtitle: 'ลงทะเบียน · เช็กอิน · แจ้งเตือน · ผลลัพธ์จากสถานะจริง', accent: palette.ice, secondary: palette.amber, motif: 'GRID' },
  'content-studio': { name: 'content-studio', eyebrow: 'สื่อและแบรนด์', title: 'สตูดิโอเนื้อหา', subtitle: 'สื่อ · อัตลักษณ์ · เวอร์ชัน · ตรวจสอบ · เผยแพร่', accent: palette.violet, secondary: palette.amber, motif: 'WAVE' },
  'media-review': { name: 'media-review', eyebrow: 'สื่อและแบรนด์', title: 'ตรวจสอบสื่อ', subtitle: 'สื่อ · อัตลักษณ์ · เวอร์ชัน · ตรวจสอบ · เผยแพร่', accent: palette.amber, secondary: palette.violet, motif: 'GRID' },
  'brand-assets': { name: 'brand-assets', eyebrow: 'สื่อและแบรนด์', title: 'คลังอัตลักษณ์แบรนด์', subtitle: 'สื่อ · อัตลักษณ์ · เวอร์ชัน · ตรวจสอบ · เผยแพร่', accent: palette.violet, secondary: palette.ice, motif: 'ORBIT' },
  'knowledge-ops': { name: 'knowledge-ops', eyebrow: 'คลังความรู้', title: 'ปฏิบัติการคลังความรู้', subtitle: 'คู่มือ · ทรัพยากร · ผู้ดูแลเนื้อหา · ความสดใหม่', accent: palette.ice, secondary: palette.cyan, motif: 'GRID' },
  'member-ops': { name: 'member-ops', eyebrow: 'ปฏิบัติการ', title: 'ปฏิบัติการสมาชิก', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.amber, secondary: palette.ice, motif: 'NODE' },
  'reliability-ops': { name: 'reliability-ops', eyebrow: 'ปฏิบัติการ', title: 'ปฏิบัติการความเสถียร', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.mint, secondary: palette.cobalt, motif: 'WAVE' },
  'capacity-planning': { name: 'capacity-planning', eyebrow: 'ข้อมูลและการวิเคราะห์', title: 'วางแผนความจุและงบประมาณ', subtitle: 'ข้อมูลจริง · คุณภาพข้อมูล · ข้อจำกัดชัดเจน · ตัดสินใจจากหลักฐาน', accent: palette.ice, secondary: palette.violet, motif: 'BRACKET' },
  'provider-health': { name: 'provider-health', eyebrow: 'ปฏิบัติการ', title: 'สุขภาพผู้ให้บริการ', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.cobalt, secondary: palette.mint, motif: 'NODE' },
  'recovery-drills': { name: 'recovery-drills', eyebrow: 'ปฏิบัติการ', title: 'ซ้อมแผนกู้คืน', subtitle: 'สถานะจริง · บันทึกตรวจสอบ · กู้คืน · ไม่สร้างผลลัพธ์ปลอม', accent: palette.danger, secondary: palette.amber, motif: 'SHIELD' },
  'theme-studio': { name:'theme-studio', eyebrow:'ระบบภาพ', title:'สตูดิโอธีม', subtitle:'ธีม · สื่อ · การเคลื่อนไหว · สถานะจริง · รองรับการเข้าถึง', accent:palette.violet, secondary:palette.ice, motif:'RASTER' },
  'asset-gallery': { name:'asset-gallery', eyebrow:'ระบบภาพ', title:'แกลเลอรีสื่อ', subtitle:'ธีม · สื่อ · การเคลื่อนไหว · สถานะจริง · รองรับการเข้าถึง', accent:palette.cyan, secondary:palette.violet, motif:'GRID' },
  'role-gallery': { name:'role-gallery', eyebrow:'ระบบภาพ', title:'แกลเลอรียศ', subtitle:'ธีม · สื่อ · การเคลื่อนไหว · สถานะจริง · รองรับการเข้าถึง', accent:palette.amber, secondary:palette.violet, motif:'NODE' },
  'server-pulse': { name:'server-pulse', eyebrow:'ระบบภาพ', title:'ชีพจรเซิร์ฟเวอร์', subtitle:'ธีม · สื่อ · การเคลื่อนไหว · สถานะจริง · รองรับการเข้าถึง', accent:palette.mint, secondary:palette.cobalt, motif:'ORBIT' },
  'scene-presets': { name:'scene-presets', eyebrow:'ระบบภาพ', title:'ฉากสำเร็จรูป', subtitle:'ธีม · สื่อ · การเคลื่อนไหว · สถานะจริง · รองรับการเข้าถึง', accent:palette.violet, secondary:palette.cyan, motif:'WAVE' },
};

export class AssetRenderer {
  constructor(private readonly outputDir: string) {}

  async renderBanner(logicalKey: string, theme: AssetTheme): Promise<RenderedAsset> {
    return this.renderSvgPng(logicalKey, commandBridgeSvg(theme));
  }

  async renderPanelBanner(logicalKey: string, theme: AssetTheme): Promise<RenderedAsset> {
    return this.renderSvgPng(logicalKey, panelAssetSvg(theme));
  }

  private async renderSvgPng(logicalKey: string, svg: string): Promise<RenderedAsset> {
    const path = resolve(this.outputDir, `${logicalKey}.png`);
    await mkdir(dirname(path), { recursive: true });
    const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path, buffer);
    return { logicalKey, path, format: 'png', width: 1600, height: 600, bytes: buffer.length, hash: sha256(buffer) };
  }

  async renderAnimatedPulse(logicalKey: string, theme: AssetTheme, panelMode = false): Promise<RenderedAsset> {
    const frames = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
      const svg = panelMode ? panelAssetSvg(theme, index / 12, 1200, 450) : commandBridgeSvg(theme, index / 12, 1200, 450);
      return sharp(Buffer.from(svg)).png().toBuffer();
    }));
    const buffer = await sharp(frames, { join: { animated: true } }).gif({ loop: 0, delay: Array(12).fill(90), effort: 3 }).toBuffer();
    const path = resolve(this.outputDir, `${logicalKey}.gif`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
    return { logicalKey, path, format: 'gif', width: 1200, height: 450, bytes: buffer.length, hash: sha256(buffer) };
  }

  async renderThemePulsePack(themeKey:string,states:readonly ServerPulseState[]):Promise<RenderedAsset[]> {
    const results:RenderedAsset[]=[];
    const hero=assetThemeFromVisualTheme(themeKey);
    results.push(await this.renderPanelBanner(`${themeKey}/hero`,hero));
    for(const state of states){
      const theme=pulseAssetTheme(themeKey,state);
      results.push(await this.renderPanelBanner(`${themeKey}/pulse-${state.toLowerCase()}`,theme));
      results.push(await this.renderAnimatedPulse(`${themeKey}/pulse-${state.toLowerCase()}`,theme,true));
    }
    return results;
  }

  async renderPanelPack(keys = Object.keys(PANEL_ASSET_THEMES)): Promise<RenderedAsset[]> {
    const results: RenderedAsset[] = [];
    for (const key of keys) {
      const theme = PANEL_ASSET_THEMES[key];
      if (!theme) continue;
      results.push(await this.renderPanelBanner(key, theme));
    }
    return results;
  }
}

export interface AssetStorage { put(path: string, data: Buffer, contentType: string): Promise<{ path: string; publicUrl?: string }>; }

export class SupabaseAssetStorage implements AssetStorage {
  private readonly client: SupabaseClient;
  constructor(url: string, serviceRoleKey: string, private readonly bucket: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  async put(path: string, data: Buffer, contentType: string): Promise<{ path: string; publicUrl?: string }> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, data, { contentType, upsert: true, cacheControl: '3600' });
    if (error) throw error;
    const { data: publicData } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return { path, publicUrl: publicData.publicUrl };
  }
}

export class LocalAssetStorage implements AssetStorage {
  constructor(private readonly rootDir: string) {}
  async put(path: string, data: Buffer): Promise<{ path: string }> {
    const target = resolve(this.rootDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return { path: target };
  }
}

export const assetContentType = (path: string): string => basename(path).endsWith('.gif') ? 'image/gif' : 'image/png';
