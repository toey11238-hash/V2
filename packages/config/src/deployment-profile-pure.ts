export interface DeploymentProfileInput {
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
}

export interface DurableDeploymentProfileSummary {
  database: { configured:boolean; providerHint:'supabase'|'postgres'|'none' };
  assetStorage: { provider:'supabase'|'local'; configured:boolean; bucket?:string; keyType:'secret'|'legacy-service-role'|'none' };
  incomplete: string[];
  zeroMandatoryCostCompatible: boolean;
}

function databaseProviderHint(value:string|undefined):'supabase'|'postgres'|'none'{
  if(!value)return 'none';
  try{
    const host=new URL(value).hostname.toLowerCase();
    if(host.endsWith('.supabase.co')||host.endsWith('.supabase.com')||host.includes('.pooler.supabase.'))return 'supabase';
    return 'postgres';
  }catch{return 'postgres';}
}

export function evaluateDurableDeploymentProfile(input:DeploymentProfileInput):DurableDeploymentProfileSummary{
  const databaseConfigured=Boolean(input.DATABASE_URL?.trim());
  const url=Boolean(input.SUPABASE_URL?.trim());
  const secret=Boolean(input.SUPABASE_SECRET_KEY?.trim());
  const legacy=Boolean(input.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const storageConfigured=url&&(secret||legacy);
  const incomplete:string[]=[];
  if((secret||legacy)&&!url)incomplete.push('SUPABASE_URL_REQUIRED_FOR_STORAGE');
  if(url&&!secret&&!legacy)incomplete.push('SUPABASE_SERVER_KEY_REQUIRED_FOR_STORAGE');
  if(!databaseConfigured)incomplete.push('DATABASE_URL_REQUIRED_FOR_DURABLE_STATE');
  const bucket=(input.SUPABASE_STORAGE_BUCKET??'autoserver-assets').trim();
  if(storageConfigured&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(bucket))incomplete.push('SUPABASE_STORAGE_BUCKET_INVALID');
  return {
    database:{configured:databaseConfigured,providerHint:databaseProviderHint(input.DATABASE_URL)},
    assetStorage:{provider:storageConfigured?'supabase':'local',configured:storageConfigured,bucket:storageConfigured?bucket:undefined,keyType:secret?'secret':legacy?'legacy-service-role':'none'},
    incomplete,
    zeroMandatoryCostCompatible:databaseConfigured,
  };
}
