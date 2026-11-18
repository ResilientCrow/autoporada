import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { TxContext, UserPrincipal } from '@/application/ports';
import type { Role } from '@/domain/actor';
import { createArchStore } from '@/infra/db/arch';

import { setupTestDatabase } from '../../support/database';

/**
 * The arch store reads a superset of the state endpoint's live working set (ADR 0070): history
 * stays in the database. The exact rule is `src/server/routes/arch-live.ts`.
 */
const database = setupTestDatabase();
const store = () => createArchStore(database.db);

/** The last generated porada: Monday 12 October, held on Thursday 15 October. */
const L = { monday: '2026-10-12', meetingDate: '2026-10-15' };

const ids: Record<string, string> = {};
const principals: Record<string, UserPrincipal> = {};

async function user(name: string, role: Role): Promise<void> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name, role)
     VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2) RETURNING id`,
    [name, role],
  );
  ids[name] = row!.id;
  principals[name] = {
    kind: 'user',
    actor: { id: row!.id, role, status: 'active', isStudent: false },
    sessionId: 'test',
    authTime: new Date(),
  };
}

const ctxOf = (name: string): TxContext => ({
  principal: principals[name]!,
  now: new Date('2026-10-20T10:00:00Z'),
  requestId: 'test',
});

/** A point of `author` seeded past the use cases; a submitted one carries the hand-in Monday. */
async function point(
  title: string,
  author: string,
  state: string,
  handIn: string | null = null,
  akce: string | null = null,
): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO points (kind, author_id, client_ref, title, state, body, submitted_at, hand_in_monday,
                         earliest_monday, future_item_id)
     VALUES ($6, $1, $2, $3, $4::point_state, '{"type":"doc","content":[]}',
             CASE WHEN $5::date IS NULL THEN NULL ELSE now() END, $5::date, $5::date, $7)
     RETURNING id`,
    [
      ids[author],
      randomUUID(),
      title,
      state,
      handIn,
      akce ? 'report' : 'finance',
      akce && ids[akce],
    ],
  );
  ids[title] = row!.id;
  return row!.id;
}

/** A future item of `author`; a state past draft needs a title and a start date. */
async function future(
  title: string,
  author: string,
  state: string,
  startDate: string | null,
  extra: { endDate?: string; cancelRequested?: boolean } = {},
): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO future_items (kind, author_id, client_ref, title, state, start_date, end_date,
                               submitted_at, cancel_requested_at)
     VALUES ('akce', $1, $2, $3, $4::future_state, $5::date, $6::date,
             CASE WHEN $4::text = 'draft' THEN NULL ELSE now() END,
             CASE WHEN $7 THEN now() ELSE NULL END)
     RETURNING id`,
    [
      ids[author],
      randomUUID(),
      title,
      state,
      startDate,
      extra.endDate ?? null,
      extra.cancelRequested ?? false,
    ],
  );
  ids[title] = row!.id;
  return row!.id;
}

beforeAll(async () => {
  await user('reviewer', 'reviewer');
  await user('headmaster', 'headmaster');
  await user('author', 'submitter');
  await user('other', 'submitter');

  await future('akce-submitted', 'author', 'submitted', '2026-09-01');
  await future('akce-withdrawn', 'author', 'withdrawn', '2026-10-20');
  await future('akce-ended-before-L', 'author', 'approved', '2026-10-14');
  await future('akce-ended-on-L-day', 'author', 'approved', '2026-10-15');
  await future('akce-multi-day-reaching-L', 'author', 'approved', '2026-10-10', {
    endDate: '2026-10-16',
  });
  await future('akce-cancel-request', 'author', 'approved', '2026-09-01', {
    cancelRequested: true,
  });
  await future('akce-ended-yesterday', 'author', 'approved', '2026-10-12');
  await future('akce-ends-today', 'author', 'approved', '2026-10-13');
  await future('akce-own-old', 'reviewer', 'approved', '2026-09-01');

  await point('submitted', 'author', 'submitted', '2026-10-19');
  await point('withdrawn-after-submit', 'author', 'withdrawn', '2026-10-19');
  await point('approved-old', 'author', 'approved', '2026-10-05');
  await point('published-old', 'author', 'published', '2026-10-05');
  await point('published-of-L', 'author', 'published', '2026-10-12');
  await point('rejected-next', 'author', 'rejected', '2026-10-19');
  await point('published-next', 'author', 'published', '2026-10-19');
  await point('report-refused-live', 'author', 'rejected', '2026-10-19', 'akce-ended-on-L-day');
  await point('report-refused-gone', 'author', 'rejected', '2026-10-05', 'akce-ended-before-L');
  await point('reviewer-refused', 'reviewer', 'rejected', '2026-10-05');
  await point('reviewer-draft', 'reviewer', 'draft');
  await point('reviewer-published-old', 'reviewer', 'published', '2026-10-05');
  await point('reviewer-withdrawn', 'reviewer', 'withdrawn', '2026-10-19');
});

/** `liveSince` with today after the meeting: live from the meeting day. */
const AFTER_MEETING = L.meetingDate;
/** `liveSince` with today (Tuesday 13 October) between the generation and the meeting. */
const BEFORE_MEETING = '2026-10-13';

/** The ids of the akce the route finds live, as it passes them to the points read. */
const LIVE_AKCE = ['akce-ended-on-L-day', 'akce-cancel-request'];
const liveAkceIds = () => LIVE_AKCE.map((t) => ids[t]!);

const titles = (rows: readonly { id: string }[]) =>
  new Set(Object.keys(ids).filter((k) => rows.some((r) => r.id === ids[k])));

describe('the arch store with the last generated porada', () => {
  it.each(['reviewer', 'headmaster'])(
    'gives %s the points still in play and not the withdrawn or the published history',
    async (viewer) => {
      const rows = await store().points(ctxOf(viewer), L, liveAkceIds());
      const seen = titles(rows);

      expect(seen).toContain('submitted');
      expect(seen).toContain('approved-old');
      expect(seen).toContain('report-refused-live');
      expect(seen).not.toContain('rejected-next');
      expect(seen).not.toContain('published-next');
      expect(seen).not.toContain('report-refused-gone');
      expect(seen).not.toContain('withdrawn-after-submit');
      expect(seen).not.toContain('published-old');
      expect(seen).not.toContain('published-of-L');
    },
  );

  it('keeps the viewer’s own points, a draft and old published ones too', async () => {
    const seen = titles(await store().points(ctxOf('reviewer'), L, liveAkceIds()));

    expect(seen).toContain('reviewer-draft');
    expect(seen).toContain('reviewer-published-old');
    expect(seen).toContain('reviewer-refused');
    expect(seen).not.toContain('reviewer-withdrawn');
  });

  it('reads everything the scope admits when nothing is generated', async () => {
    const seen = titles(await store().points(ctxOf('headmaster'), null, []));

    expect(seen).toContain('published-old');
    expect(seen).toContain('published-of-L');
    expect(seen).toContain('withdrawn-after-submit');
  });

  it.each(['reviewer', 'headmaster'])(
    'gives %s the future items not yet over, or waiting, or asked to be cancelled',
    async (viewer) => {
      const seen = titles(await store().futures(ctxOf(viewer), AFTER_MEETING));

      expect(seen).toContain('akce-submitted');
      expect(seen).toContain('akce-ended-on-L-day');
      expect(seen).toContain('akce-multi-day-reaching-L');
      expect(seen).toContain('akce-cancel-request');
      expect(seen).not.toContain('akce-ended-before-L');
      expect(seen).not.toContain('akce-withdrawn');
    },
  );

  it('keeps the viewer’s own old akce', async () => {
    expect(titles(await store().futures(ctxOf('reviewer'), AFTER_MEETING))).toContain(
      'akce-own-old',
    );
  });

  it('reads the ended akce of the others for a submitter only up to the last meeting', async () => {
    const before = titles(await store().futures(ctxOf('other'), AFTER_MEETING));
    const without = titles(await store().futures(ctxOf('other'), null));

    expect(before).toContain('akce-ended-on-L-day');
    expect(before).not.toContain('akce-ended-before-L');
    expect(without).toContain('akce-ended-before-L');
  });

  it('reads the akce not over between the generation and the meeting, and not the ones over', async () => {
    const seen = titles(await store().futures(ctxOf('other'), BEFORE_MEETING));

    expect(seen).toContain('akce-ends-today');
    expect(seen).toContain('akce-ended-before-L');
    expect(seen).toContain('akce-ended-on-L-day');
    expect(seen).not.toContain('akce-ended-yesterday');
  });

  it('reads the akce that ended since the meeting but not the ones before it', async () => {
    const seen = titles(await store().futures(ctxOf('other'), AFTER_MEETING));

    expect(seen).toContain('akce-ended-on-L-day');
    expect(seen).not.toContain('akce-ended-yesterday');
    expect(seen).not.toContain('akce-ends-today');
  });

  it('reads the events of the ids it is given only', async () => {
    const rows = await store().points(ctxOf('headmaster'), L, []);
    const events = await store().pointEvents(rows.map((r) => r.id));

    expect(events.every((e) => rows.some((r) => r.id === e.pointId))).toBe(true);
  });
});

describe('the arch store reads of a generated porada and of annexes', () => {
  const SNAPSHOT_MARK = 'obsah-snapshotu';

  /** A generated porada with a stored document, as the owner. */
  async function generated(monday: string): Promise<string> {
    const [issue] = await database.owner<{ id: string }>(
      `INSERT INTO issues (monday, meeting_date, school_year, deadline_at, status)
       VALUES ($1::date, $1::date, '2026/2027', now(), 'generated') RETURNING id`,
      [monday],
    );
    await database.owner(
      `INSERT INTO generated_documents (issue_id, snapshot, docx, docx_sha256)
       VALUES ($1, $2::jsonb, '\\x00', repeat('0', 64))`,
      [issue!.id, JSON.stringify({ mark: SNAPSHOT_MARK })],
    );
    return issue!.id;
  }

  const annexesOf = (monday: string, text: string) =>
    database.owner(`INSERT INTO arch_annexes (monday, annexes) VALUES ($1::date, $2::jsonb)`, [
      monday,
      JSON.stringify([{ text }]),
    ]);

  it('gives the status of a document and never its snapshot', async () => {
    const issueId = await generated('2026-11-02');

    const rows = await store().documents();
    const row = rows.find((r) => r.issueId === issueId)!;

    expect(row).toMatchObject({ version: 1, pdfStatus: 'pending', pdfFailure: null });
    expect(row.generatedAt).toBeInstanceOf(Date);
    expect(Object.keys(row).sort()).toEqual([
      'generatedAt',
      'issueId',
      'pdfFailure',
      'pdfStatus',
      'version',
    ]);
    expect(JSON.stringify(rows)).not.toContain(SNAPSHOT_MARK);
  });

  it('reads the annexes of the Mondays it is given and no others', async () => {
    await annexesOf('2026-11-09', 'a');
    await annexesOf('2026-11-16', 'b');
    await annexesOf('2026-11-23', 'c');

    const rows = await store().annexes(['2026-11-16', '2026-11-30']);

    expect(rows.map((r) => r.monday)).toEqual(['2026-11-16']);
    expect(rows[0]!.annexes).toEqual([{ text: 'b' }]);
  });

  it('runs no query for no Mondays', async () => {
    expect(await store().annexes([])).toEqual([]);
  });
});
