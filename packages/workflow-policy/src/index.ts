import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('\"') && trimmed.endsWith('\"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function evaluateWorkflowSupplyChain(root, policyPath) {
  const workflowDir = join(root, '.github', 'workflows');
  const findings = [];
  if (!existsSync(policyPath)) {
    return { schemaVersion: 1, ready: false, workflowCount: 0, externalUseCount: 0, localUseCount: 0, approvedActions: [], findings: [{ code: 'policy.missing', path: policyPath, line: null, message: 'GitHub Actions policy file is missing', blocking: true }] };
  }
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (policy.schemaVersion !== 1 || !policy.actions || typeof policy.actions !== 'object') {
    findings.push({ code: 'policy.invalid', path: policyPath, line: null, message: 'GitHub Actions policy must be schemaVersion 1 with an actions map', blocking: true });
  }
  const actionPolicy = policy.actions && typeof policy.actions === 'object' && !Array.isArray(policy.actions) ? policy.actions as Record<string,{sha?:unknown;version?:unknown}> : {};
  const approvedActions = Object.entries(actionPolicy).map(([name, value]) => ({ name, sha: typeof value.sha === 'string' ? value.sha : null, version: typeof value.version === 'string' ? value.version : null }));
  for (const action of approvedActions) {
    if (!/^[0-9a-f]{40}$/i.test(action.sha ?? '')) findings.push({ code: 'policy.sha-invalid', path: policyPath, line: null, message: `${action.name} policy SHA must be 40 hexadecimal characters`, blocking: true });
    if (policy.requireVersionComment && !/^v\d+(?:\.\d+){1,2}(?:[-+].+)?$/.test(action.version ?? '')) findings.push({ code: 'policy.version-invalid', path: policyPath, line: null, message: `${action.name} policy version annotation is missing/invalid`, blocking: true });
  }

  if (!existsSync(workflowDir)) {
    findings.push({ code: 'workflow.directory-missing', path: '.github/workflows', line: null, message: 'Workflow directory is missing', blocking: true });
    return { schemaVersion: 1, ready: false, workflowCount: 0, externalUseCount: 0, localUseCount: 0, approvedActions, findings };
  }

  const files = readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name)).sort();
  let externalUseCount = 0;
  let localUseCount = 0;
  const uses = [];
  for (const name of files) {
    const full = join(workflowDir, name);
    const text = readFileSync(full, 'utf8');
    const lines = text.split(/\r?\n/);
    if (policy.requireExplicitPermissions && !lines.some((line) => /^permissions:\s*(?:#.*)?$/.test(line))) {
      findings.push({ code: 'workflow.permissions-missing', path: `.github/workflows/${name}`, line: null, message: 'Workflow must declare explicit top-level permissions', blocking: true });
    }
    lines.forEach((line, index) => {
      const lineNo = index + 1;
      if (/^permissions:\s*write-all\s*(?:#.*)?$/.test(line) || /^\s+permissions:\s*write-all\s*(?:#.*)?$/.test(line)) {
        findings.push({ code: 'workflow.write-all', path: `.github/workflows/${name}`, line: lineNo, message: 'write-all permissions are forbidden', blocking: true });
      }
      if (!policy.allowPullRequestTarget && /^\s*pull_request_target\s*:/.test(line)) {
        findings.push({ code: 'workflow.pull-request-target', path: `.github/workflows/${name}`, line: lineNo, message: 'pull_request_target is forbidden by workflow policy', blocking: true });
      }
      const match = line.match(/^\s*(?:-\s*)?uses:\s*([^#]+?)(?:\s+#\s*(.+))?\s*$/);
      if (!match) return;
      const target = stripQuotes(match[1]);
      const comment = (match[2] ?? '').trim();
      if (target.startsWith('./')) {
        localUseCount += 1;
        uses.push({ path: `.github/workflows/${name}`, line: lineNo, target, kind: 'local' });
        return;
      }
      externalUseCount += 1;
      uses.push({ path: `.github/workflows/${name}`, line: lineNo, target, kind: target.startsWith('docker://') ? 'docker' : 'external' });
      if (target.startsWith('docker://')) {
        findings.push({ code: 'action.docker-unapproved', path: `.github/workflows/${name}`, line: lineNo, message: `Docker action is not admitted by the current policy: ${target}`, blocking: true });
        return;
      }
      if (target.includes('${{')) {
        findings.push({ code: 'action.dynamic-ref', path: `.github/workflows/${name}`, line: lineNo, message: `Dynamic expressions are forbidden in external action references: ${target}`, blocking: true });
        return;
      }
      const ext = target.match(/^([^\s@]+\/[^\s@]+)@([^\s]+)$/);
      if (!ext) {
        findings.push({ code: 'action.syntax', path: `.github/workflows/${name}`, line: lineNo, message: `Unsupported external action syntax: ${target}`, blocking: true });
        return;
      }
      const [, actionName, ref] = ext;
      if (!/^[0-9a-f]{40}$/i.test(ref)) {
        findings.push({ code: 'action.unpinned', path: `.github/workflows/${name}`, line: lineNo, message: `${actionName} must use a full 40-character commit SHA, not ${ref}`, blocking: true });
        return;
      }
      const approved = policy.actions?.[actionName];
      if (!approved) {
        findings.push({ code: 'action.unapproved', path: `.github/workflows/${name}`, line: lineNo, message: `${actionName} is not in the approved action allowlist`, blocking: true });
        return;
      }
      if (ref.toLowerCase() !== String(approved.sha).toLowerCase()) {
        findings.push({ code: 'action.digest-drift', path: `.github/workflows/${name}`, line: lineNo, message: `${actionName} digest differs from the reviewed policy SHA`, blocking: true });
      }
      if (actionName === 'actions/checkout') {
        const stepIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
        let hasPersistFalse = false;
        for (let j = index + 1; j < lines.length; j += 1) {
          const next = lines[j];
          if (!next.trim() || next.trimStart().startsWith('#')) continue;
          const nextIndent = next.match(/^(\s*)/)?.[1]?.length ?? 0;
          if (nextIndent <= stepIndent && /^\s*-/.test(next)) break;
          if (/^\s+persist-credentials:\s*false\s*(?:#.*)?$/.test(next)) hasPersistFalse = true;
        }
        if (!hasPersistFalse) findings.push({ code: 'checkout.credentials-persist', path: `.github/workflows/${name}`, line: lineNo, message: 'actions/checkout must set persist-credentials: false', blocking: true });
      }
      if (policy.requireVersionComment && !comment.split(/\s+/).includes(approved.version)) {
        findings.push({ code: 'action.version-comment', path: `.github/workflows/${name}`, line: lineNo, message: `${actionName} must retain review annotation # ${approved.version}`, blocking: true });
      }
    });
  }
  if (files.length === 0) findings.push({ code: 'workflow.none', path: '.github/workflows', line: null, message: 'No workflow YAML files found', blocking: true });
  return { schemaVersion: 1, ready: findings.length === 0, workflowCount: files.length, externalUseCount, localUseCount, approvedActions, uses, findings };
}
