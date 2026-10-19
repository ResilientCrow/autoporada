import type { AuditDiff, Json } from '@/application/ports';

/**
 * How a field appears in the audit log: as its value, not at all, or as
 * what a function makes of it (a rich text as plain text).
 */
export type FieldRule<V> = 'value' | 'omit' | ((value: V) => Json);

/** A rule for every field: a new column cannot slip into the log unnoticed. */
export type AuditShape<T> = { readonly [K in keyof T]-?: FieldRule<T[K]> };

function asJson(value: unknown): Json {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new TypeError('diffRecords: give this field a function rule');
}

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

/** The fields that changed between two versions of a record; `null` stands for "did not exist". */
export function diffRecords<T extends object>(
  shape: AuditShape<T>,
  before: T | null,
  after: T | null,
): AuditDiff {
  const diff: Record<string, { from: Json; to: Json }> = {};
  for (const key of Object.keys(shape) as (keyof T & string)[]) {
    const rule: FieldRule<T[typeof key]> = shape[key];
    if (rule === 'omit') continue;
    const view = (record: T | null): Json =>
      record === null ? null : rule === 'value' ? asJson(record[key]) : rule(record[key]);
    const [from, to] = [view(before), view(after)];
    if (!same(from, to)) diff[key] = { from, to };
  }
  return diff;
}
