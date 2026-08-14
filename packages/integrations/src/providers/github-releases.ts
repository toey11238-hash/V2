import type { IntegrationAdapter, IntegrationAdapterContext, IntegrationSyncResult } from '../index.ts';

interface JsonClient { json<T=unknown>(url:string,init?:RequestInit):Promise<T>; }
const SLUG=/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/;

function repoConfig(input:Readonly<Record<string,unknown>>):{owner:string;repo:string;includePrereleases:boolean}{
  const owner=String(input.owner??'').trim();const repo=String(input.repo??'').trim();
  if(!SLUG.test(owner)||!SLUG.test(repo))throw new Error('GITHUB_PUBLIC_REPOSITORY_INVALID');
  return {owner,repo,includePrereleases:input.includePrereleases===true};
}

interface GitHubRelease { id?:number;tag_name?:string;name?:string|null;body?:string|null;html_url?:string;draft?:boolean;prerelease?:boolean;published_at?:string|null;immutable?:boolean; }

export function createGitHubReleasesAdapter(http:JsonClient):IntegrationAdapter{
  const headers={accept:'application/vnd.github+json','x-github-api-version':'2026-03-10','user-agent':'discord-auto-server-platform'};
  const list=async(config:Readonly<Record<string,unknown>>)=>{
    const {owner,repo,includePrereleases}=repoConfig(config);
    const releases=await http.json<GitHubRelease[]>(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=20`,{headers});
    if(!Array.isArray(releases))throw new Error('GITHUB_RELEASE_RESPONSE_INVALID');
    return {owner,repo,releases:releases.filter((item)=>item&&item.draft!==true&&(includePrereleases||item.prerelease!==true)).slice(0,20)};
  };
  return {
    key:'github-releases',
    capabilities:{news:true,content:true,releases:true},
    config:{
      fields:[
        {key:'owner',label:'Repository owner',type:'text',required:true,maxLength:100},
        {key:'repo',label:'Repository name',type:'text',required:true,maxLength:100},
        {key:'includePrereleases',label:'Include prereleases',type:'boolean',required:false},
      ],
      validate(input){return repoConfig(input);},
    },
    async health(context?:IntegrationAdapterContext){const cfg=repoConfig(context?.config??{});const result=await list(cfg);return {healthy:true,detail:`GitHub public releases reachable for ${result.owner}/${result.repo}; ${result.releases.length} published release(s) returned.`};},
    async sync(context:IntegrationAdapterContext):Promise<IntegrationSyncResult>{
      const result=await list(context.config);
      const releases=result.releases.map((item)=>({
        id:Number(item.id??0),tag:String(item.tag_name??''),name:String(item.name??item.tag_name??''),summary:String(item.body??'').slice(0,4000),url:String(item.html_url??''),prerelease:Boolean(item.prerelease),immutable:Boolean(item.immutable),publishedAt:item.published_at??null,
      })).filter((item)=>item.id>0&&item.tag&&item.url);
      return {contentType:'github-releases',externalVersion:releases[0]?.tag??'none',itemCount:releases.length,payload:{provider:'github-releases',repository:`${result.owner}/${result.repo}`,releases},detail:`Synced ${releases.length} public release record(s) from ${result.owner}/${result.repo}.`};
    },
  };
}
