import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getTableColumns } from 'drizzle-orm';

import { AUDIT_RETENTION_YEARS, isPurgeableAccessRequest } from '@/domain/retention';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SIGN_IN_TTL_MS } from '@/domain/identity/session';
import { sessions, users } from '@/infra/db/schema';
import { SIGN_IN_COOKIE, sessionCookie, signInCookie } from '@/server/auth/cookies';
import { SESSION_COOKIE } from '@/server/pipeline/request';
import { privacy } from '@/ui/copy/privacy';
import { PRIVACY_FACTS as facts } from '@/ui/copy/privacy-facts';

const ROOT = process.cwd();
const HOUR = 3_600_000;
const MINUTE = 60_000;

describe('the privacy notice states what the code enforces', () => {
  it('names the two cookies', () => {
    expect(facts.sessionCookie).toBe(SESSION_COOKIE);
    expect(facts.signInCookie).toBe(SIGN_IN_COOKIE);
  });

  it('gives the session and sign-in lifetimes', () => {
    expect(facts.sessionIdleHours * HOUR).toBe(SESSION_IDLE_MS);
    expect(facts.sessionMaxHours * HOUR).toBe(SESSION_ABSOLUTE_MS);
    expect(facts.signInMinutes * MINUTE).toBe(SIGN_IN_TTL_MS);
  });

  it('sets the cookie lifetimes the notice gives', () => {
    expect(signInCookie('v')).toContain(`Max-Age=${facts.signInMinutes * 60}`);
    expect(sessionCookie('v')).not.toMatch(/max-age|expires/i);
  });

  it('keeps the audit log as long as the code does', () => {
    expect(facts.auditYears).toBe(AUDIT_RETENTION_YEARS);
  });

  it('caps the container logs as deployed', () => {
    const compose = readFileSync(join(ROOT, 'deploy/compose.yaml'), 'utf8');
    expect(compose).toContain(`max-size: ${facts.logMegabytes}m`);
    expect(compose).toContain(`max-file: '${facts.logFiles}'`);
  });
});

/** The rows of one retention fact, by term. */
function retentionRow(term: RegExp) {
  const doba = privacy.sections.find((section) => section.id === 'doba');
  const rows = doba?.blocks.flatMap((block) => (block.kind === 'facts' ? block.rows : [])) ?? [];
  return rows.find((row) => term.test(row.term));
}

describe('access requests in the retention table', () => {
  it('purges only the decided ones and keeps blocked requests', () => {
    expect((['approved', 'rejected', 'cancelled'] as const).map(isPurgeableAccessRequest)).toEqual([
      true,
      true,
      true,
    ]);
    expect(isPurgeableAccessRequest('blocked')).toBe(false);
  });

  it('says so: three states are deleted, blocked ones stay while the block lasts', () => {
    expect(retentionRow(/^Schválené, zamítnuté a\u00A0zrušené žádosti/)).toBeDefined();
    expect(retentionRow(/^Zablokované žádosti/)?.value).toBe('po dobu zablokování');
    // No other row may claim the blocked ones are deleted with the rest.
    expect(retentionRow(/vyřízené žádosti/)).toBeUndefined();
  });
});

/**
 * Columns the notice describes under „Jaké údaje zpracováváme“. A new column
 * must be described there first, then added to this list.
 */
const REVIEWED_COLUMNS = {
  users: [
    'id',
    'tid',
    'oid',
    'displayName',
    'email',
    'jobTitle',
    'department',
    'role',
    'isStudent',
    'status',
    'version',
    'createdAt',
    'updatedAt',
  ],
  sessions: [
    'id',
    'tokenHash',
    'userId',
    'authTime',
    'createdAt',
    'lastSeenAt',
    'idleExpiresAt',
    'absExpiresAt',
  ],
};

describe('the personal-data columns are the ones the notice describes', () => {
  it('lists the columns of users and sessions', () => {
    expect(Object.keys(getTableColumns(users)).sort()).toEqual([...REVIEWED_COLUMNS.users].sort());
    expect(Object.keys(getTableColumns(sessions)).sort()).toEqual(
      [...REVIEWED_COLUMNS.sessions].sort(),
    );
  });
});

/** Browser storage the notice says Autoporada does not use. */
const BROWSER_STORAGE = /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/;

function storageUsers(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([, text]) => BROWSER_STORAGE.test(text))
    .map(([path]) => path);
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('storage guard', () => {
  it('fires on browser storage', () => {
    expect(storageUsers({ 'a.ts': 'localStorage.setItem(k, v)', 'b.ts': 'const x = 1;' })).toEqual([
      'a.ts',
    ]);
    expect(storageUsers({ 'c.tsx': 'document.cookie = "a=b"' })).toEqual(['c.tsx']);
  });

  it('finds none in src, so the notice may say nothing else is stored in the browser', () => {
    const files = Object.fromEntries(
      sources(join(ROOT, 'src')).map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')]),
    );
    expect(Object.keys(files).length).toBeGreaterThan(50);
    expect(storageUsers(files)).toEqual([]);
  });
});
