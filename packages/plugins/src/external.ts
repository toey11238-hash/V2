import { constants as fsConstants } from 'node:fs';
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { PluginManifest } from './index.js';

export type PluginTrustLevel = 'BUILTIN' | 'TRUSTED_EXTERNAL' | 'THIRD_PARTY';
export type PluginExecutionMode = 'IN_PROCESS' | 'EXTERNAL_PROCESS';
export type ThirdPartySandboxProfile = 'DISABLED' | 'LINUX_NS_SECCOMP_V1';

export interface ExternalPluginDescriptor {
  manifest: PluginManifest;
  entrypoint: string;
  trustLevel: Exclude<PluginTrustLevel, 'BUILTIN'>;
}

export interface ExternalPluginExecutionPolicy {
  pluginRoot: string;
  enabled: boolean;
  allowThirdParty: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  nodeExecutable?: string;
  thirdPartySandboxProfile?: ThirdPartySandboxProfile;
  sandboxMemoryMb?: number;
  sandboxTmpMb?: number;
  readonlyEnvironment?: Readonly<Record<string, string>>;
}

export interface ExternalPluginRequest {
  requestId: string;
  action: 'initialize' | 'health' | 'invoke' | 'shutdown';
  guildId?: string;
  featureId?: string;
  input?: Record<string, unknown>;
}

export interface ExternalPluginResponse {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface ExternalPluginRunResult {
  response: ExternalPluginResponse;
  durationMs: number;
  stderr: string;
  isolation?: 'TRUSTED_NODE_PERMISSION' | 'LINUX_NS_SECCOMP_V1';
}

export interface LinuxSandboxProbeResult {
  supported: boolean;
  verified: boolean;
  profile: 'LINUX_NS_SECCOMP_V1';
  checks: Record<string, boolean>;
  reason?: string;
  detail?: Record<string, unknown>;
}

const secretLike = /(TOKEN|SECRET|PASSWORD|DATABASE_URL|SERVICE_ROLE|PRIVATE_KEY|API_KEY|COOKIE|SESSION)/i;
const X64_AUDIT_ARCH = 0xc000003e;
const SECCOMP_RET_KILL_PROCESS = 0x80000000;
const SECCOMP_RET_ALLOW = 0x7fff0000;
const SECCOMP_RET_ERRNO = 0x00050000;
const BPF_LD_W_ABS = 0x20;
const BPF_JMP_JEQ_K = 0x15;
const BPF_RET_K = 0x06;
const BPF_ALU_AND_K = 0x54;
const X64_CLONE = 56;
const X64_CLONE_NAMESPACE_MASK = 0x7e020000;
const X64_CLONE_THREAD = 0x00010000;

const X64_DENY_EPERM = [
  41, 42, 43, 49, 50, 53, 101, 155, 161, 165, 166, 167, 168, 169, 175, 176,
  246, 248, 249, 250, 272, 288, 298, 300, 303, 304, 308, 310, 311, 313, 321,
  323, 425, 57, 58,
] as const;
const X64_DENY_ENOSYS = [435] as const; // clone3 -> libc may safely fall back to clone(2).

function safeEnvironment(input: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
    LANG: process.env.LANG ?? 'C.UTF-8',
    TZ: 'UTC',
    PATH: '/usr/bin:/bin',
    HOME: '/tmp',
    AUTOSERVER_PLUGIN_PROTOCOL: '1',
  };
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key) || secretLike.test(key)) continue;
    env[key] = value.slice(0, 4096);
  }
  return env;
}

function parseSingleResponse(raw: string, requestId: string): ExternalPluginResponse {
  const line = raw.trim();
  if (!line) return { requestId, ok: false, error: { code: 'PLUGIN_EMPTY_RESPONSE', message: 'Plugin returned no protocol response.' } };
  try {
    const parsed = JSON.parse(line) as Partial<ExternalPluginResponse>;
    if (parsed.requestId !== requestId || typeof parsed.ok !== 'boolean') {
      return { requestId, ok: false, error: { code: 'PLUGIN_PROTOCOL_INVALID', message: 'Plugin response did not match the request protocol.' } };
    }
    return parsed as ExternalPluginResponse;
  } catch {
    return { requestId, ok: false, error: { code: 'PLUGIN_PROTOCOL_INVALID_JSON', message: 'Plugin response was not valid JSON.' } };
  }
}

async function resolveEntrypoint(pluginRoot: string, entrypoint: string): Promise<{ root: string; entrypoint: string; relativeEntrypoint: string }> {
  const root = await realpath(resolve(pluginRoot));
  const candidate = await realpath(isAbsolute(entrypoint) ? entrypoint : resolve(root, entrypoint));
  const rel = relative(root, candidate);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error('PLUGIN_ENTRYPOINT_OUTSIDE_ROOT');
  if (!/\.(?:mjs|cjs|js)$/i.test(candidate)) throw new Error('PLUGIN_ENTRYPOINT_EXTENSION_FORBIDDEN');
  return { root, entrypoint: candidate, relativeEntrypoint: rel.replaceAll('\\', '/') };
}

function addBpfInstruction(output: Buffer[], code: number, jt: number, jf: number, k: number): void {
  const instruction = Buffer.allocUnsafe(8);
  instruction.writeUInt16LE(code, 0);
  instruction.writeUInt8(jt, 2);
  instruction.writeUInt8(jf, 3);
  instruction.writeUInt32LE(k >>> 0, 4);
  output.push(instruction);
}

/**
 * Raw seccomp BPF for the Linux/x86_64 third-party profile.
 * The profile hard-denies network sockets, mount/chroot/namespace changes,
 * ptrace/process-memory access, kernel/module/key/BPF/perf interfaces, fork/vfork,
 * and forces clone3 to ENOSYS so libc can fall back to clone(2). clone(2) is
 * accepted only for CLONE_THREAD pthread-style creation and rejects namespace flags;
 * process-style clone remains kernel-denied.
 */
export function buildLinuxX64PluginSeccompFilter(): Buffer {
  const out: Buffer[] = [];
  const retErrno = (errno: number) => (SECCOMP_RET_ERRNO | errno) >>> 0;

  // Verify the architecture before interpreting syscall numbers.
  addBpfInstruction(out, BPF_LD_W_ABS, 0, 0, 4);
  addBpfInstruction(out, BPF_JMP_JEQ_K, 1, 0, X64_AUDIT_ARCH);
  addBpfInstruction(out, BPF_RET_K, 0, 0, SECCOMP_RET_KILL_PROCESS);

  // clone(2): allow pthread-style threads only. Process-style clone and any
  // namespace-creation clone are kernel-denied even if a JS API guard is bypassed.
  addBpfInstruction(out, BPF_LD_W_ABS, 0, 0, 0);
  addBpfInstruction(out, BPF_JMP_JEQ_K, 0, 8, X64_CLONE);
  addBpfInstruction(out, BPF_LD_W_ABS, 0, 0, 16);
  addBpfInstruction(out, BPF_ALU_AND_K, 0, 0, X64_CLONE_NAMESPACE_MASK);
  addBpfInstruction(out, BPF_JMP_JEQ_K, 1, 0, 0);
  addBpfInstruction(out, BPF_RET_K, 0, 0, retErrno(1));
  addBpfInstruction(out, BPF_LD_W_ABS, 0, 0, 16);
  addBpfInstruction(out, BPF_ALU_AND_K, 0, 0, X64_CLONE_THREAD);
  addBpfInstruction(out, BPF_JMP_JEQ_K, 1, 0, X64_CLONE_THREAD);
  addBpfInstruction(out, BPF_RET_K, 0, 0, retErrno(1));
  addBpfInstruction(out, BPF_LD_W_ABS, 0, 0, 0);

  for (const syscall of X64_DENY_EPERM) {
    addBpfInstruction(out, BPF_JMP_JEQ_K, 0, 1, syscall);
    addBpfInstruction(out, BPF_RET_K, 0, 0, retErrno(1));
  }
  for (const syscall of X64_DENY_ENOSYS) {
    addBpfInstruction(out, BPF_JMP_JEQ_K, 0, 1, syscall);
    addBpfInstruction(out, BPF_RET_K, 0, 0, retErrno(38));
  }
  addBpfInstruction(out, BPF_RET_K, 0, 0, SECCOMP_RET_ALLOW);
  return Buffer.concat(out);
}

const linuxSandboxSetupScript = String.raw`
root="$1"
plugin="$2"
nodebin="$3"
filter="$4"
entry="$5"
memory_mb="$6"
tmp_mb="$7"

mount --make-rprivate /
mount -t tmpfs -o size=64m,nosuid,nodev,noexec tmpfs "$root"
mkdir -p "$root/usr/bin" "$root/usr/lib" "$root/usr/lib64" "$root/plugin" "$root/runtime" "$root/tmp"

mount --bind /usr/lib "$root/usr/lib"
mount -o remount,bind,ro,nosuid,nodev "$root/usr/lib"
if [ -d /usr/lib64 ]; then
  mount --bind /usr/lib64 "$root/usr/lib64"
  mount -o remount,bind,ro,nosuid,nodev "$root/usr/lib64"
fi

touch "$root/usr/bin/setpriv" "$root/runtime/node" "$root/runtime/seccomp.bpf"
mount --bind /usr/bin/setpriv "$root/usr/bin/setpriv"
mount -o remount,bind,ro,nosuid,nodev "$root/usr/bin/setpriv"
mount --bind "$nodebin" "$root/runtime/node"
mount -o remount,bind,ro,nosuid,nodev "$root/runtime/node"
mount --bind "$filter" "$root/runtime/seccomp.bpf"
mount -o remount,bind,ro,nosuid,nodev,noexec "$root/runtime/seccomp.bpf"

mount --bind "$plugin" "$root/plugin"
mount -o remount,bind,ro,nosuid,nodev,noexec "$root/plugin"
if touch "$root/plugin/.autoserver-write-probe" 2>/dev/null; then
  rm -f "$root/plugin/.autoserver-write-probe" 2>/dev/null || true
  exit 96
fi

ln -s usr/lib "$root/lib"
ln -s usr/lib64 "$root/lib64"
mount -t tmpfs -o size="$tmp_mb"m,nosuid,nodev,noexec tmpfs "$root/tmp"
mount -o remount,ro "$root"
if touch "$root/.autoserver-root-write-probe" 2>/dev/null; then
  exit 97
fi

ulimit -c 0
ulimit -n 64
ulimit -t 30

exec /usr/sbin/chroot "$root" /usr/bin/setpriv \
  --nnp \
  --bounding-set=-all \
  --inh-caps=-all \
  --ambient-caps=-all \
  --seccomp-filter=/runtime/seccomp.bpf \
  /runtime/node \
  "--max-old-space-size=$memory_mb" \
  --permission \
  --allow-fs-read=/plugin \
  "/plugin/$entry"
`;

async function assertExecutable(path: string, code: string): Promise<void> {
  try { await access(path, fsConstants.X_OK); }
  catch { throw new Error(code); }
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, Number(value)));
}


async function probeKernelProcessSpawnDenied(nodeExecutable: string): Promise<{ denied: boolean; detail: string }> {
  const workspace = await mkdtemp(join(tmpdir(), 'autoserver-seccomp-process-probe-'));
  const filter = join(workspace, 'seccomp-x64.bpf');
  try {
    await writeFile(filter, buildLinuxX64PluginSeccompFilter(), { mode: 0o444 });
    const child = spawn('/usr/bin/setpriv', [
      '--nnp', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all',
      `--seccomp-filter=${filter}`,
      nodeExecutable,
      '-e',
      "const r=require('node:child_process').spawnSync('/bin/true');process.stdout.write(r.error?.code??String(r.status??''));",
    ], { env: safeEnvironment(undefined), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let stdout=''; let stderr=''; child.stdout.on('data',(chunk:string)=>{stdout+=chunk;}); child.stderr.on('data',(chunk:string)=>{stderr+=chunk;});
    const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolveResult)=>{const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('close',(code,signal)=>{clearTimeout(timer);resolveResult({code,signal});});child.once('error',()=>{clearTimeout(timer);resolveResult({code:null,signal:null});});});
    return { denied: result.code===0 && stdout.trim()==='EPERM', detail: `${stdout.trim()}${stderr.trim()?`:${stderr.trim().slice(0,200)}`:''}` };
  } finally { await rm(workspace,{recursive:true,force:true}).catch(()=>undefined); }
}

async function collectChild(
  child: ChildProcessWithoutNullStreams,
  request: ExternalPluginRequest,
  timeoutMs: number,
  maxOutputBytes: number,
  isolation: ExternalPluginRunResult['isolation'],
): Promise<ExternalPluginRunResult> {
  const started = performance.now();
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let settled = false;
  const killForLimit = () => { if (!settled) child.kill('SIGKILL'); };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > maxOutputBytes) return killForLimit();
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > maxOutputBytes) return killForLimit();
    if (stderr.length < maxOutputBytes) stderr += chunk;
  });
  child.stdin.end(`${JSON.stringify(request)}\n`);
  return await new Promise<ExternalPluginRunResult>((resolveResult) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('close', (code, signal) => {
      settled = true;
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - started);
      if (outputBytes > maxOutputBytes) {
        return resolveResult({ response: { requestId: request.requestId, ok: false, error: { code: 'PLUGIN_OUTPUT_LIMIT', message: 'Plugin exceeded the configured output limit.' } }, durationMs, stderr: stderr.slice(0, 4096), isolation });
      }
      if (durationMs >= timeoutMs && signal) {
        return resolveResult({ response: { requestId: request.requestId, ok: false, error: { code: 'PLUGIN_TIMEOUT', message: 'Plugin exceeded the configured execution timeout.' } }, durationMs, stderr: stderr.slice(0, 4096), isolation });
      }
      if (code !== 0) {
        const setupCode = code === 96 ? 'PLUGIN_SANDBOX_PLUGIN_FS_NOT_READONLY' : code === 97 ? 'PLUGIN_SANDBOX_ROOT_FS_NOT_READONLY' : 'PLUGIN_PROCESS_FAILED';
        return resolveResult({ response: { requestId: request.requestId, ok: false, error: { code: setupCode, message: `Plugin process exited with code ${code ?? 'signal'}.` } }, durationMs, stderr: stderr.slice(0, 4096), isolation });
      }
      return resolveResult({ response: parseSingleResponse(stdout, request.requestId), durationMs, stderr: stderr.slice(0, 4096), isolation });
    });
    child.once('error', (error) => {
      settled = true;
      clearTimeout(timeout);
      resolveResult({ response: { requestId: request.requestId, ok: false, error: { code: 'PLUGIN_PROCESS_START_FAILED', message: error.message } }, durationMs: Math.round(performance.now() - started), stderr: '', isolation });
    });
  });
}

async function runLinuxNamespaceSandbox(
  policy: ExternalPluginExecutionPolicy,
  resolved: { root: string; entrypoint: string; relativeEntrypoint: string },
  request: ExternalPluginRequest,
): Promise<ExternalPluginRunResult> {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('PLUGIN_SANDBOX_PLATFORM_UNSUPPORTED');
  for (const [path, code] of [
    ['/usr/bin/unshare', 'PLUGIN_SANDBOX_UNSHARE_MISSING'],
    ['/usr/bin/mount', 'PLUGIN_SANDBOX_MOUNT_MISSING'],
    ['/usr/sbin/chroot', 'PLUGIN_SANDBOX_CHROOT_MISSING'],
    ['/usr/bin/setpriv', 'PLUGIN_SANDBOX_SETPRIV_MISSING'],
    ['/bin/sh', 'PLUGIN_SANDBOX_SHELL_MISSING'],
  ] as const) await assertExecutable(path, code);

  const nodeExecutable = await realpath(policy.nodeExecutable ?? process.execPath);
  await assertExecutable(nodeExecutable, 'PLUGIN_SANDBOX_NODE_MISSING');

  const workspace = await mkdtemp(join(tmpdir(), 'autoserver-plugin-sandbox-'));
  const root = join(workspace, 'root');
  const filter = join(workspace, 'seccomp-x64.bpf');
  await writeFile(filter, buildLinuxX64PluginSeccompFilter(), { mode: 0o444 });
  await access(workspace, fsConstants.R_OK | fsConstants.W_OK);
  await import('node:fs/promises').then(({ mkdir }) => mkdir(root, { mode: 0o700 }));

  const memoryMb = boundedInteger(policy.sandboxMemoryMb, 384, 192, 2048);
  const tmpMb = boundedInteger(policy.sandboxTmpMb, 8, 1, 64);
  const child = spawn('/usr/bin/unshare', [
    '--user', '--map-root-user', '--mount', '--net', '--pid', '--fork', '--kill-child=SIGKILL',
    '/bin/sh', '-ceu', linuxSandboxSetupScript, 'autoserver-plugin-sandbox',
    root, resolved.root, nodeExecutable, filter, resolved.relativeEntrypoint, String(memoryMb), String(tmpMb),
  ], {
    cwd: resolved.root,
    env: safeEnvironment(policy.readonlyEnvironment),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  try {
    return await collectChild(child, request, policy.timeoutMs, policy.maxOutputBytes, 'LINUX_NS_SECCOMP_V1');
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Runs external plugins over a deliberately tiny JSON stdin/stdout protocol.
 * TRUSTED_EXTERNAL uses Node's Permission Model as defense-in-depth.
 * THIRD_PARTY is fail-closed unless the explicit Linux namespace/seccomp profile
 * is selected; the profile then creates user+mount+network+PID namespaces,
 * read-only plugin/root mounts, zero capability bounding set, resource limits,
 * a syscall filter, no host /proc mount, and Node permissions.
 */
export class ExternalPluginProcessRunner {
  constructor(private readonly policy: ExternalPluginExecutionPolicy) {}

  async run(descriptor: ExternalPluginDescriptor, request: ExternalPluginRequest): Promise<ExternalPluginRunResult> {
    if (!this.policy.enabled) throw new Error('EXTERNAL_PLUGINS_DISABLED');
    if (descriptor.trustLevel === 'THIRD_PARTY' && !this.policy.allowThirdParty) throw new Error('THIRD_PARTY_PLUGINS_DISABLED');
    const resolved = await resolveEntrypoint(this.policy.pluginRoot, descriptor.entrypoint);

    if (descriptor.trustLevel === 'THIRD_PARTY') {
      if ((this.policy.thirdPartySandboxProfile ?? 'DISABLED') !== 'LINUX_NS_SECCOMP_V1') throw new Error('THIRD_PARTY_SANDBOX_REQUIRED');
      return await runLinuxNamespaceSandbox(this.policy, resolved, request);
    }

    const executable = this.policy.nodeExecutable ?? process.execPath;
    const child = spawn(executable, ['--permission', `--allow-fs-read=${resolved.root}`, resolved.entrypoint], {
      cwd: resolved.root,
      env: safeEnvironment(this.policy.readonlyEnvironment),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return await collectChild(child, request, this.policy.timeoutMs, this.policy.maxOutputBytes, 'TRUSTED_NODE_PERMISSION');
  }
}

export async function probeLinuxThirdPartySandbox(): Promise<LinuxSandboxProbeResult> {
  const profile = 'LINUX_NS_SECCOMP_V1' as const;
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return { supported: false, verified: false, profile, checks: {}, reason: 'Linux x86_64 is required for this profile.' };
  }

  const pluginRoot = await mkdtemp(join(tmpdir(), 'autoserver-plugin-probe-'));
  const entrypoint = join(pluginRoot, 'probe.mjs');
  const source = `
import fs from 'node:fs';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
const result={pid:process.pid};
try{fs.writeFileSync('/plugin/write.txt','x');result.pluginWrite='BAD'}catch(error){result.pluginWrite=error.code}
try{fs.readFileSync('/etc/passwd','utf8');result.hostRead='BAD'}catch(error){result.hostRead=error.code}
try{fs.readFileSync('/proc/self/status','utf8');result.procRead='BAD'}catch(error){result.procRead=error.code}
try{spawnSync('/usr/bin/id',[]);result.childProcess='BAD'}catch(error){result.childProcess=error.code}
try{new Worker('',{eval:true});result.worker='BAD'}catch(error){result.worker=error.code}
try{const socket=net.connect(80,'127.0.0.1');await new Promise((done)=>{socket.once('error',(error)=>{result.socket=error.code;done()});socket.once('connect',()=>{result.socket='BAD';socket.destroy();done()});setTimeout(()=>{result.socket='TIMEOUT';socket.destroy();done()},250)})}catch(error){result.socket=error.code}
result.secretVisible=Boolean(process.env.DISCORD_BOT_TOKEN||process.env.DATABASE_URL||process.env.SUPABASE_SECRET_KEY);
console.log(JSON.stringify({requestId:'sandbox-probe',ok:true,result}));
`;
  await writeFile(entrypoint, source, { mode: 0o444 });
  let kernelProcessSpawn={denied:false,detail:'not-run'};
  try {
    const nodeExecutable=await realpath(process.execPath);
    kernelProcessSpawn=await probeKernelProcessSpawnDenied(nodeExecutable);
  } catch (error) {
    kernelProcessSpawn={denied:false,detail:error instanceof Error?error.message:String(error)};
  }
  const runner = new ExternalPluginProcessRunner({
    pluginRoot,
    enabled: true,
    allowThirdParty: true,
    thirdPartySandboxProfile: profile,
    timeoutMs: 3_000,
    maxOutputBytes: 32_768,
    sandboxMemoryMb: 384,
    sandboxTmpMb: 4,
  });
  try {
    const run = await runner.run({
      manifest: { key: 'sandbox-probe', version: '1.0.0', displayName: 'Sandbox Probe', permissionsNeeded: [], eventsUsed: [], databaseTables: [], setupModules: [], panels: [], dependencies: [] },
      trustLevel: 'THIRD_PARTY',
      entrypoint,
    }, { requestId: 'sandbox-probe', action: 'health', guildId: 'probe' });
    const detail = (run.response.result ?? {}) as Record<string, unknown>;
    const denied = (value: unknown) => typeof value === 'string' && value !== 'BAD' && value !== 'TIMEOUT';
    const checks = {
      protocolSucceeded: run.response.ok === true,
      pidNamespace: detail.pid === 1,
      pluginFilesystemReadonly: denied(detail.pluginWrite),
      hostFilesystemHidden: denied(detail.hostRead),
      procNotExposed: denied(detail.procRead),
      childProcessDenied: denied(detail.childProcess),
      processSpawnDeniedByKernel: kernelProcessSpawn.denied,
      workerDenied: denied(detail.worker),
      socketDeniedByKernel: detail.socket === 'EPERM',
      secretEnvironmentStripped: detail.secretVisible === false,
      isolationTagged: run.isolation === profile,
    };
    const verified = Object.values(checks).every(Boolean);
    return { supported: true, verified, profile, checks, reason: verified ? undefined : run.response.error?.message ?? 'One or more isolation checks failed.', detail: { response: run.response, stderr: run.stderr.slice(0, 1000), kernelProcessSpawn: kernelProcessSpawn.detail } };
  } catch (error) {
    return { supported: false, verified: false, profile, checks: {}, reason: error instanceof Error ? error.message : 'Sandbox probe failed.' };
  } finally {
    await rm(pluginRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
