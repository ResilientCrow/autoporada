import { readFileSync } from 'node:fs';

import { parseIssueSnapshot, type IssueSnapshot } from '@/snapshot';

const FIXTURES = new URL('../fixtures/snapshots/', import.meta.url);

/** The raw JSON of a snapshot fixture, for tests that modify it before parsing. */
function rawFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8')) as Record<
    string,
    unknown
  >;
}

/** Parses a fixture (optionally changed first); throws on validation errors. */
export function snapshotFixture(
  name: string,
  change?: (raw: Record<string, unknown>) => void,
): IssueSnapshot {
  const raw = structuredClone(rawFixture(name));
  change?.(raw);
  const result = parseIssueSnapshot(raw);
  if (!result.ok) throw new Error(`fixture ${name} is invalid:\n${result.errors.join('\n')}`);
  return result.snapshot;
}
