export type RecruitmentPostType = 'TEAM_RECRUITING' | 'CLAN_RECRUITING' | 'PLAYER_LFT' | 'COACH_AVAILABLE';
export interface RecruitmentPostRecord {
  recruitmentPostId: string; guildId: string; gameKey: string; postType: RecruitmentPostType; ownerUserId: string; targetId?: string;
  title: string; description: string; region?: string; platform?: string; preferredRoles: string[]; rankLabel?: string; availability: Record<string, unknown>;
  status: 'OPEN'|'CLOSED'|'EXPIRED'; expiresAt: string;
}
export interface RecruitmentPostInput { gameKey:string; postType:RecruitmentPostType; title:string; description?:string; preferredRoles?:string[]; expiresAt:Date; region?:string; platform?:string; rankLabel?:string; }
export function validateRecruitmentPost(input:RecruitmentPostInput,now=new Date()){
  if(!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(input.gameKey))throw new Error('INVALID_GAME_KEY');
  if(!['TEAM_RECRUITING','CLAN_RECRUITING','PLAYER_LFT','COACH_AVAILABLE'].includes(input.postType))throw new Error('INVALID_RECRUITMENT_TYPE');
  const title=input.title.trim();if(title.length<3||title.length>100)throw new Error('INVALID_RECRUITMENT_TITLE');
  const description=(input.description??'').trim();if(description.length>1000)throw new Error('INVALID_RECRUITMENT_DESCRIPTION');
  if(!Number.isFinite(input.expiresAt.getTime())||input.expiresAt<=now||input.expiresAt.getTime()-now.getTime()>30*86_400_000)throw new Error('INVALID_RECRUITMENT_EXPIRY');
  const preferredRoles=[...new Set((input.preferredRoles??[]).map(value=>value.trim()).filter(Boolean))].slice(0,10);if(preferredRoles.some(value=>value.length>80))throw new Error('INVALID_RECRUITMENT_ROLE');
  for(const value of [input.region,input.platform,input.rankLabel])if(value&&value.trim().length>80)throw new Error('INVALID_RECRUITMENT_FILTER');
  return {...input,gameKey:input.gameKey.toLowerCase(),title,description,preferredRoles};
}
