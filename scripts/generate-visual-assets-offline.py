#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, math, os, random, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'apps/dashboard/public/assets'
THEMES=PUBLIC/'themes'
PANELS=PUBLIC/'panels'
STATES=['IDLE','ACTIVE','READY','LIVE','SUCCESS','WATCH','DEGRADED','INCIDENT','MAINTENANCE','SYNCING','RECOVERY']
node_js="""import {VISUAL_THEME_PACKS,SERVER_PULSE_STATES,pulseColor} from './packages/visual-system/src/index.ts'; console.log(JSON.stringify(Object.fromEntries(Object.entries(VISUAL_THEME_PACKS).map(([k,v])=>[k,{motif:v.motif,mode:v.mode,tokens:v.tokens,states:Object.fromEntries(SERVER_PULSE_STATES.map(s=>[s,pulseColor(k,s)]))}]))));"""
try:
    raw=subprocess.check_output(['node','--experimental-strip-types','--input-type=module','-e',node_js],cwd=ROOT,text=True)
except Exception as exc:
    print(f'visual-token export failed: {exc}',file=sys.stderr);sys.exit(2)
packs=json.loads(raw)

def rgb(value:str):
    value=value.lstrip('#');return tuple(int(value[i:i+2],16) for i in (0,2,4))
def mix(a,b,t):return tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))
def alpha(color,a):return (*color,max(0,min(255,int(a))))
def stable_seed(value:str):return int(hashlib.sha256(value.encode()).hexdigest()[:12],16)
def rgba_image(size,color):return Image.new('RGBA',size,alpha(color,255))

def palette_for_panel(name:str):
    base=packs['command-bridge']['tokens']; canvas=rgb(base['canvas']); surface=rgb(base['surface']); accent=rgb(base['accent']); secondary=rgb(base['accentSecondary']); tertiary=rgb(base['accentTertiary'])
    n=name.lower()
    if any(k in n for k in ['security','report','incident','moderation','trust','permission']): accent,secondary,tertiary=(244,91,105),(255,170,184),(126,226,209)
    elif any(k in n for k in ['gaming','game','lfg','team','tournament','profile']): accent,secondary,tertiary=(46,139,255),(255,122,69),(156,124,255)
    elif any(k in n for k in ['event','giveaway','announcement']): accent,secondary,tertiary=(245,181,68),(184,229,255),(91,124,250)
    elif any(k in n for k in ['creator','media','content','brand','asset','theme','scene','role-gallery']): accent,secondary,tertiary=(154,124,255),(243,138,180),(125,226,209)
    elif any(k in n for k in ['backup','recovery','reliability','provider','status','repair','ops','deployment','automation']): accent,secondary,tertiary=(49,214,231),(113,247,195),(91,124,250)
    elif any(k in n for k in ['member','welcome','verify','support','ticket','help','care']): accent,secondary,tertiary=(184,229,255),(91,124,250),(57,217,138)
    return {'canvas':canvas,'surface':surface,'accent':accent,'secondary':secondary,'tertiary':tertiary,'danger':(244,91,105),'success':(57,217,138)}

def gradient(size,top,bottom):
    w,h=size
    strip=Image.new('RGBA',(1,h)); px=strip.load()
    for y in range(h):
        c=mix(top,bottom,y/max(1,h-1)); px[0,y]=(*c,255)
    return strip.resize((w,h),Image.Resampling.BILINEAR)

def glow(layer,center,radius,color,strength=120):
    x,y=center; d=ImageDraw.Draw(layer,'RGBA'); d.ellipse((x-radius,y-radius,x+radius,y+radius),fill=alpha(color,strength))

def crystal(draw,cx,cy,scale,accent,secondary,phase):
    bob=math.sin(phase*math.tau)*scale*.05; cy+=bob
    pts=[(cx,cy-scale),(cx+scale*.68,cy-scale*.18),(cx+scale*.42,cy+scale*.78),(cx-scale*.46,cy+scale*.7),(cx-scale*.72,cy-scale*.2)]
    faces=[([pts[0],pts[1],(cx,cy+scale*.08)],alpha(accent,72)),([pts[1],pts[2],(cx,cy+scale*.08)],alpha(secondary,64)),([pts[2],pts[3],(cx,cy+scale*.08)],alpha(accent,40)),([pts[3],pts[4],(cx,cy+scale*.08)],alpha(secondary,34)),([pts[4],pts[0],(cx,cy+scale*.08)],alpha(accent,55))]
    for poly,fill in faces: draw.polygon(poly,fill=fill)
    for a,b in zip(pts,pts[1:]+pts[:1]): draw.line((*a,*b),fill=alpha(secondary,150),width=max(1,int(scale/80)))
    draw.line((*pts[0],cx,cy+scale*.08),fill=alpha(secondary,125),width=1)

def perspective_grid(draw,w,h,color,phase):
    horizon=int(h*.58); origin=(int(w*.76),int(h*.46))
    for i in range(-10,11):
        x=int(w*.55+i*w*.055); draw.line((origin[0],origin[1],x,h+20),fill=alpha(color,24),width=1)
    for j in range(8):
        t=(j/8+phase*.08)%1; y=int(horizon+(h-horizon)*(t**1.75)); draw.line((int(w*.46),y,w,y),fill=alpha(color,22+22*t),width=1)

def orbit(draw,cx,cy,rx,ry,color,phase,offset=0):
    box=(cx-rx,cy-ry,cx+rx,cy+ry); draw.ellipse(box,outline=alpha(color,65),width=2)
    a=(phase+offset)%1*math.tau; x=cx+math.cos(a)*rx;y=cy+math.sin(a)*ry
    draw.ellipse((x-5,y-5,x+5,y+5),fill=alpha(color,235))

def semantic_shape(draw,w,h,name,accent,secondary,tertiary,phase):
    cx,cy=int(w*.76),int(h*.48); seed=stable_seed(name); variant=seed%6
    if variant==0:
        for r in [0.22,0.16,0.10]: orbit(draw,cx,cy,int(w*r),int(h*r*1.5),[accent,secondary,tertiary][int(r*100)%3],phase,r)
    elif variant==1:
        for i in range(4):
            r=int(min(w,h)*(.12+i*.055)); draw.arc((cx-r,cy-r,cx+r,cy+r),start=(phase*360+i*37)%360,end=(phase*360+185+i*37)%360,fill=alpha([accent,secondary,tertiary][i%3],105),width=max(2,int(h*.006)))
    elif variant==2:
        pts=[]
        for x in range(int(w*.56),w+10,max(6,int(w*.008))): pts.append((x,int(cy+math.sin(x/w*9+phase*math.tau)*h*.11)))
        draw.line(pts,fill=alpha(accent,120),width=max(2,int(h*.008)))
        draw.line([(x,y+int(h*.035)) for x,y in pts],fill=alpha(secondary,55),width=1)
    elif variant==3:
        r=int(min(w,h)*.23); pts=[(cx,cy-r),(cx+r,cy-int(r*.2)),(cx+int(r*.62),cy+r),(cx-int(r*.62),cy+r),(cx-r,cy-int(r*.2))]; draw.polygon(pts,outline=alpha(accent,110)); draw.ellipse((cx-r*.45,cy-r*.45,cx+r*.45,cy+r*.45),outline=alpha(secondary,75),width=2)
    elif variant==4:
        for i in range(18):
            a=i*math.tau/18+phase*.45;r=min(w,h)*(.16+(i%3)*.05);x=cx+math.cos(a)*r;y=cy+math.sin(a)*r*.72;draw.ellipse((x-14,y-6,x+14,y+6),fill=alpha([accent,secondary,tertiary][i%3],30+(i%4)*8))
    else:
        for i in range(10):
            x=int(w*(.57+i*.042)); shift=int(math.sin(phase*math.tau+i*.7)*h*.045);draw.line((x,cy-h*.18+shift,x+h*.24,cy+h*.18+shift),fill=alpha([accent,secondary,tertiary][i%3],46),width=2)

def render_frame(size,palette,name,phase=0.0,state_color=None):
    w,h=size
    if w>800:
        small=(max(320,w//2),max(120,h//2))
        return render_frame(small,palette,name,phase,state_color).resize(size,Image.Resampling.LANCZOS)
    canvas=palette['canvas']; surface=palette['surface']; accent=state_color or palette['accent']; secondary=palette['secondary']; tertiary=palette['tertiary']
    im=gradient(size,canvas,mix(surface,canvas,.34))
    bloom=Image.new('RGBA',size,(0,0,0,0)); glow(bloom,(int(w*.77),int(h*.47)),int(min(w,h)*.38),accent,75); glow(bloom,(int(w*.60),int(h*.18)),int(min(w,h)*.24),secondary,34); bloom=bloom.filter(ImageFilter.GaussianBlur(max(10,int(h*.045)))); im=Image.alpha_composite(im,bloom)
    d=ImageDraw.Draw(im,'RGBA')
    # cinematic rails and asymmetrical frame
    pad=max(18,int(h*.06)); d.line((pad,pad,w*.47,pad),fill=alpha(secondary,72),width=1);d.line((pad,pad,pad,h-pad),fill=alpha(accent,95),width=2);d.line((w*.42,h-pad,w-pad,h-pad),fill=alpha(accent,55),width=1)
    perspective_grid(d,w,h,accent,phase)
    semantic_shape(d,w,h,name,accent,secondary,tertiary,phase)
    crystal(d,int(w*.76),int(h*.48),min(w,h)*.16,accent,secondary,phase)
    # deterministic floating nodes / particle field
    rng=random.Random(stable_seed(name))
    for i in range(34):
        bx=rng.uniform(.08,.94)*w; by=rng.uniform(.08,.9)*h; radius=rng.uniform(1.2,3.2); speed=.08+rng.random()*.22; a=(phase*math.tau*speed*5+rng.random()*math.tau); x=bx+math.cos(a)*rng.uniform(2,18); y=by+math.sin(a)*rng.uniform(2,12); col=[accent,secondary,tertiary][i%3]; d.ellipse((x-radius,y-radius,x+radius,y+radius),fill=alpha(col,50+(i%5)*16))
    # left-side holo plates: visual identity without text, keeps Discord images language-neutral
    for i,(ww,aa) in enumerate([(0.34,50),(0.28,32),(0.20,24)]):
        y=h*(.30+i*.12); d.rounded_rectangle((w*.075,y,w*(.075+ww),y+h*.035),radius=h*.017,fill=alpha([accent,secondary,tertiary][i],aa),outline=alpha([accent,secondary,tertiary][i],aa+25),width=1)
    # shine sweep for motion
    shine_x=int((-w*.25)+(w*1.5)*phase); shine=Image.new('RGBA',size,(0,0,0,0)); sd=ImageDraw.Draw(shine,'RGBA');sd.polygon([(shine_x,0),(shine_x+w*.09,0),(shine_x-w*.13,h),(shine_x-w*.22,h)],fill=(255,255,255,18)); im=Image.alpha_composite(im,shine)
    return im

def save_png(path,im): path.parent.mkdir(parents=True,exist_ok=True);im.convert('RGB').save(path,'PNG',compress_level=6)
def save_gif(path,frames):
    path.parent.mkdir(parents=True,exist_ok=True); pal=[f.convert('P',palette=Image.Palette.ADAPTIVE,colors=128) for f in frames];pal[0].save(path,save_all=True,append_images=pal[1:],duration=82,loop=0,optimize=False,disposal=2)

def current_specs(folder:Path):
    out=[]
    for path in sorted(folder.rglob('*')):
        if path.is_file() and path.name!='manifest.json' and path.suffix.lower() in {'.png','.gif'}:
            try:
                im=Image.open(path);out.append((path,im.size,max(2,getattr(im,'n_frames',1))))
            except Exception: pass
    return out

# Snapshot file/dimension contracts before replacement.
panel_specs=current_specs(PANELS); theme_specs=current_specs(THEMES); root_specs=[x for x in current_specs(PUBLIC) if x[0].parent==PUBLIC]
scope=os.environ.get('ASSET_SCOPE','all').lower()

# Every managed panel image is regenerated; no legacy visual bytes survive.
for path,size,old_frames in (panel_specs if scope in {'all','panels'} else []):
    pal=palette_for_panel(path.stem); frames=max(12,old_frames)
    if path.suffix.lower()=='.png': save_png(path,render_frame(size,pal,path.stem,.13))
    else: save_gif(path,[render_frame(size,pal,path.stem,i/frames) for i in range(frames)])

# Every theme hero and pulse asset is regenerated from canonical theme tokens.
theme_filter=os.environ.get('ASSET_THEME','').strip()
theme_items=[(k,v) for k,v in packs.items() if not theme_filter or k==theme_filter]
for key,pack in (theme_items if scope in {'all','themes'} else []):
    folder=THEMES/key;folder.mkdir(parents=True,exist_ok=True);tokens=pack['tokens'];pal={'canvas':rgb(tokens['canvas']),'surface':rgb(tokens['surface']),'accent':rgb(tokens['accent']),'secondary':rgb(tokens['accentSecondary']),'tertiary':rgb(tokens['accentTertiary']),'danger':rgb(tokens['danger']),'success':rgb(tokens['success'])}
    hero=folder/'hero.png'; hero_size=next((size for p,size,_ in theme_specs if p==hero),(1200,450));save_png(hero,render_frame(hero_size,pal,f'{key}-hero',.13))
    for st in STATES:
        state_color=rgb(pack['states'][st]); png=folder/f'pulse-{st.lower()}.png'; gif=folder/f'pulse-{st.lower()}.gif'; png_size=next((size for p,size,_ in theme_specs if p==png),(1200,450)); gif_spec=next(((size,fr) for p,size,fr in theme_specs if p==gif),((1200,450),12));
        save_png(png,render_frame(png_size,pal,f'{key}-{st}',.13,state_color));size,old_frames=gif_spec;frames=max(12,old_frames);save_gif(gif,[render_frame(size,pal,f'{key}-{st}',i/frames,state_color) for i in range(frames)])

# Root visual assets are also replaced instead of being left behind.
for path,size,old_frames in (root_specs if scope in {'all','panels','root'} else []):
    pal=palette_for_panel(path.stem);frames=max(12,old_frames)
    if path.suffix.lower()=='.png':save_png(path,render_frame(size,pal,path.stem,.13))
    else:save_gif(path,[render_frame(size,pal,path.stem,i/frames) for i in range(frames)])

# Rebuild manifests from actual bytes.
assets=[]
for path in sorted(PANELS.iterdir()):
    if not path.is_file() or path.name=='manifest.json' or path.suffix.lower() not in {'.png','.gif'}:continue
    data=path.read_bytes();im=Image.open(path);assets.append({'file':path.name,'sha256':hashlib.sha256(data).hexdigest(),'dimensions':[im.width,im.height],'frames':getattr(im,'n_frames',1),'bytes':len(data)})
manifest={'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'generator':'scripts/generate-visual-assets-offline.py · prismatic-depth-v2','assets':assets}
(PANELS/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')

theme_assets=[]
for path in sorted(THEMES.rglob('*')):
    if not path.is_file() or path.name=='manifest.json' or path.suffix.lower() not in {'.png','.gif'}:continue
    data=path.read_bytes();im=Image.open(path);rel=path.relative_to(THEMES).as_posix();parts=rel.split('/');theme=parts[0] if parts else '';stem=path.stem;state=None if stem=='hero' else (stem.removeprefix('pulse-').upper() if stem.startswith('pulse-') else None)
    theme_assets.append({'file':rel,'theme':theme,'state':state,'mode':'MOTION' if path.suffix.lower()=='.gif' else 'STATIC','sha256':hashlib.sha256(data).hexdigest(),'dimensions':[im.width,im.height],'frames':getattr(im,'n_frames',1),'bytes':len(data)})
theme_manifest={'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'generator':'scripts/generate-visual-assets-offline.py · prismatic-depth-v2','themes':len(packs),'states':len(STATES),'assets':theme_assets}
(THEMES/'manifest.json').write_text(json.dumps(theme_manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'themes':len(packs),'states':len(STATES),'themeAssets':len(theme_assets),'panelAssets':len(assets),'rootAssets':len(root_specs),'motionFramesMin':12},ensure_ascii=False))
