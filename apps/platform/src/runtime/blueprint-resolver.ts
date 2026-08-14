import type { Database } from '@autoserver/database';
import { blueprintCatalog, getBlueprint } from '@autoserver/blueprints';
import { CustomBlueprintRepository } from '@autoserver/change-control';
import type { ServerBlueprint } from '@autoserver/setup';

export async function resolveGuildBlueprint(database:Database,guildId:string,key:string):Promise<ServerBlueprint>{
  if(blueprintCatalog.has(key)) return getBlueprint(key);
  if(!key.startsWith('custom:')) throw new Error(`Unknown blueprint: ${key}`);
  if(!database.configured) throw new Error('DATABASE_REQUIRED_FOR_CUSTOM_BLUEPRINT');
  const blueprint=await new CustomBlueprintRepository(database).get(guildId,key,true);
  if(!blueprint) throw new Error(`Unknown or unpublished custom blueprint: ${key}`);
  return blueprint;
}

export async function listGuildBlueprints(database:Database,guildId?:string){
  const builtIn=[...blueprintCatalog.values()].map((blueprint)=>({key:blueprint.key,version:blueprint.version,displayName:blueprint.displayName,description:blueprint.description,complexity:blueprint.complexity,source:'BUILT_IN' as const,status:'PUBLISHED'}));
  if(!guildId||!database.configured)return builtIn;
  const custom=(await new CustomBlueprintRepository(database).list(guildId)).map((blueprint)=>({...blueprint,source:'CUSTOM' as const}));
  return [...builtIn,...custom];
}
