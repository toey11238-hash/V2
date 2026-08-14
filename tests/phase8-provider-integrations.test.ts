import { describe, expect, it } from 'vitest';
import { assertPublicIntegrationConfigSafe, createDiscordStatusAdapter, createGitHubReleasesAdapter, createRiotDataDragonAdapter, createSteamNewsAdapter, integrationPayloadHash } from '@autoserver/integrations';
import { defaultSetupDraft, normalizeSetupDraft } from '@autoserver/control-center';

describe('Phase 8 provider adapters',()=>{
  it('normalizes Riot Data Dragon catalogs without credentials',async()=>{
    const http={json:async(url:string)=>{
      if(url.endsWith('/api/versions.json'))return ['16.9.1'];
      return {data:Object.fromEntries(Array.from({length:100},(_,i)=>[`C${i}`,{id:`C${i}`,key:String(i),name:`Champion ${i}`,title:'test',image:{full:`C${i}.png`}}]))};
    }};
    const adapter=createRiotDataDragonAdapter(http);
    expect(adapter.config?.validate({locale:'th_TH'})).toEqual({locale:'th_TH'});
    const result=await adapter.sync?.({config:{locale:'th_TH'}});
    expect(result?.externalVersion).toBe('16.9.1');
    expect(result?.itemCount).toBe(100);
  });

  it('normalizes public GitHub releases and rejects unsafe repository config',async()=>{
    const adapter=createGitHubReleasesAdapter({json:async()=>[{id:42,tag_name:'v2.0.0',name:'Two',html_url:'https://github.com/acme/project/releases/tag/v2.0.0',draft:false,prerelease:false,published_at:'2026-08-14T00:00:00Z'}]});
    const result=await adapter.sync?.({config:{owner:'acme',repo:'project'}});
    expect(result?.itemCount).toBe(1);
    expect(()=>adapter.config?.validate({owner:'https://evil.test',repo:'x'})).toThrow('GITHUB_PUBLIC_REPOSITORY_INVALID');
  });


  it('normalizes Discord public status summaries without credentials',async()=>{
    const adapter=createDiscordStatusAdapter({json:async()=>({page:{updated_at:'2026-08-14T00:00:00Z'},status:{indicator:'minor',description:'Minor Service Outage'},components:[{id:'api',name:'API',status:'degraded_performance'}],incidents:[],scheduled_maintenances:[]})});
    const result=await adapter.sync?.({config:{}});
    expect(result?.contentType).toBe('discord-status');
    expect(result?.itemCount).toBe(1);
  });

  it('normalizes public Steam news without credentials',async()=>{
    const adapter=createSteamNewsAdapter({json:async()=>({appnews:{appid:570,count:1,newsitems:[{gid:'1',title:'Patch',url:'https://store.steampowered.com/news/app/570/view/1',date:1786675200,contents:'notes'}]}})});
    expect(adapter.config?.validate({appId:570,count:10,maxLength:1200})).toEqual({appId:570,count:10,maxLength:1200});
    const result=await adapter.sync?.({config:{appId:570,count:10,maxLength:1200}});
    expect(result?.contentType).toBe('steam-news');
    expect(result?.itemCount).toBe(1);
  });

  it('keeps nested integration defaults when loading older setup drafts',()=>{
    const legacy={...defaultSetupDraft(),integrations:{riotDataDragon:{enabled:true,locale:'th_TH',syncCadence:'DAILY'},githubReleases:{enabled:false,owner:'',repo:'',includePrereleases:false,syncCadence:'WEEKLY'}}};
    const normalized=normalizeSetupDraft(legacy);
    expect(normalized.integrations.riotDataDragon.enabled).toBe(true);
    expect(normalized.integrations.discordStatus).toEqual({enabled:false,syncCadence:'DAILY'});
  });

  it('rejects secret-bearing public config and hashes payload deterministically',()=>{
    expect(()=>assertPublicIntegrationConfigSafe({password:'nope'})).toThrow('INTEGRATION_CONFIG_SECRET_FIELD_FORBIDDEN');
    expect(integrationPayloadHash({z:1,a:{b:2}})).toBe(integrationPayloadHash({a:{b:2},z:1}));
  });
});
