import type { z } from 'zod';

import type { FieldIssueCode, FieldIssues } from '@/contracts';

const SEGMENT = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
const MAX_FIELDS = 50;
const CODES: ReadonlySet<unknown> = new Set<FieldIssueCode>([
  'required',
  'too-short',
  'too-long',
  'invalid',
]);
const isFieldIssueCode = (code: unknown): code is FieldIssueCode => CODES.has(code);

/** `statements.0.quote`; undefined if a segment is not a plain name or index. */
function pathOf(path: readonly PropertyKey[]): string | undefined {
  if (path.length === 0) return undefined;
  const segments: string[] = [];
  for (const segment of path) {
    if (typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0) {
      segments.push(String(segment));
    } else if (typeof segment === 'string' && SEGMENT.test(segment)) {
      segments.push(segment);
    } else {
      return undefined;
    }
  }
  return segments.join('.');
}

/** Sizes a form shows as length: of text, of a list. A number out of range is just invalid. */
const LENGTHS: ReadonlySet<unknown> = new Set(['string', 'array', 'set']);

function codeOf(issue: z.core.$ZodIssue): FieldIssueCode {
  if (issue.code === 'invalid_type') return issue.input === undefined ? 'required' : 'invalid';
  if (issue.code === 'too_small' && LENGTHS.has(issue.origin)) {
    return Number(issue.minimum) <= 1 ? 'required' : 'too-short';
  }
  if (issue.code === 'too_big' && LENGTHS.has(issue.origin)) return 'too-long';
  if (issue.code === 'custom') {
    const code: unknown = issue.params?.['code'];
    return isFieldIssueCode(code) ? code : 'invalid';
  }
  return 'invalid';
}

/**
 * Zod issues as field codes (pipeline step 3). Zod's messages are dropped:
 * the form shows Czech text per code. Unknown keys name no field; the
 * caller reports them without echoing the key names.
 */
export function toFieldIssues(error: z.ZodError): FieldIssues {
  const fields: Record<string, FieldIssueCode> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') continue;
    const path = pathOf(issue.path);
    if (path === undefined || path in fields) continue;
    if (Object.keys(fields).length >= MAX_FIELDS) break;
    fields[path] = codeOf(issue);
  }
  return fields;
}
