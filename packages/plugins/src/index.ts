export type PluginLifecycle = 'REGISTERED' | 'VALIDATED' | 'INITIALIZED' | 'READY' | 'DEGRADED' | 'SHUTTING_DOWN' | 'STOPPED' | 'FAILED';
export interface PluginManifest {
  key: string; version: string; displayName: string;
  permissionsNeeded: string[]; eventsUsed: string[]; databaseTables: string[]; setupModules: string[]; panels: string[];
  dependencies: string[]; optionalDependencies?: string[];
}
export interface PluginRuntimeState { manifest: PluginManifest; state: PluginLifecycle; error?: string; }

const dangerousPermissions = new Set(['Administrator']);
export function validatePluginManifest(manifest: PluginManifest, installedKeys: readonly string[]): string[] {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(manifest.key)) errors.push('INVALID_KEY');
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) errors.push('INVALID_VERSION');
  if (manifest.permissionsNeeded.some((value) => dangerousPermissions.has(value))) errors.push('ADMINISTRATOR_PERMISSION_FORBIDDEN');
  for (const dependency of manifest.dependencies) if (!installedKeys.includes(dependency)) errors.push(`MISSING_DEPENDENCY:${dependency}`);
  return errors;
}

export interface RuntimePlugin {
  manifest: PluginManifest;
  initialize(): Promise<void> | void;
  shutdown(): Promise<void> | void;
  health?(): Promise<'HEALTHY'|'DEGRADED'|'OFFLINE'> | 'HEALTHY'|'DEGRADED'|'OFFLINE';
}

export class PluginRuntimeRegistry {
  private readonly plugins = new Map<string, RuntimePlugin>();
  private readonly states = new Map<string, PluginRuntimeState>();
  register(plugin: RuntimePlugin): void {
    if (this.plugins.has(plugin.manifest.key)) throw new Error(`Duplicate plugin ${plugin.manifest.key}`);
    const errors = validatePluginManifest(plugin.manifest,[...this.plugins.keys()]);
    if (errors.length) throw new Error(`Plugin ${plugin.manifest.key} rejected: ${errors.join(',')}`);
    this.plugins.set(plugin.manifest.key,plugin); this.states.set(plugin.manifest.key,{ manifest: plugin.manifest, state:'VALIDATED' });
  }
  async initializeAll(): Promise<void> {
    for (const [key,plugin] of this.plugins) {
      this.states.set(key,{ manifest:plugin.manifest,state:'INITIALIZED' });
      try { await plugin.initialize(); this.states.set(key,{ manifest:plugin.manifest,state:'READY' }); }
      catch (error) { this.states.set(key,{ manifest:plugin.manifest,state:'FAILED',error:error instanceof Error?error.message:'unknown' }); }
    }
  }
  async shutdownAll(): Promise<void> {
    for (const [key,plugin] of [...this.plugins].reverse()) {
      const current=this.states.get(key)!; this.states.set(key,{...current,state:'SHUTTING_DOWN'});
      try { await plugin.shutdown(); this.states.set(key,{...current,state:'STOPPED'}); }
      catch (error) { this.states.set(key,{...current,state:'FAILED',error:error instanceof Error?error.message:'unknown'}); }
    }
  }
  list(): PluginRuntimeState[] { return [...this.states.values()].map((value)=>({ ...value, manifest:{...value.manifest} })); }
}

export * from "./external.js";
