import { Activity, Gamepad2, Layers3, ShieldCheck } from 'lucide-react';

export function Constellation({ live, clients }: { live: boolean; clients: number }) {
  return (
    <div className="constellation" aria-label="โครงข่ายแพลตฟอร์มสด">
      <img className="motion-asset" src="/assets/command-bridge-motion.gif" alt="" aria-hidden="true"/>
      <div className="orbit orbit-a" aria-hidden="true" />
      <div className="orbit orbit-b" aria-hidden="true" />
      <div className="orbit orbit-c" aria-hidden="true" />
      <div className="core-node">
        <span className={live ? 'pulse-dot live' : 'pulse-dot'} />
        <strong>แกนหลัก</strong>
        <span>{live ? 'สตรีมเหตุการณ์ทำงานอยู่' : 'กำลังรอ API'}</span>
      </div>
      <div className="satellite sat-setup"><Layers3 size={18}/><span>ตั้งค่าระบบ</span></div>
      <div className="satellite sat-game"><Gamepad2 size={18}/><span>ระบบเกม</span></div>
      <div className="satellite sat-sec"><ShieldCheck size={18}/><span>ความปลอดภัย</span></div>
      <div className="satellite sat-live"><Activity size={18}/><span>{clients} การเชื่อมต่อสด</span></div>
    </div>
  );
}
