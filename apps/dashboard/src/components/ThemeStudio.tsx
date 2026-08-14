import { useMemo } from 'react';
import { Eye, Film, Layers3, Palette, Sparkles, UsersRound } from 'lucide-react';
import { VISUAL_THEME_OPTIONS, VISUAL_SCENE_PRESETS, resolveThemePack, dashboardThemeVariables, visualScenePatch } from '@autoserver/visual-system';
import { thValue } from '../ui-thai';

type Props = {
  themeKey:string;motionPreset:string;panelDensity:string;channelDecoration:string;roleVisualStyle:string;mediaDensity:string;
  onPatch:(patch:Record<string,unknown>)=>void;
  capabilities?:{enhancedRoleColors:boolean;roleIcons:boolean;componentsV2:boolean;guildConnected:boolean};liveStateCount?:number;
};
const capability=(value:boolean|undefined,positive:string,negative:string)=>value===true?positive:value===false?negative:'ยังไม่มีข้อมูล';

export function ThemeStudio(props:Props){
  const pack=useMemo(()=>resolveThemePack(props.themeKey),[props.themeKey]);
  const style=dashboardThemeVariables(props.themeKey) as React.CSSProperties;
  return <section className="theme-studio" style={style} aria-label="สตูดิโอภาพและการเคลื่อนไหว">
    <div className="theme-studio-head">
      <div><span className="kicker"><Palette size={14}/> สตูดิโอภาพ</span><h3>{pack.label}</h3><p>{pack.note} · {pack.signature}</p></div>
      <div className="theme-orbit" aria-hidden="true"><i/><b/><span/></div>
    </div>
    <div className="visual-capability-rail" aria-label="ความสามารถด้านภาพของ Discord ที่ตรวจพบจริง">
      <span data-ready={props.capabilities?.componentsV2===true}>คอมโพเนนต์รุ่น 2 · {capability(props.capabilities?.componentsV2,'พร้อม','ไม่พร้อม')}</span>
      <span data-ready={props.capabilities?.enhancedRoleColors===true}>สียศแบบหลายชั้น · {capability(props.capabilities?.enhancedRoleColors,'ใช้ได้','ใช้สีสำรอง')}</span>
      <span data-ready={props.capabilities?.roleIcons===true}>ไอคอนยศ · {capability(props.capabilities?.roleIcons,'ใช้ได้','ใช้สัญลักษณ์สำรอง')}</span>
      <span data-ready={(props.liveStateCount??0)>0}>สถานะมีชีวิต · {props.liveStateCount??0}</span>
    </div>
    <div className="theme-swatches" role="radiogroup" aria-label="ธีมภาพ">
      {VISUAL_THEME_OPTIONS.map((theme)=>{const t=resolveThemePack(theme.key);return <button type="button" key={theme.key} role="radio" aria-checked={props.themeKey===theme.key} className={props.themeKey===theme.key?'active':''} onClick={()=>props.onPatch({themeKey:theme.key})}>
        <span className="swatch-pair"><i style={{background:t.tokens.accent}}/><i style={{background:t.tokens.accentSecondary}}/><i style={{background:t.tokens.accentTertiary}}/></span><strong>{theme.label}</strong><small>{theme.note}</small>
      </button>})}
    </div>
    <div className="scene-presets" aria-label="ฉากภาพสำเร็จรูป">{Object.entries(VISUAL_SCENE_PRESETS).map(([key,preset])=><button type="button" key={key} onClick={()=>props.onPatch(visualScenePatch(key as keyof typeof VISUAL_SCENE_PRESETS))}><strong>{preset.label}</strong><small>{preset.note}</small></button>)}</div>
    <div className="visual-mode-grid">
      <label><Film size={14}/><span>การเคลื่อนไหว</span><select value={props.motionPreset} onChange={(e)=>props.onPatch({motionPreset:e.target.value})}>{['STATIC','BALANCED','ANIMATED','CINEMATIC'].map((value)=><option key={value} value={value}>{thValue(value)}</option>)}</select></label>
      <label><Layers3 size={14}/><span>ความหนาแน่นแผง</span><select value={props.panelDensity} onChange={(e)=>props.onPatch({panelDensity:e.target.value})}>{['COMPACT','COMFORTABLE','SPACIOUS'].map((value)=><option key={value} value={value}>{thValue(value)}</option>)}</select></label>
      <label><Sparkles size={14}/><span>รูปแบบช่อง</span><select value={props.channelDecoration} onChange={(e)=>props.onPatch({channelDecoration:e.target.value})}>{['CLEAN','SIGNAL','ICONIC'].map((value)=><option key={value} value={value}>{thValue(value)}</option>)}</select></label>
      <label><UsersRound size={14}/><span>รูปแบบยศ</span><select value={props.roleVisualStyle} onChange={(e)=>props.onPatch({roleVisualStyle:e.target.value})}>{['CLASSIC','THEMED','ENHANCED'].map((value)=><option key={value} value={value}>{thValue(value)}</option>)}</select></label>
      <label><Eye size={14}/><span>ความหนาแน่นสื่อ</span><select value={props.mediaDensity} onChange={(e)=>props.onPatch({mediaDensity:e.target.value})}>{['MINIMAL','BALANCED','RICH'].map((value)=><option key={value} value={value}>{thValue(value)}</option>)}</select></label>
    </div>
    <div className="discord-surface-preview" aria-label="ตัวอย่างหน้าตาใน Discord">
      <span className="preview-kicker">ตัวอย่างคอมโพเนนต์รุ่น 2</span>
      <div className="preview-container"><i className="preview-accent"/><div><small>ชีพจรเซิร์ฟเวอร์ · อิงเหตุการณ์จริง</small><strong>พื้นผิวคำสั่ง {pack.label}</strong><p>โทนสี ยศ ช่อง และสื่อเดินไปในภาษาเดียวกัน การเคลื่อนไหวตอบสนองสถานะจริงและเคารพการตั้งค่าลดการเคลื่อนไหว</p></div><span className="preview-state">พร้อม</span></div>
    </div>
  </section>;
}
