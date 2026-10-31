import { describe, expect, it } from 'vitest';

import { issuePreview } from '../issues';
import { moveOutlineItem } from './index';

import { monday, outlineFixtures, WEEK_1 } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';

/**
 * TODO(m9-verify) in issues/outline-store.ts: every outline op works on the outline merged with the
 * eligible proposals, so a write forgets the placement of a proposal that went back to its author
 * before the preview's `proposal-dropped` warning is seen. This pins what happens today.
 */
const world = setupWorld();
const fx = outlineFixtures(world);

const codes = async (head: Awaited<ReturnType<typeof fx.headmaster>>) => {
  const preview = await world.run(issuePreview, world.as(head), { monday: monday(WEEK_1) });
  if (!preview.ok) throw new Error(`preview refused: ${JSON.stringify(preview.error)}`);
  return preview.value.findings.map((f) => f.code);
};

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
    return { head, author, id, version: moved.value.version };
  }

  it('is reported by the preview as long as nobody has written to the outline', async () => {
    const { head, author, id } = await placed();
    expect(await codes(head)).not.toContain('proposal-dropped');
    await fx.moveTo(author, id, 'returned');
    expect(await codes(head)).toContain('proposal-dropped');
  });

  it('is forgotten by the next outline write, and the warning goes with it', async () => {
    const { head, author, id, version } = await placed();
    await fx.moveTo(author, id, 'returned');
    expect(await codes(head)).toContain('proposal-dropped');

    // An unrelated edit: the headmaster adds a line.
    await fx.addItem(head, WEEK_1, 'Jiný pokyn', { expectedVersion: version });

    expect(await codes(head)).not.toContain('proposal-dropped');
    const issue = await fx.issueOf(WEEK_1);
    const stored = await world.tx(
      world.as(head),
      (tx) => tx.issueItems.forIssue(issue!.id),
      'read',
    );
    expect(stored.pokyny.some((r) => r.sourcePointId === id)).toBe(false);
  });

  it('comes back unplaced, at the end, when the author’s point is approved again', async () => {
    const { head, author, id, version } = await placed();
    await fx.moveTo(author, id, 'returned');
    await fx.addItem(head, WEEK_1, 'Jiný pokyn', { expectedVersion: version });
    await fx.moveTo(author, id, 'approved');
    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    expect(read.value.pokyny.at(-1)).toMatchObject({ proposal: { pointId: id, isNew: true } });
  });
});
