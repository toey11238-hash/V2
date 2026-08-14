export type DashboardLocale='th';
export const dashboardText={
  th:{
    signIn:'เข้าสู่ระบบด้วย Discord', oauthMissing:'ยังไม่ได้ตั้งค่า OAuth', signOut:'ออกจากระบบ', live:'ข้อมูลสดตามขอบเขตเซิร์ฟเวอร์', publicLive:'ข้อมูลสดสาธารณะ', reconnecting:'กำลังเชื่อมต่อใหม่',
    eyebrow:'ศูนย์ปฏิบัติการที่ยึดข้อมูลจริงและ CANON', heroA:'ตั้งค่าจากศูนย์กลางเดียว', heroB:'ทุกระบบทำงานสอดคล้องกัน',
    lead:'สร้าง ตรวจสอบ ซ่อมแซม และพัฒนาชุมชน Discord จากศูนย์ควบคุมเดียวที่ตรวจสอบย้อนหลังได้ ระบบเกม ชุมชน การช่วยเหลือ ความปลอดภัย ระบบอัตโนมัติ และการกู้คืนถูกออกแบบให้ทำงานร่วมกันตั้งแต่ต้น',
    command:'สแกน → วางแผน → ตรวจสอบ → เข้าคิว → ดำเนินการ → ยืนยันผล', zeroCost:'โปรไฟล์ต้นทุนบังคับศูนย์', zeroCostTitle:'GitHub → Render Free และเลือกใช้ Supabase Free ได้', language:'ภาษา',
  },
} as const;
export function dashboardLocale():DashboardLocale{return'th';}
