# Plugin Execution Security Model

## Trust tiers

- `BUILTIN`: project-owned code reviewed with the core platform; may run in-process.
- `TRUSTED_EXTERNAL`: explicitly installed operator-controlled JavaScript; runs out-of-process when external execution is enabled and uses Node's Permission Model as defense-in-depth.
- `THIRD_PARTY`: disabled by default. It requires `EXTERNAL_PLUGINS_ENABLED=true`, `THIRD_PARTY_PLUGINS_ENABLED=true`, an explicit sandbox profile, and a successful runtime kernel-isolation probe on the deployment that will execute it.

## Linux namespace/seccomp profile

`LINUX_NS_SECCOMP_V1` is the authored third-party profile for Linux x86_64. It is never selected automatically. The platform refuses startup when third-party execution is enabled and the deployment probe does not pass.

Each third-party run receives a fresh containment boundary:

- a new user namespace with a private mount namespace;
- a new network namespace with no host network stack;
- a new PID namespace; the plugin Node process is PID 1 inside that namespace;
- a tmpfs sandbox root remounted read-only before plugin execution;
- the plugin tree bind-mounted read-only, `nosuid`, `nodev`, and `noexec`;
- no host `/proc` mount inside the sandbox;
- only runtime libraries, `setpriv`, the selected Node binary, the seccomp program, the read-only plugin tree, and a bounded ephemeral `/tmp` are exposed;
- `no_new_privs` and empty bounding/inheritable/ambient capability sets;
- raw seccomp BPF with an x86_64 architecture guard;
- kernel denial of socket/network calls, mount/chroot/namespace changes, ptrace/process-memory access, kernel/module/key/BPF/perf interfaces, fork/vfork and related high-risk syscalls;
- `clone3` reported as `ENOSYS` for libc fallback while `clone(2)` namespace-creation flags are rejected;
- Node Permission Model with filesystem read access limited to `/plugin`; child processes, workers, native addons, WASI and filesystem writes are not granted;
- stripped environment; Discord tokens, database URLs, Supabase server keys, cookies, sessions and API secrets are not forwarded;
- wall-clock timeout, output-byte ceiling, file-descriptor ceiling, CPU-time ceiling, V8 old-space heap budget and bounded ephemeral tmpfs.

The setup phase also attempts writes against the plugin mount and sandbox root after read-only remount. A write succeeding is a hard sandbox setup failure.

### What the profile does not claim

- A passing probe on one host is not transferable evidence for another deployment. The target kernel/container must pass its own probe.
- `PLUGIN_SANDBOX_HEAP_MB` is a V8 heap budget, not a hard process RSS/cgroup limit. A production deployment that accepts hostile third-party code should additionally enforce deployment-level memory/PID quotas (for example a reviewed container/cgroup policy).
- This is a layered malicious-code containment profile, not a claim that Node/V8 or the Linux kernel is vulnerability-free.
- The current profile is Linux x86_64 only. Unsupported OS/architectures fail closed.

Run the deployment probe with:

`npm run security:plugin-isolation-gate`

The gate executes an intentionally hostile plugin and requires evidence that PID isolation, read-only plugin filesystem, host filesystem denial, `/proc` denial, child-process denial, worker denial, kernel socket denial, secret-environment stripping and protocol isolation all hold.

## Trusted external process boundary

External plugin entrypoints must resolve under `PLUGIN_ROOT`. The runtime:

- uses a one-request JSON stdin/stdout protocol;
- starts with a stripped environment;
- has a hard timeout and output-size cap;
- does not enable child-process, worker, native addon or filesystem-write permissions by default;
- records execution outcome, correlation ID and isolation profile in `plugin_execution_runs`;
- does not treat Node's Permission Model alone as a malicious-code security boundary.

`TRUSTED_EXTERNAL` does not receive the kernel sandbox automatically because the trust tier represents operator-controlled code. Operators who do not trust the code must install it as `THIRD_PARTY` and use the kernel profile instead.

## Installation boundary

The dashboard intentionally exposes plugin state/health before exposing arbitrary entrypoint installation. Arbitrary path installation is not accepted from a Discord interaction or browser form. Installation must come from an approved plugin package/import workflow that verifies manifest identity, package integrity and operator approval.

Third-party execution remains fail-closed unless all runtime gates are present. An environment switch by itself is insufficient.
