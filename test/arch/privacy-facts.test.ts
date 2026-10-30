import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getTableColumns } from 'drizzle-orm';

import {
  AUDIT_RETENTION_YEARS,
  MAIL_LEDGER_RETENTION_DAYS,
  isPurgeableAccessRequest,
} from '@/domain/retention';
import { DIRECTORY_LIMITS } from '@/domain/report';
import { ACCESS_COOLDOWN_DAYS, ACCESS_MACHINE } from '@/domain/review';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SIGN_IN_TTL_MS } from '@/domain/identity/session';
import { sessions, users } from '@/infra/db/schema';
import { QUEUES } from '@/infra/jobs';
import { SIGN_IN_COOKIE, sessionCookie, signInCookie } from '@/server/auth/cookies';
import { SESSION_COOKIE } from '@/server/pipeline/request';
import { privacy } from '@/ui/copy/privacy';
import { PRIVACY_FACTS as facts } from '@/ui/copy/privacy-facts';
import type { Rich, Section } from '@/ui/copy/privacy-types';

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
  it('purges only the decided ones; pending and blocked requests stay', () => {
    expect((['approved', 'rejected', 'cancelled'] as const).map(isPurgeableAccessRequest)).toEqual([
      true,
      true,
      true,
    ]);
    expect(isPurgeableAccessRequest('pending')).toBe(false);
    expect(isPurgeableAccessRequest('blocked')).toBe(false);
  });

  it('cannot lift a block, so a blocked request has no end date', () => {
    const fromBlocked = Object.values(ACCESS_MACHINE).filter((t) => t.from.includes('blocked'));
    expect(fromBlocked).toEqual([]);
  });

  it('states the wait before a new request, as long as the code enforces it', () => {
    expect(facts.accessCooldownDays).toBe(ACCESS_COOLDOWN_DAYS);
    const row = retentionRow(/^Schválené, zamítnuté a\u00A0zrušené žádosti/);
    expect(row?.value).toContain(
      `Novou žádost lze podat nejdříve ${ACCESS_COOLDOWN_DAYS}\u00A0dní po zamítnutí.`,
    );
  });

  it('says so: three states are deleted, pending ones wait, blocked ones stay', () => {
    expect(retentionRow(/^Schválené, zamítnuté a\u00A0zrušené žádosti/)).toBeDefined();
    expect(retentionRow(/^Čekající žádosti/)?.value).toBe('do rozhodnutí vedení školy');
    expect(retentionRow(/^Zablokované žádosti/)).toMatchObject({
      value: 'bez časového omezení, aby blokace platila',
      review: { by: 'dpo' },
    });
    // No other row may claim the blocked ones are deleted with the rest.
    expect(retentionRow(/vyřízené žádosti/)).toBeUndefined();
  });
});

describe('job retention in the notice', () => {
  const days = (seconds: number | undefined) => (seconds ?? 0) / 86_400;
  const queue = (name: string) => QUEUES.find((spec) => spec.name === name)?.options;

  it('gives the days the queues enforce', () => {
    expect(facts.jobsKeptDays).toBe(days(queue('mail.send')?.deleteAfterSeconds));
    expect(facts.unrunJobsKeptDays).toBe(days(queue('mail.send')?.retentionSeconds));
    expect(facts.deadJobsKeptDays).toBe(days(queue('dead')?.deleteAfterSeconds));
    expect(facts.deadJobsKeptDays).toBe(days(queue('dead')?.retentionSeconds));
  });

  it('has a row for them, flagged for the DPO', () => {
    const row = retentionRow(/^Úlohy na\u00A0pozadí/);
    expect(row?.value).toBe(
      `dokončené ${facts.jobsKeptDays}\u00A0dny, nespuštěné ${facts.unrunJobsKeptDays}\u00A0dní, neúspěšné ${facts.deadJobsKeptDays}\u00A0dní`,
    );
    expect(row).toMatchObject({ review: { by: 'dpo' } });
  });
});

describe('the mail ledger in the notice', () => {
  it('keeps it as long as the code does, a day past every dead job', () => {
    expect(facts.mailLogKeptDays).toBe(MAIL_LEDGER_RETENTION_DAYS);
    expect(MAIL_LEDGER_RETENTION_DAYS).toBe(91);
    // A redrive of a dead copy must still find the row that says the mail was sent.
    expect(facts.mailLogKeptDays).toBeGreaterThan(facts.deadJobsKeptDays);
  });

  it('has a row for it, flagged for the DPO', () => {
    const row = retentionRow(/^Záznam o\u00A0odeslaných e-mailech$/);
    expect(row?.value).toBe(`${facts.mailLogKeptDays}\u00A0dní`);
    expect(row).toMatchObject({ review: { by: 'dpo' } });
  });
});

/** The text of one section, flattened: paragraphs, list items and fact rows, links as their text. */
function sectionText(id: string): string {
  const section = privacy.sections.find((candidate) => candidate.id === id);
  const flat = (rich: Rich): string =>
    typeof rich === 'string'
      ? rich
      : rich.map((part) => (typeof part === 'string' ? part : part.text)).join('');
  return (section?.blocks ?? [])
    .flatMap((block) => {
      if (block.kind === 'p') return [flat(block.text)];
      if (block.kind === 'list') return block.items.map(flat);
      return block.rows.flatMap((row) => [row.term, flat(row.value)]);
    })
    .join('\n');
}

/** Every flagged piece of a section, as its note. */
function notesOf(id: string): string[] {
  const section: Section | undefined = privacy.sections.find((candidate) => candidate.id === id);
  return (section?.blocks ?? []).flatMap((block) => [
    ...(block.review === undefined ? [] : [block.review.note]),
    ...(block.kind === 'facts'
      ? block.rows.flatMap((row) => (row.review === undefined ? [] : [row.review.note]))
      : []),
  ]);
}

describe('the school directory in the notice (M8a)', () => {
  it('states the shortest search and the most hits as the code enforces them', () => {
    expect(facts.directoryMinQuery).toBe(DIRECTORY_LIMITS.minQuery);
    expect(facts.directoryHits).toBe(DIRECTORY_LIMITS.hits);
    const text = sectionText('zdroje');
    expect(text).toContain(`nejméně ${DIRECTORY_LIMITS.minQuery}\u00A0znaky`);
    expect(text).toContain(`nejvýše ${DIRECTORY_LIMITS.hits}\u00A0osob`);
  });

  it('says the search runs only when it is switched on', () => {
    expect(sectionText('zdroje')).toContain('když je vyhledávání zapnuté');
  });
});

describe('points and the people memory in the notice (M8a)', () => {
  it('says the memory is the author’s own points and has no list of its own', () => {
    expect(sectionText('udaje')).toContain(
      'Dříve použité osoby vám Autoporada nabízí jen z\u00A0vašich vlastních bodů.',
    );
    expect(retentionRow(/^Dříve použité osoby$/)?.value).toMatch(/^nemají vlastní úložiště;/);
  });

  it('names who reads a point, a return and a rewrite after a return, for the DPO', () => {
    const text = sectionText('prijemci');
    expect(text).toContain('Rozepsaný koncept vidí jen autor.');
    expect(text).toContain('Když autor odeslání stáhne, je to zase jen jeho koncept.');
    expect(text).toContain('Vrácený bod vidí kontroloři a\u00A0ředitel dál');
    expect(text, 'akce reach the notice with M8b').not.toMatch(/akc[eí]/i);
    expect(notesOf('prijemci')).toContain(
      'Ověřit, že kontroloři a\u00A0ředitel smějí číst vrácený bod, který autor dál upravuje.',
    );
  });

  it('keeps the previous wording of an edited field as long as the point, for the DPO', () => {
    expect(sectionText('udaje')).toContain('Postup bodu');
    expect(sectionText('udaje')).toContain('původní znění upravených polí');
    expect(notesOf('udaje')).toContain(
      'Ověřit, že původní znění upravených polí smí zůstat u\u00A0bodu.',
    );
    expect(retentionRow(/^Poznámky kontroly a\u00A0původní znění upravených polí$/)?.value).toBe(
      'jako samotný bod, smažou se s\u00A0ním',
    );
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
    'remindDeadline',
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
  it('claims notification settings only once a column holds them', () => {
    const udaje = privacy.sections.find((section) => section.id === 'udaje');
    const rows = udaje?.blocks.flatMap((block) => (block.kind === 'facts' ? block.rows : [])) ?? [];
    const usersRow = JSON.stringify(rows.find((row) => /přihlásí/.test(row.term))?.value ?? '');
    const hasColumn = Object.keys(getTableColumns(users)).some((c) => /notif/i.test(c));
    expect(hasColumn || !/upozorn/.test(usersRow)).toBe(true);
  });

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
