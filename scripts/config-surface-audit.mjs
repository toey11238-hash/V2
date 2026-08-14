import fs from 'node:fs';
import process from 'node:process';

const read=(file)=>fs.readFileSync(file,'utf8');
const configSource=read('packages/config/src/index.ts');
const envExample=read('.env.example');
const render=read('render.yaml');

const schemaBody=configSource.split('const envSchema = z.object({')[1]?.split('\n});')[0] ?? '';
const schemaKeys=[...schemaBody.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m)=>m[1]);
const exampleKeys=[...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m)=>m[1]);
const findings=[];
const unique=(values)=>[...new Set(values)];

if(!schemaKeys.length)findings.push('config.schema.empty');
for(const key of unique(schemaKeys)) if(!exampleKeys.includes(key)) findings.push(`env-example.missing:${key}`);
for(const key of unique(exampleKeys)) if(!schemaKeys.includes(key)) findings.push(`env-example.unknown:${key}`);
if(unique(schemaKeys).length!==schemaKeys.length)findings.push('config.schema.duplicate-key');
if(unique(exampleKeys).length!==exampleKeys.length)findings.push('env-example.duplicate-key');

const sensitiveKeys=['DISCORD_BOT_TOKEN','DISCORD_CLIENT_SECRET','DASHBOARD_SESSION_SECRET','DATABASE_URL','ADMIN_API_KEY','INTERACTION_SIGNING_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY'];
for(const key of sensitiveKeys){
  const match=envExample.match(new RegExp(`^${key}=(.*)$`,'m'));
  if(match && match[1].trim()) findings.push(`env-example.secret-populated:${key}`);
}

const renderServerKeys=[...render.matchAll(/^\s{6}- key: ([A-Z][A-Z0-9_]*)$/gm)].map((m)=>m[1]);
for(const key of renderServerKeys) if(!schemaKeys.includes(key) && key!=='VITE_API_BASE_URL') findings.push(`render.unknown-env:${key}`);
for(const key of sensitiveKeys){
  const block=render.match(new RegExp(`- key: ${key}\\n((?:\\s{8}.+\\n?)*)`));
  if(block && !/\b(sync:\s*false|generateValue:\s*true)\b/.test(block[1])) findings.push(`render.secret-not-protected:${key}`);
}
if(/VITE_(?:.*TOKEN|.*SECRET|.*KEY|DATABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY)/.test(render))findings.push('render.browser-secret-env');

const requiredSurface=['NODE_ENV','PROCESS_ROLE','BOT_ENABLED','DISCORD_BOT_TOKEN','DISCORD_APPLICATION_ID','DATABASE_URL','DASHBOARD_URL','DASHBOARD_ORIGIN','ADMIN_API_KEY','INTERACTION_SIGNING_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_STORAGE_BUCKET'];
for(const key of requiredSurface) if(!renderServerKeys.includes(key)) findings.push(`render.server-env-missing:${key}`);

if(findings.length){
  console.error(`config-surface-audit FAIL · ${findings.length} finding(s)`);
  for(const finding of findings)console.error(`- ${finding}`);
  process.exit(1);
}
console.log(`config-surface-audit PASS · schema=${unique(schemaKeys).length} · env-example=${unique(exampleKeys).length} · render-env=${unique(renderServerKeys).length} · secrets=${sensitiveKeys.length}`);
