# Phase 18 - Fail-Closed Plugin Sandbox + Executable Live QA

Status: SOURCE / STATIC TESTING plus current-host sandbox evidence. Migration 051 is AUTHORED / NOT EXECUTED against a selected product database. HTTP/browser self-tests exercise the harnesses only; no product live target is claimed.

## Third-party execution profile

`LINUX_NS_SECCOMP_V1` is the only authored untrusted-plugin profile in this checkpoint. Third-party execution remains disabled by default and requires all of:

- `EXTERNAL_PLUGINS_ENABLED=true`;
- `THIRD_PARTY_PLUGINS_ENABLED=true`;
- `THIRD_PARTY_PLUGIN_SANDBOX_PROFILE=LINUX_NS_SECCOMP_V1`;
- successful hostile sandbox probe on the actual runtime host during startup.

The profile layers:

1. Linux user, mount, network and PID namespaces with the plugin process as PID 1 inside the child namespace;
2. a private tmpfs root and read-only runtime binds;
3. plugin root remounted `ro,nosuid,nodev,noexec`;
4. no host `/proc` mount inside the plugin root;
5. Linux capability bounding/inheritable/ambient sets dropped to empty;
6. a raw classic-BPF seccomp filter denying network sockets and high-risk mount/namespace/ptrace/kernel/module/process-escape syscalls;
7. Node's permission model with read access scoped to `/plugin`;
8. stripped environment plus bounded timeout/output/file descriptors/CPU/V8 heap/tmp storage.

The current execution host passes the hostile probe for protocol, PID namespace, read-only plugin filesystem, hidden host filesystem, hidden `/proc`, child-process denial, kernel-level process-spawn denial, Worker denial, kernel socket denial, secret-environment stripping and isolation tagging. That result is host-specific and is not deployment proof for Render/another Linux host.

V8 heap budgeting is not a hard RSS guarantee. A production target enabling untrusted plugins should also use reviewed deployment-level cgroup/container memory and PID quotas. Unsupported platforms fail closed rather than falling back to weaker isolation.

## Durable evidence

Migration `051_plugin_sandbox_evidence.sql` adds `plugin_execution_runs.isolation_profile`, an allowlist constraint and a recent-evidence index. Runtime completion persists the actual isolation profile rather than merely the requested trust mode.

The disposable DB gate now verifies that `LINUX_NS_SECCOMP_V1` can be persisted and that an invalid isolation label is rejected by the schema. The migration and repository probe are authored but not executed against a selected product DB here.

## Live HTTP gate

`scripts/live-http-gate.mjs` is dependency-free and manual/live-target guarded. It requires HTTPS except for localhost and validates:

- `/live`, `/ready`, `/health` success and JSON;
- essential security headers/CSP/permissions policy;
- rejection of an unauthenticated mutation attempt;
- malformed-request handling without 5xx;
- bounded concurrency/load error-rate and p95 thresholds;
- optional bounded soak duration;
- client-abort behavior.

`--self-test` uses a local synthetic server and proves harness behavior only.

## Live browser gate

`scripts/live-browser-gate.mjs` talks directly to Chromium through CDP and validates:

- title, document language and main/H1 landmarks;
- desktop and mobile horizontal overflow;
- missing image alt text and visible interactive accessible names;
- reduced-motion media behavior;
- mixed-content resource use;
- Accessibility tree unnamed interactive nodes;
- runtime exceptions and console errors.

The self-test injects an in-memory document with CDP `Page.setDocumentContent`. This avoids environment browser policies that may block localhost/data navigation and keeps the self-test independent of network availability. A real product run still navigates the explicitly supplied HTTPS/localhost target and fails on navigation errors.

## Manual workflow

`.github/workflows/live-verification.yml` exposes independent manual switches for disposable DB, Discord test guild, live HTTP and live browser gates. DB/Discord gates use `npm ci` and therefore intentionally remain blocked until a reviewed lockfile exists. HTTP/browser gates are dependency-free and can run against already deployed targets without resolving a new npm dependency graph.

## Evidence in this checkpoint

- `npm run security:plugin-isolation-gate`: PASS on the current host, all hostile checks true.
- `npm run test:phase18-plugin-sandbox`: PASS 45 assertions.
- `npm run test:phase18-live-qa`: PASS 49 assertions and executes HTTP + Chromium CDP harness self-tests.
- `npm run test:live-http-self`: PASS synthetic security/load/soak/abort evidence.
- `npm run test:live-browser-self`: PASS synthetic desktop/mobile/reduced-motion/AX/runtime evidence.

None of the above is a substitute for dependency-backed build/tests, migration 051 execution, an approved Discord guild, deployed HTTP/browser E2E, real load/chaos/soak, or target-specific plugin memory/PID controls.
