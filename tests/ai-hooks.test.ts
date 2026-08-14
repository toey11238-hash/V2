import { describe, expect, it } from 'vitest';
import { containsSecretLikeData, createOpenAiResponsesProvider, createRuleBasedAdvisorProvider, parseAiCapabilityAllowlist, parseAiDataClassAllowlist, validateAiHookRequest } from '@autoserver/ai-hooks';

describe('AI hook privacy gate',()=>{
  it('rejects secret-like fields and SECRET data class',()=>{
    expect(containsSecretLikeData({nested:{service_role:'x'}})).toBe('root.nested.service_role');
    expect(()=>validateAiHookRequest({guildId:'g',capability:'AUDIT_SUMMARY',input:{token:'x'},inputClasses:['AUDIT'],correlationId:'c'})).toThrow(/AI_SECRET_LIKE_FIELD_FORBIDDEN/);
    expect(()=>validateAiHookRequest({guildId:'g',capability:'AUDIT_SUMMARY',input:{count:1},inputClasses:['SECRET'],correlationId:'c'})).toThrow('AI_SECRET_DATA_FORBIDDEN');
  });
  it('keeps deterministic local rules as the bundled free provider',async()=>{
    const provider=createRuleBasedAdvisorProvider();expect(provider.freeByDefault).toBe(true);expect(provider.egress).toBe('LOCAL');
    const result=await provider.execute({guildId:'g',capability:'ANALYTICS_SUMMARY',input:{tickets:3},inputClasses:['ANALYTICS'],correlationId:'c'},new AbortController().signal);expect(result.warnings?.join(' ')).toContain('deterministic');
  });
  it('requires explicit external capability and data-class allowlists',()=>{
    expect(parseAiCapabilityAllowlist('AUDIT_SUMMARY, ANALYTICS_SUMMARY')).toEqual(['AUDIT_SUMMARY','ANALYTICS_SUMMARY']);
    expect(parseAiDataClassAllowlist('PUBLIC,OPERATIONAL')).toEqual(['PUBLIC','OPERATIONAL']);
    expect(()=>parseAiDataClassAllowlist('PUBLIC,SECRET')).toThrow('AI_SECRET_DATA_CLASS_CANNOT_BE_ALLOWED');
  });
  it('uses fixed OpenAI Responses egress with store false and rejects unapproved data classes',async()=>{
    let seenUrl='';let seenBody:any;let seenAuth='';
    const provider=createOpenAiResponsesProvider({apiKey:'test-secret',model:'gpt-test-fixed',allowedCapabilities:['AUDIT_SUMMARY'],allowedDataClasses:['PUBLIC','AUDIT'],fetchImpl:async(input,init)=>{
      seenUrl=String(input);seenBody=JSON.parse(String(init?.body));seenAuth=String((init?.headers as Record<string,string>)?.authorization??'');
      return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'bounded result'}]}]}),{status:200,headers:{'content-type':'application/json'}});
    }});
    const result=await provider.execute({guildId:'g',actorId:'admin',capability:'AUDIT_SUMMARY',input:{count:2},inputClasses:['AUDIT'],correlationId:'c'},new AbortController().signal);
    expect(provider.egress).toBe('EXTERNAL');expect(seenUrl).toBe('https://api.openai.com/v1/responses');expect(seenBody.store).toBe(false);expect(seenBody.model).toBe('gpt-test-fixed');expect(seenAuth).toBe('Bearer test-secret');expect(result.summary).toBe('bounded result');
    await expect(provider.execute({guildId:'g',actorId:'admin',capability:'AUDIT_SUMMARY',input:{text:'x'},inputClasses:['USER_CONTENT'],correlationId:'c2'},new AbortController().signal)).rejects.toThrow('AI_EXTERNAL_DATA_CLASS_NOT_ALLOWED:USER_CONTENT');
    await expect(provider.execute({guildId:'g',capability:'AUDIT_SUMMARY',input:{count:1},inputClasses:['AUDIT'],correlationId:'c3'},new AbortController().signal)).rejects.toThrow('AI_EXTERNAL_ACTOR_REQUIRED');
  });
});
