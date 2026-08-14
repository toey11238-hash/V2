import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultSetupDraft, normalizeSetupDraft } from '../packages/control-center/src/index.ts';
import { createOpenAiResponsesProvider } from '../packages/ai-hooks/src/index.ts';

let assertions=0;
const ok=(value,message)=>{assert.ok(value,message);assertions+=1;};
const config=await readFile('packages/config/src/index.ts','utf8');
const server=await readFile('apps/platform/src/http/server.ts','utf8');
const worker=await readFile('apps/platform/src/runtime/setup-worker.ts','utf8');
const discord=await readFile('apps/platform/src/discord/setup.ts','utf8');
const dashboard=await readFile('apps/dashboard/src/App.tsx','utf8');

ok(config.includes('AI_EXTERNAL_PROVIDERS_ENABLED: booleanFromString.default(false)')&&config.includes('OPENAI_AI_ENABLED: booleanFromString.default(false)'),'external AI runtime flags default off');
ok(config.includes('requires explicit capability and data-class allowlists'),'OpenAI enablement requires explicit allowlists');
ok(config.includes("dataClassValues=new Set(['PUBLIC','OPERATIONAL','ANALYTICS','USER_CONTENT','AUDIT','SECURITY'])"),'environment validation excludes SECRET from external AI data classes');
ok(defaultSetupDraft().aiProvider==='local-rules','guild setup defaults to local-rules');
ok(normalizeSetupDraft({...defaultSetupDraft(),aiProvider:'arbitrary-provider'}).aiProvider==='local-rules','unknown setup AI providers fail safe to local-rules');
ok(worker.includes('aiProvider: setupDraft.aiProvider'),'setup worker persists the guild AI provider preference');
ok(discord.includes('openai-responses')&&dashboard.includes('OpenAI Responses · เปิดใช้ภายนอกตามสิทธิ์'),'Discord/Dashboard setup expose explicit external-provider selection');
ok(server.includes("AI_PROVIDER_NOT_ENABLED_FOR_GUILD")&&server.includes("setupProfile.aiProvider==='openai-responses'"),'HTTP route requires guild setup opt-in before external provider use');
ok(server.includes("providerKey!=='local-rules'")&&server.includes('hasLiveGuildMutationPermission'),'external dashboard provider path re-checks live guild permission');

let capturedUrl='';let capturedBody={};
const provider=createOpenAiResponsesProvider({apiKey:'contract-test-key',model:'gpt-contract-fixed',allowedCapabilities:['AUDIT_SUMMARY'],allowedDataClasses:['AUDIT'],fetchImpl:async(url,init)=>{capturedUrl=String(url);capturedBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'ok'}]}]}),{status:200});}});
await provider.execute({guildId:'guild',actorId:'operator',capability:'AUDIT_SUMMARY',input:{events:1},inputClasses:['AUDIT'],correlationId:'contract'},new AbortController().signal);
ok(capturedUrl==='https://api.openai.com/v1/responses','OpenAI provider egress endpoint is fixed, not user-configurable');
ok(capturedBody.store===false&&capturedBody.model==='gpt-contract-fixed','OpenAI request disables response storage and uses configured fixed model');
ok(provider.egress==='EXTERNAL'&&!provider.freeByDefault,'provider is explicitly external and never advertised as the free default');

console.log(`external-ai-contract-smoke PASS ${assertions} assertions`);
