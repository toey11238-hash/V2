import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const selfTest=process.argv.includes('--self-test');
if(process.env.ALLOW_BROWSER_LIVE_GATE!=='1'&&!selfTest)throw new Error('ALLOW_BROWSER_LIVE_GATE=1_REQUIRED');

function safeUrl(raw){const url=new URL(raw);const local=['127.0.0.1','localhost','::1'].includes(url.hostname);if(url.protocol!=='https:'&&!local)throw new Error('LIVE_BROWSER_GATE_REQUIRES_HTTPS_OR_LOCALHOST');return url.toString();}
function sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

class CdpClient{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.events=[];ws.onmessage=(event)=>{const message=JSON.parse(String(event.data));if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);if(message.error)pending.reject(new Error(`${message.error.code}:${message.error.message}`));else pending.resolve(message.result??{});}else this.events.push(message);};}
  async send(method,params={},sessionId){const id=++this.id;const payload={id,method,params,...(sessionId?{sessionId}:{})};const promise=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.ws.send(JSON.stringify(payload));return await promise;}
  close(){this.ws.close();}
}

async function launchChromium(){
  const executable=process.env.CHROMIUM_BIN?.trim()||'/usr/bin/chromium';
  const profile=await mkdtemp(join(tmpdir(),'autoserver-browser-gate-'));
  const args=['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-default-apps','--disable-background-networking','--disable-sync','--disable-extensions','--disable-component-update','--disable-features=Translate,MediaRouter','about:blank'];
  if(typeof process.getuid==='function'&&process.getuid()===0)args.unshift('--no-sandbox');
  const child=spawn(executable,args,{stdio:['ignore','ignore','pipe'],env:{...process.env,HOME:profile}});
  child.stderr.setEncoding('utf8');
  let stderr='';
  const wsUrl=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`CHROMIUM_DEVTOOLS_TIMEOUT:${stderr.slice(-1000)}`)),10_000);
    child.stderr.on('data',(chunk)=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    child.once('error',(error)=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code)=>{if(!stderr.includes('DevTools listening')){clearTimeout(timer);reject(new Error(`CHROMIUM_EXITED_EARLY:${code}:${stderr.slice(-1000)}`));}});
  });
  return {child,profile,wsUrl,stderr:()=>stderr};
}

async function connectWebSocket(url){const ws=new WebSocket(url);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP_WEBSOCKET_TIMEOUT')),5000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(new Error('CDP_WEBSOCKET_ERROR'));};});return ws;}

async function evaluate(client,sessionId,expression){const result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw new Error(`BROWSER_EVAL_EXCEPTION:${result.exceptionDetails.text??'unknown'}`);return result.result?.value;}

async function runBrowserGate(rawTarget,{documentHtml,evidenceTarget}={}){
  const target=documentHtml?'about:blank':safeUrl(rawTarget);
  const browser=await launchChromium();
  let client;
  try{
    const ws=await connectWebSocket(browser.wsUrl);client=new CdpClient(ws);
    const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
    await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Log.enable',{},sessionId);await client.send('Accessibility.enable',{},sessionId);
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    if(documentHtml){
      const tree=await client.send('Page.getFrameTree',{},sessionId);
      const frameId=tree.frameTree?.frame?.id;
      if(!frameId)throw new Error('BROWSER_SELF_TEST_FRAME_MISSING');
      await client.send('Page.setDocumentContent',{frameId,html:documentHtml},sessionId);
    }else{
      const navigation=await client.send('Page.navigate',{url:target},sessionId);
      if(navigation.errorText)throw new Error(`BROWSER_NAVIGATION_FAILED:${navigation.errorText}`);
    }
    const deadline=Date.now()+15_000;
    while(Date.now()<deadline){const state=await evaluate(client,sessionId,'document.readyState');if(state==='complete')break;await sleep(100);}
    if(await evaluate(client,sessionId,'document.readyState')!=='complete')throw new Error('BROWSER_PAGE_LOAD_TIMEOUT');
    await sleep(250);
    if(!documentHtml){const loadedUrl=await evaluate(client,sessionId,'location.href');if(loadedUrl==='chrome-error://chromewebdata/'||loadedUrl.startsWith('chrome-error:'))throw new Error('BROWSER_NAVIGATION_ERROR_PAGE');}

    const desktop=await evaluate(client,sessionId,`(()=>({
      title:document.title,
      lang:document.documentElement.lang,
      h1:document.querySelectorAll('h1').length,
      main:document.querySelectorAll('main,[role="main"]').length,
      horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+1,
      missingImgAlt:[...document.querySelectorAll('img')].filter(el=>!el.hasAttribute('alt')).length,
      missingNames:[...document.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[tabindex]')].filter(el=>{
        const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden')return false;
        const label=(el.getAttribute('aria-label')||'').trim();const labelled=el.getAttribute('aria-labelledby');const text=(el.textContent||'').trim();const title=(el.getAttribute('title')||'').trim();
        const inputLabel=('labels' in el&&el.labels)?[...el.labels].map(x=>x.textContent||'').join('').trim():'';
        return !(label||labelled||text||title||inputLabel);
      }).length,
      reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
      mixedResources:location.protocol==='https:'?performance.getEntriesByType('resource').map(x=>x.name).filter(x=>x.startsWith('http:')):[],
      viewport:{w:innerWidth,h:innerHeight,scrollWidth:document.documentElement.scrollWidth}
    }))()`);
    if(!desktop.title?.trim())throw new Error('BROWSER_TITLE_MISSING');
    if(!desktop.lang?.trim())throw new Error('BROWSER_LANG_MISSING');
    if(desktop.h1<1||desktop.main<1)throw new Error('BROWSER_LANDMARK_OR_H1_MISSING');
    if(desktop.horizontalOverflow)throw new Error('BROWSER_DESKTOP_HORIZONTAL_OVERFLOW');
    if(desktop.missingImgAlt>0)throw new Error(`BROWSER_IMAGE_ALT_MISSING:${desktop.missingImgAlt}`);
    if(desktop.missingNames>0)throw new Error(`BROWSER_INTERACTIVE_NAME_MISSING:${desktop.missingNames}`);
    if(!desktop.reducedMotion)throw new Error('BROWSER_REDUCED_MOTION_EMULATION_FAILED');
    if(desktop.mixedResources.length)throw new Error(`BROWSER_MIXED_CONTENT:${desktop.mixedResources.length}`);

    const ax=await client.send('Accessibility.getFullAXTree',{},sessionId);
    const unnamedInteractive=(ax.nodes??[]).filter((node)=>!node.ignored&&['button','link','textbox','combobox','checkbox','radio','switch'].includes(node.role?.value)&&!(node.name?.value??'').trim()).length;
    if(unnamedInteractive>0)throw new Error(`BROWSER_AX_UNNAMED_INTERACTIVE:${unnamedInteractive}`);

    await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844},sessionId);
    await sleep(150);
    const mobile=await evaluate(client,sessionId,`(()=>({horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+1,viewport:{w:innerWidth,h:innerHeight,scrollWidth:document.documentElement.scrollWidth}}))()`);
    if(mobile.horizontalOverflow)throw new Error('BROWSER_MOBILE_HORIZONTAL_OVERFLOW');

    const runtimeErrors=client.events.filter((event)=>event.sessionId===sessionId&&event.method==='Runtime.exceptionThrown');
    const logErrors=client.events.filter((event)=>event.sessionId===sessionId&&event.method==='Log.entryAdded'&&['error','warning'].includes(event.params?.entry?.level));
    if(runtimeErrors.length)throw new Error(`BROWSER_RUNTIME_EXCEPTIONS:${runtimeErrors.length}`);
    if(logErrors.filter((x)=>x.params?.entry?.level==='error').length)throw new Error(`BROWSER_CONSOLE_ERRORS:${logErrors.length}`);

    const evidence={target:evidenceTarget??target,desktop,mobile,accessibility:{axNodes:(ax.nodes??[]).length,unnamedInteractive},runtime:{exceptions:runtimeErrors.length,logWarnings:logErrors.filter((x)=>x.params?.entry?.level==='warning').length,logErrors:logErrors.filter((x)=>x.params?.entry?.level==='error').length},browser:{executable:process.env.CHROMIUM_BIN?.trim()||'/usr/bin/chromium'}};
    console.log(JSON.stringify({ok:true,evidence},null,2));return evidence;
  } finally {
    try{client?.close();}catch{}
    browser.child.kill('SIGKILL');
    await rm(browser.profile,{recursive:true,force:true}).catch(()=>undefined);
  }
}

async function runSelfTest(run){
  const html=`<!doctype html><html lang="en"><head><title>AutoServer Browser Gate</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;max-width:100%;overflow-x:hidden}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style></head><body><main><h1>Gate</h1><button aria-label="Run gate">Run</button><img alt="status" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`;
  return await run(undefined,{documentHtml:html,evidenceTarget:'self-test:cdp-document'});
}

if(selfTest)await runSelfTest(runBrowserGate);
else{const target=process.env.TEST_DASHBOARD_URL?.trim();if(!target)throw new Error('TEST_DASHBOARD_URL_REQUIRED');await runBrowserGate(target);}
