import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const DEFAULT_MAX_BUFFER = 256 * 1024 * 1024;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? null,
    input: options.input,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    stdio: options.stdio,
  });
}

function parseTreeListing(buffer) {
  const records = buffer.toString('utf8').split('\0').filter(Boolean);
  return records.map((record) => {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error(`Unexpected git ls-tree record: ${record}`);
    const [mode, type, object] = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    if (!mode || !type || !object || !path) throw new Error(`Incomplete git ls-tree record: ${record}`);
    return { mode, type, object, path };
  });
}

function readBlobs(root, objectIds) {
  const uniqueIds = [...new Set(objectIds)];
  if (uniqueIds.length === 0) return new Map();
  const input = Buffer.from(`${uniqueIds.join('\n')}\n`, 'utf8');
  const output = git(root, ['cat-file', '--batch'], { input });
  const result = new Map();
  let offset = 0;

  for (const requested of uniqueIds) {
    const lineEnd = output.indexOf(0x0a, offset);
    if (lineEnd < 0) throw new Error(`Truncated git cat-file header for ${requested}`);
    const header = output.subarray(offset, lineEnd).toString('utf8');
    offset = lineEnd + 1;
    const [object, type, sizeText] = header.split(' ');
    if (type === 'missing') throw new Error(`Committed Git object is missing: ${requested}`);
    const size = Number(sizeText);
    if (object !== requested || type !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Unexpected git cat-file response for ${requested}: ${header}`);
    }
    const end = offset + size;
    if (end > output.length) throw new Error(`Truncated git blob content for ${requested}`);
    result.set(requested, Buffer.from(output.subarray(offset, end)));
    offset = end;
    if (output[offset] !== 0x0a) throw new Error(`Missing git cat-file record separator for ${requested}`);
    offset += 1;
  }
  return result;
}

export function loadCommittedGitTree(root, ref = 'HEAD') {
  const commit = git(root, ['rev-parse', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  const gitTree = git(root, ['rev-parse', `${commit}^{tree}`], { encoding: 'utf8' }).trim();
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  const dirty = status.length > 0;
  const listed = parseTreeListing(git(root, ['ls-tree', '-r', '-z', '--full-tree', commit]));
  const blobRows = listed.filter((entry) => entry.type === 'blob');
  const contentByObject = readBlobs(root, blobRows.map((entry) => entry.object));
  const contentByPath = new Map();
  const entries = blobRows
    .map((entry) => {
      const content = contentByObject.get(entry.object);
      if (!content) throw new Error(`Missing committed blob content for ${entry.path}`);
      contentByPath.set(entry.path, content);
      return {
        path: entry.path,
        mode: entry.mode,
        gitObject: entry.object,
        bytes: content.length,
        sha256: sha256(content),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const getBuffer = (path) => {
    const value = contentByPath.get(path);
    if (!value) throw new Error(`Path is not a committed blob at ${commit}: ${path}`);
    return Buffer.from(value);
  };
  const getText = (path) => getBuffer(path).toString('utf8');
  const findEntry = (path) => entries.find((entry) => entry.path === path) ?? null;

  return { commit, gitTree, dirty, status, entries, getBuffer, getText, findEntry };
}

export function committedTreeHash(entries) {
  return sha256(Buffer.from(entries.map((entry) => `${entry.path}\0${entry.mode}\0${entry.gitObject}\0${entry.sha256}`).join('\n')));
}
