import { Boxes, CircleDot, RadioTower, Shield, UsersRound } from 'lucide-react';
type Summary={roles:number;categories:number;textChannels:number;forumChannels:number;voiceChannels:number;panels:number};
type Props={name?:string;summary?:Summary|null;live:boolean;themeKey:string};
export function LiveServerMap({name,summary,live,themeKey}:Props){
  const rooms=summary?summary.textChannels+summary.forumChannels+summary.voiceChannels:0;
  return <section className="server-map" data-theme={themeKey} aria-label="แผนผังเซิร์ฟเวอร์สด">
    <div className="server-map-head"><div><span className="kicker"><RadioTower size={14}/> แผนผังเซิร์ฟเวอร์สด</span><h3>{name??'โครงสร้างเซิร์ฟเวอร์เป้าหมาย'}</h3><p>แสดงโครงสร้างจากแม่แบบ การเปลี่ยนแปลงจริงยังต้องผ่านการสแกน ตรวจแผน อนุมัติ และดำเนินการด้วย /setup</p></div><span className={live?'map-live':'map-live offline'}><CircleDot size={13}/>{live?'ข้อมูลเหตุการณ์สด':'โหมดภาพรวมล่าสุด'}</span></div>
    <div className="map-stage"><div className="map-spine" aria-hidden="true"/><div className="map-node root"><Boxes/><strong>{summary?.categories??'—'}</strong><span>หมวดหมู่</span></div><div className="map-node rooms"><RadioTower/><strong>{summary?rooms:'—'}</strong><span>ห้อง</span></div><div className="map-node roles"><UsersRound/><strong>{summary?.roles??'—'}</strong><span>ยศ</span></div><div className="map-node panels"><Shield/><strong>{summary?.panels??'—'}</strong><span>แผงที่ระบบดูแล</span></div></div>
  </section>;
}
