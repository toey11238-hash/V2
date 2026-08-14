import type { IntegrationAdapter, IntegrationAdapterContext, IntegrationSyncResult } from '../index.ts';

interface JsonClient { json<T=unknown>(url:string,init?:RequestInit):Promise<T>; }

const RIOT_LOCALES = new Set([
  'cs_CZ','el_GR','pl_PL','ro_RO','hu_HU','en_GB','de_DE','es_ES','it_IT','fr_FR','ja_JP','ko_KR','es_MX','es_AR','pt_BR','en_US','en_AU','ru_RU','tr_TR','ms_MY','en_PH','en_SG','th_TH','vi_VN','id_ID','zh_MY','zh_CN','zh_TW',
]);

function localeFrom(config:Readonly<Record<string,unknown>>):string{
  const locale=String(config.locale??'en_US');
  if(!RIOT_LOCALES.has(locale))throw new Error('RIOT_DDRAGON_LOCALE_UNSUPPORTED');
  return locale;
}

function version(value:unknown):string{
  if(typeof value!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(value))throw new Error('RIOT_DDRAGON_VERSION_INVALID');
  return value;
}

interface ChampionList {
  version?:string;
  data?:Record<string,{id?:string;key?:string;name?:string;title?:string;image?:{full?:string}}>;
}

export function createRiotDataDragonAdapter(http:JsonClient):IntegrationAdapter{
  const latestVersion=async()=>{
    const versions=await http.json<unknown>('https://ddragon.leagueoflegends.com/api/versions.json');
    if(!Array.isArray(versions)||versions.length===0)throw new Error('RIOT_DDRAGON_VERSIONS_EMPTY');
    return version(versions[0]);
  };
  return {
    key:'riot-data-dragon',
    capabilities:{content:true,assets:true,gameCatalog:true},
    config:{
      fields:[{key:'locale',label:'Data locale',type:'select',options:[...RIOT_LOCALES].sort(),required:true}],
      validate(input){const locale=localeFrom({locale:input.locale??'en_US'});return {locale};},
    },
    async health(context?:IntegrationAdapterContext){
      const current=await latestVersion();
      const locale=localeFrom(context?.config??{});
      return {healthy:true,detail:`Riot Data Dragon reachable; latest ${current}; locale ${locale}.`};
    },
    async sync(context:IntegrationAdapterContext):Promise<IntegrationSyncResult>{
      const locale=localeFrom(context.config);const current=await latestVersion();
      const payload=await http.json<ChampionList>(`https://ddragon.leagueoflegends.com/cdn/${current}/data/${locale}/champion.json`);
      const champions=Object.values(payload.data??{}).map((item)=>{
        const id=String(item.id??'').trim();const image=String(item.image?.full??'').trim();
        if(!id||!image)throw new Error('RIOT_DDRAGON_CHAMPION_RECORD_INVALID');
        return {id,key:String(item.key??''),name:String(item.name??id),title:String(item.title??''),imageUrl:`https://ddragon.leagueoflegends.com/cdn/${current}/img/champion/${encodeURIComponent(image)}`};
      }).sort((a,b)=>a.name.localeCompare(b.name));
      if(champions.length<100)throw new Error('RIOT_DDRAGON_CHAMPION_CATALOG_TOO_SMALL');
      return {contentType:'lol-champions',externalVersion:current,itemCount:champions.length,payload:{provider:'riot-data-dragon',locale,version:current,champions},detail:`Synced ${champions.length} League champion records from Data Dragon ${current}.`};
    },
  };
}
