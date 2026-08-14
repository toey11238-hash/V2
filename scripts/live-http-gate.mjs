import http from 'node:http';
import { performance } from 'node:perf_hooks';

const selfTest=process.argv.includes('--self-test');
const allowed=process.env.ALLOW_HTTP_LIVE_GATE==='1'||selfTest;
if(!allowed)throw new Error('ALLOW_HTTP_LIVE_GATE=1_REQUIRED');

async function withSelfTestServer(run){
  const headers={
    'content-type':'application/json; charset=utf-8',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-resource-policy':'same-site',
    'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; connect-src 'self' wss: https:",
  };
  const server=http.createServer((req,res)=>{
    for(const [name,value] of Object.entries(headers))res.setHeader(name,value);
    if(req.url==='/live')return void res.end(JSON.stringify({status:'alive'}));
    if(req.url==='/ready')return void res.end(JSON.stringify({status:'ready'}));
    if(req.url==='/health')return void res.end(JSON.stringify({status:'healthy'}));
    if(req.url?.startsWith('/api/')){res.statusCode=401;return void res.end(JSON.stringify({error:'UNAUTHORIZED'}));}
    res.statusCode=404;res.end(JSON.stringify({error:'NOT_FOUND'}));
  });
  await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  try{return await run(`http://127.0.0.1:${address.port}`);}finally{await new Promise((resolve)=>server.close(resolve));}
}

function percentile(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))];}
function assertSafeTarget(raw){const url=new URL(raw);const local=['127.0.0.1','localhost','::1'].includes(url.hostname);if(url.protocol!=='https:'&&!local)throw new Error('LIVE_HTTP_GATE_REQUIRES_HTTPS_OR_LOCALHOST');return url.origin;}

async function fetchTimed(url,init={}){
  const started=performance.now();
  try{
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(5000),redirect:'error'});
    const text=await response.text();
    return {ok:true,status:response.status,headers:Object.fromEntries(response.headers),text,durationMs:performance.now()-started};
  }catch(error){return {ok:false,status:0,headers:{},text:'',durationMs:performance.now()-started,error:error instanceof Error?error.message:String(error)};}
}

async function runGate(rawBase){
  const base=assertSafeTarget(rawBase);
  const evidence={target:base,probes:{},security:{},load:{},aborts:{}};
  for(const path of ['/live','/ready','/health']){
    const result=await fetchTimed(`${base}${path}`);
    if(!result.ok||result.status!==200)throw new Error(`LIVE_HTTP_PROBE_FAILED:${path}:${result.status}:${result.error??''}`);
    let payload;try{payload=JSON.parse(result.text);}catch{throw new Error(`LIVE_HTTP_INVALID_JSON:${path}`);}
    evidence.probes[path]={status:result.status,durationMs:Number(result.durationMs.toFixed(2)),payload};
    if(path==='/live'){
      const required={
        'x-content-type-options':'nosniff',
        'x-frame-options':'DENY',
        'referrer-policy':'no-referrer',
        'cross-origin-resource-policy':'same-site',
      };
      for(const [name,value] of Object.entries(required))if(result.headers[name]!==value)throw new Error(`SECURITY_HEADER_MISSING_OR_INVALID:${name}`);
      const csp=result.headers['content-security-policy']??'';
      if(!csp.includes("default-src 'none'")||!csp.includes("frame-ancestors 'none'"))throw new Error('CSP_FAIL_CLOSED_POLICY_MISSING');
      if(!result.headers['permissions-policy']?.includes('camera=()'))throw new Error('PERMISSIONS_POLICY_MISSING');
      evidence.security.headers={...required,csp:true,permissionsPolicy:true};
    }
  }

  const unauth=await fetchTimed(`${base}/api/release/truth`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(![401,403,404,405,429].includes(unauth.status))throw new Error(`UNAUTHENTICATED_MUTATION_NOT_REJECTED:${unauth.status}`);
  evidence.security.unauthenticatedMutationStatus=unauth.status;

  const malformed=await fetchTimed(`${base}/api/__live_gate_invalid`,{method:'POST',headers:{'content-type':'application/json'},body:'{"broken":'});
  if(malformed.status>=500)throw new Error(`MALFORMED_REQUEST_TRIGGERED_SERVER_ERROR:${malformed.status}`);
  evidence.security.malformedRequestStatus=malformed.status;

  const requests=Math.max(20,Math.min(1000,Number(process.env.HTTP_LOAD_REQUESTS??(selfTest?40:200))||200));
  const concurrency=Math.max(1,Math.min(50,Number(process.env.HTTP_LOAD_CONCURRENCY??(selfTest?5:10))||10));
  const durations=[];let errors=0;let next=0;
  const worker=async()=>{while(true){const index=next++;if(index>=requests)return;const result=await fetchTimed(`${base}/live`);durations.push(result.durationMs);if(!result.ok||result.status!==200)errors+=1;}};
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  const errorRate=errors/requests;const p95=percentile(durations,0.95);const p99=percentile(durations,0.99);
  const maxErrorRate=Math.max(0,Math.min(0.25,Number(process.env.HTTP_LOAD_MAX_ERROR_RATE??0.01)||0.01));
  if(errorRate>maxErrorRate)throw new Error(`LIVE_HTTP_LOAD_ERROR_RATE_TOO_HIGH:${errorRate}>${maxErrorRate}`);
  const maxP95=Math.max(100,Math.min(30_000,Number(process.env.HTTP_LOAD_MAX_P95_MS??5000)||5000));
  if(p95>maxP95)throw new Error(`LIVE_HTTP_LOAD_P95_TOO_HIGH:${p95.toFixed(2)}>${maxP95}`);
  evidence.load={requests,concurrency,errors,errorRate:Number(errorRate.toFixed(4)),p50Ms:Number(percentile(durations,0.5).toFixed(2)),p95Ms:Number(p95.toFixed(2)),p99Ms:Number(p99.toFixed(2)),maxMs:Number(Math.max(...durations).toFixed(2)),thresholdErrorRate:maxErrorRate,thresholdP95Ms:maxP95};

  const soakSeconds=Math.max(0,Math.min(600,Number(process.env.HTTP_SOAK_SECONDS??(selfTest?1:0))||0));
  if(soakSeconds>0){
    const deadline=performance.now()+soakSeconds*1000;let soakRequests=0;let soakErrors=0;const soakDurations=[];
    const soakWorker=async()=>{while(performance.now()<deadline){const result=await fetchTimed(`${base}/live`);soakRequests+=1;soakDurations.push(result.durationMs);if(!result.ok||result.status!==200)soakErrors+=1;}};
    await Promise.all(Array.from({length:Math.min(concurrency,selfTest?2:10)},()=>soakWorker()));
    const soakErrorRate=soakRequests?soakErrors/soakRequests:1;const soakP95=percentile(soakDurations,0.95);
    if(soakErrorRate>maxErrorRate)throw new Error(`LIVE_HTTP_SOAK_ERROR_RATE_TOO_HIGH:${soakErrorRate}>${maxErrorRate}`);
    if(soakP95>maxP95)throw new Error(`LIVE_HTTP_SOAK_P95_TOO_HIGH:${soakP95.toFixed(2)}>${maxP95}`);
    evidence.soak={seconds:soakSeconds,requests:soakRequests,errors:soakErrors,errorRate:Number(soakErrorRate.toFixed(4)),p95Ms:Number(soakP95.toFixed(2))};
  }

  let abortObserved=false;
  for(let i=0;i<5;i++){
    const controller=new AbortController();const promise=fetch(`${base}/live`,{signal:controller.signal}).catch((error)=>error);controller.abort();const result=await promise;if(result instanceof Error||result?.name==='AbortError')abortObserved=true;
  }
  evidence.aborts={clientAbortObserved:abortObserved,count:5};
  if(!abortObserved)throw new Error('CLIENT_ABORT_PROBE_DID_NOT_ABORT');

  console.log(JSON.stringify({ok:true,evidence},null,2));
  return evidence;
}

if(selfTest)await withSelfTestServer(runGate);
else{
  const target=process.env.TEST_API_BASE_URL?.trim();
  if(!target)throw new Error('TEST_API_BASE_URL_REQUIRED');
  await runGate(target);
}
