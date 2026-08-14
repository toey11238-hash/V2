export type SupportedLocale = 'th';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['th'];

const messages = {
  th: {
    'setup.title': 'ออโต้เซิร์ฟเวอร์ · ศูนย์ตั้งค่าระบบ',
    'setup.discover': 'ตรวจสอบ',
    'setup.plan': 'วางแผน',
    'setup.execute': 'ดำเนินการ',
    'setup.persistence.ready': 'พร้อมใช้งาน',
    'setup.persistence.missing': 'ยังไม่ได้ตั้งค่า',
    'verify.success': 'ยืนยันตัวตนสำเร็จ สิทธิ์สมาชิกของคุณพร้อมใช้งานแล้ว',
    'verify.already': 'บัญชีของคุณยืนยันตัวตนในเซิร์ฟเวอร์นี้แล้ว',
    'verify.missingRole': 'ยศสำหรับการยืนยันตัวตนยังตั้งค่าไม่ครบ ทีมดูแลสามารถซ่อมได้จากศูนย์ตั้งค่าระบบ',
    'ticket.created': 'สร้างห้องช่วยเหลือส่วนตัวสำหรับคุณเรียบร้อยแล้ว',
    'ticket.createFailed': 'สร้างห้องช่วยเหลือไม่สำเร็จอย่างปลอดภัย ทีมดูแลสามารถใช้รหัสข้อผิดพลาดเพื่อตรวจสอบได้',
    'panel.footer': 'ดูแลโดยออโต้เซิร์ฟเวอร์ · มีสถานะจริง · ซ่อมแซมได้',
    'panel.welcome.title': 'ยินดีต้อนรับ',
    'panel.verify.title': 'ยืนยันตัวตน',
    'panel.roles.title': 'ยศและการแจ้งเตือน',
    'panel.ticket.title': 'ศูนย์ช่วยเหลือ',
    'panel.security.title': 'ศูนย์ความปลอดภัย',
    'panel.gaming.title': 'ศูนย์เกมและชุมชนผู้เล่น',
    'panel.lfg.title': 'ค้นหาปาร์ตี้',
    'panel.team.title': 'ทีมและแคลน',
    'panel.tournament.title': 'ศูนย์การแข่งขัน',
    'panel.profile.title': 'โปรไฟล์ผู้เล่น',
    'panel.event.title': 'ศูนย์กิจกรรม',
    'panel.status.title': 'สถานะเซิร์ฟเวอร์',
  },
} as const;

export type MessageKey = keyof typeof messages.th;

export function resolveLocale(value?: string | null, fallback: SupportedLocale = 'th'): SupportedLocale {
  void value; void fallback;
  return 'th';
}

export function t(locale: SupportedLocale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  void locale;
  let value: string = messages.th[key];
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

export function formatDateTime(value: Date | string | number, locale: SupportedLocale, timezone = 'Asia/Bangkok'): string {
  void locale;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: timezone,
  }).format(new Date(value));
}

export function formatNumber(value: number, locale: SupportedLocale): string {
  void locale;
  return new Intl.NumberFormat('th-TH').format(value);
}


const PRESENTATION_VALUES: Record<string,string> = {
  QUEUED:'รอคิว', RUNNING:'กำลังทำงาน', RETRYING:'กำลังลองใหม่', SUCCEEDED:'สำเร็จ', SUCCESS:'สำเร็จ', FAILED:'ล้มเหลว', CANCELLED:'ยกเลิกแล้ว', COMPLETED:'เสร็จสิ้น', READY:'พร้อม', ACTIVE:'กำลังใช้งาน', OPEN:'เปิดอยู่', CLOSED:'ปิดแล้ว', IN_REVIEW:'กำลังตรวจสอบ', APPROVED:'อนุมัติแล้ว', BLOCKED:'ติดข้อจำกัด', RESOLVED:'แก้ไขแล้ว', REJECTED:'ปฏิเสธแล้ว', WAITLISTED:'อยู่ในคิวรอ', REGISTERED:'ลงทะเบียนแล้ว', CHECKED_IN:'เช็กอินแล้ว', DRAFT:'ฉบับร่าง', PENDING:'รอดำเนินการ',
  STATIC:'นิ่ง', BALANCED:'สมดุล', ANIMATED:'เคลื่อนไหว', CINEMATIC:'ภาพยนตร์', COMPACT:'กะทัดรัด', COMFORTABLE:'สบายตา', SPACIOUS:'โปร่ง', CLEAN:'เรียบ', SIGNAL:'มีสัญญาณ', ICONIC:'มีสัญลักษณ์', CLASSIC:'คลาสสิก', THEMED:'ตามธีม', ENHANCED:'เสริมมิติ', MINIMAL:'น้อย', RICH:'เต็ม',
  FULL_PLATFORM:'ระบบเต็ม', COMMUNITY:'ชุมชน', GAMING_MAX:'ระบบเกมสูงสุด', CREATOR:'ครีเอเตอร์', EDUCATION:'การเรียนรู้', OPERATIONS:'งานปฏิบัติการ', OFF:'ปิด', FULL:'เต็ม', COMPETITIVE:'แข่งขัน', MMO_GUILD:'กิลด์เกมขนาดใหญ่', STANDARD:'มาตรฐาน', STRICT:'เข้มงวด', ENTERPRISE:'องค์กร', ESSENTIAL:'จำเป็น', SMART:'อัจฉริยะ',
  EXTENDED_AUDIT:'เก็บหลักฐานตรวจสอบแบบขยาย', SAFE_DEFAULTS:'ค่าเริ่มต้นปลอดภัย', DAILY:'รายวัน', WEEKLY:'รายสัปดาห์', CONSERVATIVE:'ระมัดระวัง', MAX_AVAILABILITY:'เน้นความพร้อมใช้งานสูงสุด', OBSERVE:'เฝ้าดู', ENFORCE:'บังคับใช้',
  CALM:'สงบ', SHOWCASE:'โชว์เคส', LIVE:'สด',
  'local-rules':'กฎภายในระบบ', 'openai-responses':'OpenAI Responses',
};

export function presentSystemValue(value: unknown): string {
  const key=String(value??'');
  return PRESENTATION_VALUES[key]??key;
}

export function presentEnabled(value: boolean): string { return value ? 'เปิด' : 'ปิด'; }

export function localizationCoverage(): {complete:boolean;keys:string[];missing:Record<SupportedLocale,string[]>} {
  const keys=Object.keys(messages.th);
  return {complete:true,keys,missing:{th:[]}};
}
