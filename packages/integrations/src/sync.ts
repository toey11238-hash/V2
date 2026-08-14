import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import type { IntegrationSyncResult } from './index.ts';

export interface IntegrationSyncSnapshot {
  snapshotId:string;guildId:string;integrationKey:string;contentType:string;externalVersion?:string;contentHash:string;itemCount:number;payload:Record<string,unknown>;createdAt:string;
}

function stable(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  const object=value as Record<string,unknown>;return `{${Object.keys(object).sort().map((key)=>`${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}
export function integrationPayloadHash(payload:Record<string,unknown>):string{return createHash('sha256').update(stable(payload)).digest('hex');}

export class IntegrationSyncRepository{
  constructor(private readonly database:Database){}
  async store(input:{guildId:string;integrationKey:string;result:IntegrationSyncResult}):Promise<IntegrationSyncSnapshot>{
    const snapshotId=randomUUID();const contentHash=integrationPayloadHash(input.result.payload);
    const {rows}=await this.database.requirePool().query<any>(
      `insert into integration_sync_snapshots(snapshot_id,guild_id,integration_key,content_type,external_version,content_hash,item_count,payload)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [snapshotId,input.guildId,input.integrationKey,input.result.contentType,input.result.externalVersion??null,contentHash,Math.max(0,Math.floor(input.result.itemCount)),input.result.payload],
    );
    return this.row(rows[0]);
  }
  async latest(guildId:string,integrationKey:string,contentType?:string):Promise<IntegrationSyncSnapshot|undefined>{
    const values:unknown[]=[guildId,integrationKey];const extra=contentType?(values.push(contentType),` and content_type=$3`):'';
    const {rows}=await this.database.requirePool().query<any>(`select * from integration_sync_snapshots where guild_id=$1 and integration_key=$2${extra} order by created_at desc limit 1`,values);
    return rows[0]?this.row(rows[0]):undefined;
  }
  async prune(guildId:string,integrationKey:string,keep=10):Promise<number>{
    const result=await this.database.requirePool().query(`delete from integration_sync_snapshots where snapshot_id in (select snapshot_id from integration_sync_snapshots where guild_id=$1 and integration_key=$2 order by created_at desc offset $3)`,[guildId,integrationKey,Math.max(1,Math.min(100,Math.floor(keep)))]);
    return result.rowCount??0;
  }
  private row(row:any):IntegrationSyncSnapshot{return {snapshotId:String(row.snapshot_id),guildId:String(row.guild_id),integrationKey:String(row.integration_key),contentType:String(row.content_type),externalVersion:row.external_version??undefined,contentHash:String(row.content_hash),itemCount:Number(row.item_count??0),payload:row.payload??{},createdAt:row.created_at instanceof Date?row.created_at.toISOString():String(row.created_at)};}
}
