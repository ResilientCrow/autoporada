import { describe, expect, it } from 'vitest';

import { system, type Tx } from '@/application/ports';
import { calDate } from '@/domain/time';

import { issueFixtures } from '../../support/issues';
import { setupWorld } from '../../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);

/** A failing statement as the owner, with the constraint PostgreSQL names. */
async function ownerRefusal(sql: string, params: unknown[] = []) {
  try {
    await world.pg?.owner(sql, params);
  } catch (error) {
    return error as { code?: string; constraint?: string; message: string };
  }
  throw new Error('expected the statement to fail');
}

const owner = <R extends object>(sql: string, params: unknown[] = []) =>
  world.pg?.owner(sql, params) as Promise<R[]>;

const MONDAY = calDate(2026, 11, 2);

describe('issue_items and issues_texts, in PostgreSQL (migration 0033)', () => {
  describe('issues_texts', () => {
    const setText = (column: string, value: string) =>
      ownerRefusal(`UPDATE issues SET ${column} = $1, version = version + 1 WHERE monday = $2`, [
        value,
        '2026-11-02',
      ]);

    it('takes 2000 characters of Přítomni and Hosté, counted as characters, and refuses the 2001st', async () => {
      await fixtures.issue(MONDAY);
      for (const column of ['present_text', 'guests_text']) {
        await owner(`UPDATE issues SET ${column} = $1, version = version + 1`, ['ž'.repeat(2000)]);
        expect(await setText(column, 'ž'.repeat(2001))).toMatchObject({
          code: '23514',
          constraint: 'issues_texts',
        });
      }
    });

    it('takes an annex2 of 65536 bytes and refuses 65537', async () => {
      await fixtures.issue(MONDAY);
      // jsonb's text form is `"x…x"`: two quote characters around the payload.
      const annex = (n: number) => JSON.stringify('x'.repeat(n));
      await owner(`UPDATE issues SET annex2 = $1::jsonb, version = version + 1`, [annex(65534)]);
      expect(
        await ownerRefusal(`UPDATE issues SET annex2 = $1::jsonb, version = version + 1`, [
          annex(65535),
        ]),
      ).toMatchObject({ code: '23514', constraint: 'issues_texts' });
    });

    it('leaves a row with no texts valid', async () => {
      await fixtures.issue(MONDAY);
      expect(await owner(`SELECT present_text, guests_text, annex2 FROM issues`)).toEqual([
        { present_text: null, guests_text: null, annex2: null },
      ]);
    });
  });

  describe('issue_items', () => {
    it('refuses a position outside 0-59 by issue_items_position', async () => {
      const issue = await fixtures.issue(MONDAY);
      for (const position of [60, -1]) {
        expect(
          await ownerRefusal(
            `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
             VALUES ($1, 'pokyny', $2, gen_random_uuid(), 'standing', 'T', '{}')`,
            [issue.id, position],
          ),
        ).toMatchObject({ code: '23514', constraint: 'issue_items_position' });
      }
    });

    it('refuses two rows at one position by its unique key, and a NULL slot is not unique', async () => {
      const issue = await fixtures.issue(MONDAY);
      await owner(
        `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
         VALUES ($1, 'pokyny', 0, gen_random_uuid(), 'standing', 'T', '{}')`,
        [issue.id],
      );
      expect(
        await ownerRefusal(
          `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
         VALUES ($1, 'pokyny', 0, gen_random_uuid(), 'standing', 'U', '{}')`,
          [issue.id],
        ),
      ).toMatchObject({ code: '23505', constraint: 'issue_items_position_key' });
      await owner(
        `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
         VALUES ($1, 'pokyny', 1, gen_random_uuid(), 'standing', 'U', '{}'),
                ($1, 'pokyny', 2, gen_random_uuid(), 'standing', 'V', '{}')`,
        [issue.id],
      );
    });

    it('lets the same position stand in the other section', async () => {
      const issue = await fixtures.issue(MONDAY);
      await owner(
        `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
         VALUES ($1, 'pokyny', 0, gen_random_uuid(), 'standing', 'A', '{}'),
                ($1, 'hospodareni', 0, gen_random_uuid(), 'standing', 'B', '{}')`,
        [issue.id],
      );
    });

    it('refuses a NULL slot with quotes by issue_items_quotes: the coalesce keeps NULL OR false out', async () => {
      const issue = await fixtures.issue(MONDAY);
      expect(
        await ownerRefusal(
          `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body, quotes)
           VALUES ($1, 'pokyny', 0, gen_random_uuid(), 'standing', 'T', '{}', '[{"quote":"x"}]')`,
          [issue.id],
        ),
      ).toMatchObject({ code: '23514', constraint: 'issue_items_quotes' });
    });

    it('measures a title in characters: 300 pass, 301 and the empty title do not', async () => {
      const issue = await fixtures.issue(MONDAY);
      const sql = `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
           VALUES ($1, 'pokyny', $3, gen_random_uuid(), 'standing', $2, '{}')`;
      await owner(sql, [issue.id, 'č'.repeat(300), 0]);
      for (const title of ['č'.repeat(301), '']) {
        expect(await ownerRefusal(sql, [issue.id, title, 1])).toMatchObject({
          code: '23514',
          constraint: 'issue_items_title',
        });
      }
    });

    it('refuses an issue that still has rows to be deleted (restrict), and the rows go with their point (cascade)', async () => {
      const issue = await fixtures.issue(MONDAY);
      const author = await world.seed.user({ role: 'submitter' });
      const pointId = await fixtures.point({ author });
      await owner(
        `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, source_point_id)
         VALUES ($1, 'pokyny', 0, $2, 'once', $2)`,
        [issue.id, pointId],
      );
      expect(await ownerRefusal(`DELETE FROM issues WHERE id = $1`, [issue.id])).toMatchObject({
        code: '23001',
        constraint: 'issue_items_issue_id_issues_id_fk',
      });
      await owner(`DELETE FROM points WHERE id = $1`, [pointId]);
      expect(await owner(`SELECT id FROM issue_items`)).toEqual([]);
    });

    it('refuses a placement of a point that does not exist by its foreign key', async () => {
      const issue = await fixtures.issue(MONDAY);
      const ghost = '0192f000-0000-7000-8000-00000000dead';
      expect(
        await ownerRefusal(
          `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, source_point_id)
           VALUES ($1, 'pokyny', 0, $2, 'once', $2)`,
          [issue.id, ghost],
        ),
      ).toMatchObject({ code: '23503', constraint: 'issue_items_source_point_id_points_id_fk' });
    });

    it('gives the worker no access to the table', async () => {
      const issue = await fixtures.issue(MONDAY);
      const read = (tx: Tx) => tx.issueItems.forIssue(issue.id);
      await expect(world.tx(system('job:test'), read, 'read')).resolves.toBeDefined();
      await expect(
        world.workerDb.transaction(
          { principal: system('job:test'), now: world.clock.now(), requestId: 'test' },
          { mode: 'read' },
          read,
        ),
      ).rejects.toBeDefined();
    });
  });
});
