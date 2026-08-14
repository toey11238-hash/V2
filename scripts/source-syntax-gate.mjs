import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOTS = ['apps', 'packages', 'scripts', 'tests'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'artifacts', '.git']);
const requireCompiler = process.argv.includes('--require-typescript');

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path, out);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(path);
  }
  return out;
}

async function loadTypescript() {
  try {
    return { module: await import('typescript'), source: 'project' };
  } catch {}

  const candidates = [];
  const execRoot = resolve(dirname(process.execPath), '..', 'lib', 'node_modules', 'typescript', 'lib', 'typescript.js');
  candidates.push(execRoot);
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (globalRoot) candidates.push(join(globalRoot, 'typescript', 'lib', 'typescript.js'));
  } catch {}

  for (const candidate of [...new Set(candidates)]) {
    if (!existsSync(candidate)) continue;
    try {
      return { module: await import(pathToFileURL(candidate).href), source: `global:${candidate}` };
    } catch {}
  }
  return null;
}

function scriptKind(ts, path) {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.mts')) return ts.ScriptKind.TS;
  if (path.endsWith('.cts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.TS;
}

function formatDiagnostic(ts, file, diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (typeof diagnostic.start !== 'number') return `${file}: ${message}`;
  const source = diagnostic.file;
  if (!source) return `${file}: ${message}`;
  const pos = source.getLineAndCharacterOfPosition(diagnostic.start);
  return `${file}:${pos.line + 1}:${pos.character + 1} TS${diagnostic.code}: ${message}`;
}

const compiler = await loadTypescript();
if (!compiler) {
  const message = 'source-syntax-gate BLOCKED · TypeScript parser unavailable (install reviewed dependencies or provide a global TypeScript compiler)';
  console.error(message);
  process.exit(requireCompiler ? 2 : 3);
}

const ts = compiler.module.default ?? compiler.module;
const sentinel = ts.createSourceFile('__syntax_sentinel.ts', "const broken = 'line\nbreak';", ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
if ((sentinel.parseDiagnostics ?? []).length === 0) {
  console.error('source-syntax-gate FAIL · TypeScript parser sentinel did not detect an unterminated string');
  process.exit(2);
}
const files = ROOTS.flatMap((root) => collect(root)).sort();
const failures = [];
for (const file of files) {
  const sourceText = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKind(ts, file));
  for (const diagnostic of parsed.parseDiagnostics ?? []) {
    failures.push(formatDiagnostic(ts, relative(process.cwd(), file), diagnostic));
  }
}

if (failures.length) {
  console.error(`source-syntax-gate FAIL · ${failures.length} parser diagnostic(s) across ${files.length} file(s)`);
  for (const failure of failures.slice(0, 100)) console.error(failure);
  if (failures.length > 100) console.error(`... ${failures.length - 100} more diagnostic(s) omitted`);
  process.exit(2);
}

console.log(`source-syntax-gate PASS · ${files.length} TypeScript source file(s) · parser=${ts.version ?? 'unknown'} · source=${compiler.source}`);
