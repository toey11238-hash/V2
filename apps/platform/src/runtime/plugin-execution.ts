import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@autoserver/config';
import { PluginExecutionRunRepository, PluginInstallationRepository, type Database } from '@autoserver/database';
import { ExternalPluginProcessRunner, type ExternalPluginRequest, type ExternalPluginResponse } from '@autoserver/plugins';

export class PluginExecutionService {
  private readonly runner: ExternalPluginProcessRunner;
  constructor(private readonly database: Database, private readonly config: AppConfig) {
    this.runner = new ExternalPluginProcessRunner({
      pluginRoot: config.PLUGIN_ROOT,
      enabled: config.EXTERNAL_PLUGINS_ENABLED,
      allowThirdParty: config.THIRD_PARTY_PLUGINS_ENABLED,
      thirdPartySandboxProfile: config.THIRD_PARTY_PLUGIN_SANDBOX_PROFILE,
      sandboxMemoryMb: config.PLUGIN_SANDBOX_HEAP_MB,
      sandboxTmpMb: config.PLUGIN_SANDBOX_TMP_MB,
      timeoutMs: config.PLUGIN_TIMEOUT_MS,
      maxOutputBytes: config.PLUGIN_MAX_OUTPUT_BYTES,
    });
  }

  async health(input:{guildId:string;pluginKey:string;correlationId:string}):Promise<ExternalPluginResponse & {durationMs?:number; mode:string; isolation?:'TRUSTED_NODE_PERMISSION'|'LINUX_NS_SECCOMP_V1'}> {
    const installation=await new PluginInstallationRepository(this.database).get(input.guildId,input.pluginKey);
    if(!installation || !installation.enabled) return {requestId:'none',ok:false,error:{code:'PLUGIN_NOT_ENABLED',message:'Plugin is not installed and enabled for this guild.'},mode:'NONE'};
    if(installation.executionMode==='IN_PROCESS') return {requestId:'builtin',ok:installation.state==='READY',result:{state:installation.state},mode:'IN_PROCESS'};
    if(!installation.entrypointPath) return {requestId:'none',ok:false,error:{code:'PLUGIN_ENTRYPOINT_MISSING',message:'External plugin entrypoint is not configured.'},mode:'EXTERNAL_PROCESS'};
    const request:ExternalPluginRequest={requestId:randomUUID(),action:'health',guildId:input.guildId};
    const runId=randomUUID(); const runs=new PluginExecutionRunRepository(this.database);
    await runs.start({runId,guildId:input.guildId,pluginKey:input.pluginKey,action:'health',requestId:request.requestId,correlationId:input.correlationId});
    try{
      const result=await this.runner.run({manifest:installation.manifest as any,entrypoint:installation.entrypointPath,trustLevel:installation.trustLevel==='THIRD_PARTY'?'THIRD_PARTY':'TRUSTED_EXTERNAL'},request);
      const code=result.response.error?.code;
      await runs.finish({runId,status:result.response.ok?'SUCCEEDED':code==='PLUGIN_TIMEOUT'?'TIMED_OUT':'FAILED',durationMs:result.durationMs,errorCode:code,errorMessage:result.response.error?.message,isolationProfile:result.isolation});
      return {...result.response,durationMs:result.durationMs,mode:'EXTERNAL_PROCESS',isolation:result.isolation};
    }catch(error){
      const message=error instanceof Error?error.message:'Plugin execution failed';
      await runs.finish({runId,status:'REJECTED',durationMs:0,errorCode:message,errorMessage:message}).catch(()=>undefined);
      return {requestId:request.requestId,ok:false,error:{code:message,message},mode:'EXTERNAL_PROCESS'};
    }
  }
}
