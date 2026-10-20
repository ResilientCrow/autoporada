import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_RETENTION_YEARS } from '@/domain/retention';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SIGN_IN_TTL_MS } from '@/domain/identity/session';
import { SIGN_IN_COOKIE } from '@/server/auth/cookies';
import { SESSION_COOKIE } from '@/server/pipeline/request';
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

  it('keeps the audit log as long as the code does', () => {
    expect(facts.auditYears).toBe(AUDIT_RETENTION_YEARS);
  });

  it('caps the container logs as deployed', () => {
    const compose = readFileSync(join(ROOT, 'deploy/compose.yaml'), 'utf8');
    expect(compose).toContain(`max-size: ${facts.logMegabytes}m`);
    expect(compose).toContain(`max-file: '${facts.logFiles}'`);
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
