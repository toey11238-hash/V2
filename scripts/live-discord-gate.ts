import { randomUUID } from 'node:crypto';
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';

const token=process.env.DISCORD_BOT_TOKEN?.trim();const guildId=process.env.TEST_GUILD_ID?.trim();
if(!token)throw new Error('DISCORD_BOT_TOKEN_REQUIRED');if(!guildId)throw new Error('TEST_GUILD_ID_REQUIRED');if(process.env.ALLOW_DISCORD_TEST_GUILD!=='1')throw new Error('ALLOW_DISCORD_TEST_GUILD=1_REQUIRED');
const mutate=process.env.DISCORD_TEST_MUTATIONS==='1';const client=new Client({intents:[GatewayIntentBits.Guilds]});
try{
  await client.login(token);await new Promise<void>((resolve,reject)=>{if(client.isReady())return resolve();const timer=setTimeout(()=>reject(new Error('DISCORD_READY_TIMEOUT')),20_000);client.once('ready',()=>{clearTimeout(timer);resolve();});});
  const guild=await client.guilds.fetch(guildId);const live=await guild.fetch();const me=await live.members.fetchMe();
  const required=[PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles];const missing=required.filter((flag)=>!me.permissions.has(flag));
  if(missing.length)throw new Error(`TEST_GUILD_BOT_PERMISSIONS_MISSING:${missing.map(String).join(',')}`);
  const evidence:any={ok:true,guildId:live.id,guildName:live.name,botUserId:me.id,memberCount:live.memberCount,mutations:mutate,created:[]};
  if(mutate){
    const suffix=randomUUID().slice(0,8);const role=await live.roles.create({name:`zz-autoserver-e2e-${suffix}`,permissions:[],reason:'Auto Server disposable integration gate'});evidence.created.push({kind:'role',id:role.id});
    let category:any;let channel:any;
    try{
      category=await live.channels.create({name:`zz-autoserver-e2e-${suffix}`,type:ChannelType.GuildCategory,reason:'Auto Server disposable integration gate'});evidence.created.push({kind:'category',id:category.id});
      channel=await live.channels.create({name:`zz-autoserver-e2e-${suffix}`,type:ChannelType.GuildText,parent:category.id,reason:'Auto Server disposable integration gate'});evidence.created.push({kind:'text',id:channel.id});
      await channel.setName(`zz-autoserver-e2e-${suffix}-updated`,'Auto Server disposable integration gate');
      const fetched=await live.channels.fetch(channel.id);if(!fetched||fetched.name!==`zz-autoserver-e2e-${suffix}-updated`)throw new Error('DISCORD_MUTATION_VERIFY_FAILED');
      evidence.attributeVerify=true;
    } finally {
      if(channel)await channel.delete('Auto Server integration gate cleanup').catch(()=>undefined);
      if(category)await category.delete('Auto Server integration gate cleanup').catch(()=>undefined);
      await role.delete('Auto Server integration gate cleanup').catch(()=>undefined);
    }
  }
  console.log(JSON.stringify(evidence,null,2));
} finally { client.destroy(); }
