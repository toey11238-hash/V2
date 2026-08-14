import type { IntegrationAdapter, IntegrationAdapterContext, IntegrationSyncResult } from '../index.ts';

interface JsonClient { json<T=unknown>(url:string,init?:RequestInit):Promise<T>; }

function steamConfig(input:Readonly<Record<string,unknown>>):{appId:number;count:number;maxLength:number}{
  const appId=Number(input.appId);
  const count=input.count===undefined?10:Number(input.count);
  const maxLength=input.maxLength===undefined?1200:Number(input.maxLength);
  if(!Number.isSafeInteger(appId)||appId<1||appId>4_294_967_295)throw new Error('STEAM_NEWS_APP_ID_INVALID');
  if(!Number.isSafeInteger(count)||count<1||count>20)throw new Error('STEAM_NEWS_COUNT_INVALID');
  if(!Number.isSafeInteger(maxLength)||maxLength<200||maxLength>4000)throw new Error('STEAM_NEWS_MAX_LENGTH_INVALID');
  return {appId,count,maxLength};
}

interface SteamNewsPayload {
  appnews?: {
    appid?: number;
    count?: number;
    newsitems?: Array<{
      gid?: string;
      title?: string;
      url?: string;
      is_external_url?: boolean;
      author?: string;
      contents?: string;
      feedlabel?: string;
      date?: number;
      feedname?: string;
      feed_type?: number;
      appid?: number;
    }>;
  };
}

function normalize(payload:SteamNewsPayload,expectedAppId:number){
  const root=payload?.appnews;
  if(!root||Number(root.appid)!==expectedAppId||!Array.isArray(root.newsitems))throw new Error('STEAM_NEWS_RESPONSE_INVALID');
  const items=root.newsitems.slice(0,20).map((item)=>{
    const gid=String(item?.gid??'').trim();
    const title=String(item?.title??'').trim().slice(0,300);
    const url=String(item?.url??'').trim();
    const date=Number(item?.date??0);
    if(!gid||!title||!/^https:\/\//i.test(url)||!Number.isSafeInteger(date)||date<0)return null;
    return {
      gid,
      title,
      url,
      external:Boolean(item?.is_external_url),
      author:String(item?.author??'').slice(0,120),
      summary:String(item?.contents??'').replace(/\0/g,'').slice(0,4000),
      feedLabel:String(item?.feedlabel??'').slice(0,120),
      feedName:String(item?.feedname??'').slice(0,120),
      feedType:Number.isFinite(Number(item?.feed_type))?Number(item?.feed_type):null,
      publishedAt:new Date(date*1000).toISOString(),
    };
  }).filter((item):item is NonNullable<typeof item>=>Boolean(item));
  return items;
}

export function createSteamNewsAdapter(http:JsonClient):IntegrationAdapter{
  const fetchNews=async(config:Readonly<Record<string,unknown>>)=>{
    const validated=steamConfig(config);
    const query=new URLSearchParams({appid:String(validated.appId),count:String(validated.count),maxlength:String(validated.maxLength),format:'json'});
    const payload=await http.json<SteamNewsPayload>(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?${query.toString()}`);
    return {config:validated,items:normalize(payload,validated.appId)};
  };
  return {
    key:'steam-news',
    capabilities:{news:true,content:true},
    config:{
      fields:[
        {key:'appId',label:'Steam App ID',type:'text',required:true,maxLength:10},
        {key:'count',label:'News items',type:'select',required:true,options:['5','10','20']},
        {key:'maxLength',label:'Maximum summary length',type:'select',required:true,options:['600','1200','2000','4000']},
      ],
      validate(input){return steamConfig(input);},
    },
    async health(context?:IntegrationAdapterContext){
      const result=await fetchNews(context?.config??{});
      return {healthy:true,detail:`Steam public news reachable for app ${result.config.appId}; ${result.items.length} item(s) returned.`};
    },
    async sync(context:IntegrationAdapterContext):Promise<IntegrationSyncResult>{
      const result=await fetchNews(context.config);
      const version=result.items[0]?.publishedAt??'none';
      return {contentType:'steam-news',externalVersion:version,itemCount:result.items.length,payload:{provider:'steam-news',appId:result.config.appId,items:result.items},detail:`Synced ${result.items.length} public Steam news item(s) for app ${result.config.appId}.`};
    },
  };
}
