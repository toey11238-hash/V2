import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLinuxX64PluginSeccompFilter, ExternalPluginProcessRunner, probeLinuxThirdPartySandbox } from '../packages/plugins/src/external.ts';

let assertions = 0;
function ok(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`PHASE18_ASSERTION_FAILED:${message}`);
}

const external = await readFile('packages/plugins/src/external.ts','utf8');
const config = await readFile('packages/config/src/index.ts','utf8');
const runtime = await readFile('apps/platform/src/runtime/plugin-execution.ts','utf8');
const bootstrap = await readFile('apps/platform/src/index.ts','utf8');
const migration = await readFile('packages/database/migrations/051_plugin_sandbox_evidence.sql','utf8');
const db = await readFile('packages/database/src/index.ts','utf8');
const env = await readFile('.env.example','utf8');
const pluginDocs = await readFile('docs/PLUGIN_SECURITY.md','utf8');

ok(config.includes("THIRD_PARTY_PLUGIN_SANDBOX_PROFILE: z.enum(['DISABLED','LINUX_NS_SECCOMP_V1']).default('DISABLED')"), 'sandbox profile must default disabled');
ok(config.includes("THIRD_PARTY_PLUGINS_ENABLED=true requires EXTERNAL_PLUGINS_ENABLED=true"), 'third-party must require external plugins');
ok(config.includes("THIRD_PARTY_PLUGINS_ENABLED=true requires an explicit THIRD_PARTY_PLUGIN_SANDBOX_PROFILE"), 'third-party must require explicit profile');
ok(config.includes('PLUGIN_SANDBOX_HEAP_MB'), 'heap budget config missing');
ok(config.includes('PLUGIN_SANDBOX_TMP_MB'), 'tmp budget config missing');
ok(env.includes('THIRD_PARTY_PLUGIN_SANDBOX_PROFILE=DISABLED'), 'env default must fail closed');
ok(runtime.includes('thirdPartySandboxProfile: config.THIRD_PARTY_PLUGIN_SANDBOX_PROFILE'), 'runtime profile wiring missing');
ok(runtime.includes('isolationProfile:result.isolation'), 'run evidence must record isolation profile');
ok(bootstrap.includes('probeLinuxThirdPartySandbox'), 'startup must import live sandbox probe');
ok(bootstrap.includes('THIRD_PARTY_PLUGIN_SANDBOX_UNVERIFIED'), 'startup must fail closed on unverified sandbox');
ok(external.includes("'--user', '--map-root-user', '--mount', '--net', '--pid', '--fork', '--kill-child=SIGKILL'"), 'namespace stack missing');
ok(external.includes('mount -o remount,bind,ro,nosuid,nodev,noexec "$root/plugin"'), 'plugin bind must be read-only/noexec');
ok(external.includes('mount -o remount,ro "$root"'), 'sandbox root must be remounted read-only');
ok(external.includes('--bounding-set=-all'), 'capability bounding set must be empty');
ok(external.includes('--inh-caps=-all'), 'inheritable capabilities must be empty');
ok(external.includes('--ambient-caps=-all'), 'ambient capabilities must be empty');
ok(external.includes('--seccomp-filter=/runtime/seccomp.bpf'), 'seccomp filter must be applied');
ok(external.includes('--permission'), 'Node permission model must be enabled');
ok(external.includes('--allow-fs-read=/plugin'), 'Node read permission must be plugin-scoped');
ok(external.includes('ulimit -n 64'), 'fd budget missing');
ok(external.includes('ulimit -t 30'), 'CPU budget missing');
ok(external.includes('X64_CLONE_THREAD'), 'seccomp clone policy must require thread-style clone');
ok(external.includes('processSpawnDeniedByKernel'), 'probe must verify process-style spawn denial at kernel layer');
ok(external.includes('socketDeniedByKernel'), 'probe must verify kernel socket denial');
ok(external.includes('secretEnvironmentStripped'), 'probe must verify secret env stripping');
ok(external.includes('pidNamespace'), 'probe must verify PID namespace');
ok(external.includes('hostFilesystemHidden'), 'probe must verify host filesystem denial');
ok(external.includes('pluginFilesystemReadonly'), 'probe must verify plugin filesystem denial');
ok(external.includes('procNotExposed'), 'probe must verify proc denial');
ok(migration.includes('isolation_profile'), 'migration must persist isolation profile');
ok(migration.includes("'TRUSTED_NODE_PERMISSION','LINUX_NS_SECCOMP_V1'"), 'migration isolation allowlist missing');
ok(db.includes("isolationProfile?:'TRUSTED_NODE_PERMISSION'|'LINUX_NS_SECCOMP_V1'"), 'repository isolation type missing');
ok(db.includes('isolation_profile=$6'), 'repository must persist isolation profile');
ok(pluginDocs.includes('LINUX_NS_SECCOMP_V1'), 'plugin security docs must document profile');

const filter = buildLinuxX64PluginSeccompFilter();
ok(filter.byteLength % 8 === 0, 'raw BPF must be sock_filter aligned');
ok(filter.byteLength >= 8 * 70, 'seccomp policy unexpectedly small');
ok(filter.includes(Buffer.from([0x3e,0x00,0x00,0xc0])), 'x86_64 audit arch guard missing');

const root = await mkdtemp(join(tmpdir(),'autoserver-phase18-policy-'));
try {
  const entry = join(root,'plugin.mjs');
  await writeFile(entry, 'process.stdin.resume()');
  const runner = new ExternalPluginProcessRunner({enabled:true,allowThirdParty:true,thirdPartySandboxProfile:'DISABLED',pluginRoot:root,timeoutMs:500,maxOutputBytes:1024});
  let rejected = false;
  try {
    await runner.run({manifest:{key:'phase18-policy',version:'1.0.0',displayName:'Policy',permissionsNeeded:[],eventsUsed:[],databaseTables:[],setupModules:[],panels:[],dependencies:[]},trustLevel:'THIRD_PARTY',entrypoint:entry},{requestId:'r',action:'health'});
  } catch (error) {
    rejected = error instanceof Error && error.message === 'THIRD_PARTY_SANDBOX_REQUIRED';
  }
  ok(rejected, 'third-party runner must reject disabled sandbox profile');
} finally {
  await rm(root,{recursive:true,force:true});
}

const probe = await probeLinuxThirdPartySandbox();
ok(probe.supported, `current host must support authored profile for checkpoint evidence: ${probe.reason ?? ''}`);
ok(probe.verified, `current host isolation probe must pass: ${probe.reason ?? ''}`);
ok(Object.values(probe.checks).every(Boolean), 'all malicious probe checks must pass');
ok(probe.checks.processSpawnDeniedByKernel === true, 'process-style spawn must fail with kernel EPERM');
ok(probe.checks.socketDeniedByKernel === true, 'socket must fail with kernel EPERM');
ok(probe.checks.pidNamespace === true, 'plugin must execute as PID 1 in child namespace');
ok(probe.checks.secretEnvironmentStripped === true, 'secret env check must pass');

console.log(`phase18-plugin-sandbox-smoke PASS · ${assertions} assertions · profile=${probe.profile}`);
