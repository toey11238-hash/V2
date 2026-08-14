import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLinuxX64PluginSeccompFilter, ExternalPluginProcessRunner, probeLinuxThirdPartySandbox } from '@autoserver/plugins';

describe('external plugin execution policy', () => {
  it('rejects third-party execution unless the explicit kernel sandbox profile is selected', async () => {
    const root = await mkdtemp(join(tmpdir(),'autoserver-plugin-'));
    await writeFile(join(root,'plugin.mjs'), `process.stdin.resume()`);
    const runner = new ExternalPluginProcessRunner({ enabled:true, allowThirdParty:true, thirdPartySandboxProfile:'DISABLED', pluginRoot:root, timeoutMs:500, maxOutputBytes:1024 });
    await expect(runner.run({ manifest:{ key:'third', version:'1.0.0', displayName:'Third', permissionsNeeded:[], eventsUsed:[], databaseTables:[], setupModules:[], panels:[], dependencies:[] }, trustLevel:'THIRD_PARTY', entrypoint:'plugin.mjs' }, { requestId:'r', action:'health', guildId:'g', input:{} })).rejects.toThrow('THIRD_PARTY_SANDBOX_REQUIRED');
  });

  it('rejects entrypoints outside the configured plugin root before execution', async () => {
    const root = await mkdtemp(join(tmpdir(),'autoserver-plugin-root-'));
    const outside = join(tmpdir(),'autoserver-outside-plugin.mjs');
    await writeFile(outside, `process.stdin.resume()`);
    const runner = new ExternalPluginProcessRunner({ enabled:true, allowThirdParty:false, pluginRoot:root, timeoutMs:500, maxOutputBytes:1024 });
    await expect(runner.run({ manifest:{ key:'trusted', version:'1.0.0', displayName:'Trusted', permissionsNeeded:[], eventsUsed:[], databaseTables:[], setupModules:[], panels:[], dependencies:[] }, trustLevel:'TRUSTED_EXTERNAL', entrypoint:outside }, { requestId:'r', action:'health', guildId:'g', input:{} })).rejects.toThrow('PLUGIN_ENTRYPOINT_OUTSIDE_ROOT');
  });

  it('builds an aligned x86_64 seccomp program with architecture and syscall policy instructions', () => {
    const filter = buildLinuxX64PluginSeccompFilter();
    expect(filter.byteLength).toBeGreaterThan(8 * 40);
    expect(filter.byteLength % 8).toBe(0);
    expect(filter.includes(Buffer.from([0x3e,0x00,0x00,0xc0]))).toBe(true);
  });

  if (process.env.AUTOSERVER_REQUIRE_PLUGIN_SANDBOX === '1') {
    it('passes the deployment kernel-isolation probe when the deployment explicitly requires third-party plugins', async () => {
      const result = await probeLinuxThirdPartySandbox();
      expect(result.verified, result.reason).toBe(true);
      expect(Object.values(result.checks).every(Boolean)).toBe(true);
    });
  }
});
