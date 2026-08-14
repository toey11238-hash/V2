import { createHash } from 'node:crypto';

function canonicalizeJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalizeJson(record[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function privacyExportHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
