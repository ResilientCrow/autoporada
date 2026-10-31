import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import type { PointState } from '@/domain/review';

import { issuePreview } from '../issues';
import { moveOutlineItem } from './index';

import { monday, outlineFixtures, WEEK_1 } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';

/**
 * A placed proposal that goes back to its author keeps its place (ADR 0036): every outline write
 * puts its row back, the editor does not list it, and the preview reports it until it is approved
 * again. A rejected or withdrawn one is forgotten by the next write.
 */
const world = setupWorld();
const fx = outlineFixtures(world);

const codes = async (head: UserRecord) => {
  const preview = await world.run(issuePreview, world.as(head), { monday: monday(WEEK_1) });
  if (!preview.ok) throw new Error(`preview refused: ${JSON.stringify(preview.error)}`);
  return preview.value.findings.map((f) => f.code);
};

const pokyny = async (head: UserRecord) => {
  const read = await fx.readAs(head, WEEK_1);
  if (!read.ok) throw new Error('read refused');
  return { rows: read.value.pokyny, version: read.value.version ?? undefined };
};

const stored = async (head: UserRecord) => {
  const issue = await fx.issueOf(WEEK_1);
  return world.tx(world.as(head), (tx) => tx.issueItems.forIssue(issue!.id), 'read');
};

/** The row after the proposal in the editor's list. */
const neighbour = (rows: readonly { readonly lineageId: string }[], id: string) =>
  rows[rows.findIndex((r) => r.lineageId === id) + 1]?.lineageId;

describe('a placed proposal that goes back to its author', () => {
  async function placed() {
    const head = await fx.headmaster();
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fx.start(author, 'pokyn');
    await fx.moveTo(author, id, 'approved', WEEK_1);
    const moved = await world.run(moveOutlineItem, world.as(head), {
      monday: monday(WEEK_1),
      lineageId: id,
      direction: 'up',
    });
    if (!moved.ok) throw new Error('move refused');
    const { rows } = await pokyny(head);
    return { head, author, id, version: moved.value.version, next: neighbour(rows, id) };
  }

  it('is reported by the preview while it is with its author', async () => {
    const { head, author, id } = await placed();
    expect(await codes(head)).not.toContain('proposal-dropped');
    await fx.moveTo(author, id, 'returned');
    expect(await codes(head)).toContain('proposal-dropped');
  });

  it('keeps its row through an outline write, hidden from the editor, and the warning stays', async () => {
    const { head, author, id, version } = await placed();
    await fx.moveTo(author, id, 'returned');

    // An unrelated edit: the headmaster adds a line.
    await fx.addItem(head, WEEK_1, 'Jiný pokyn', { expectedVersion: version });

    expect(await codes(head)).toContain('proposal-dropped');
    expect((await stored(head)).pokyny.some((r) => r.sourcePointId === id)).toBe(true);
    const { rows } = await pokyny(head);
    expect(rows.some((r) => r.lineageId === id)).toBe(false);
  });

  it('takes its old place back when it is handed in and approved again', async () => {
    const { head, author, id, version, next } = await placed();
    await fx.moveTo(author, id, 'returned');
    await fx.addItem(head, WEEK_1, 'Jiný pokyn', { expectedVersion: version });
    await fx.moveTo(author, id, 'submitted');
    await fx.addItem(head, WEEK_1, 'Další pokyn', { expectedVersion: version + 1 });
    await fx.moveTo(author, id, 'approved');

    const { rows } = await pokyny(head);
    expect(rows.find((r) => r.lineageId === id)).toMatchObject({
      proposal: { pointId: id, isNew: false },
    });
    expect(neighbour(rows, id)).toBe(next);
  });

  it.each<PointState>(['rejected', 'withdrawn'])(
    'is forgotten by the next outline write once %s, and the warning goes with it',
    async (state) => {
      const { head, author, id, version } = await placed();
      await fx.moveTo(author, id, state);
      expect(await codes(head)).toContain('proposal-dropped');

      await fx.addItem(head, WEEK_1, 'Jiný pokyn', { expectedVersion: version });

      expect(await codes(head)).not.toContain('proposal-dropped');
      expect((await stored(head)).pokyny.some((r) => r.sourcePointId === id)).toBe(false);
    },
  );
});
