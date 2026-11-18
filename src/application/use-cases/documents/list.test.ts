import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { composeDocument } from '@/document';
import { calDate, toIsoDate } from '@/domain/time';

import { documentFixtures } from '../../../../test/support/documents';
import { issueFixtures } from '../../../../test/support/issues';
import { snapshotFixture } from '../../../../test/support/snapshots';
import { setupWorld } from '../../../../test/support/world';
import { generateIssue } from '../issues';
import { listDocuments } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const { stored } = documentFixtures(world);
const seeder = system('test.seed');

// The clock starts Monday 19 October 2026 10.00 Prague.
const W1 = calDate(2026, 10, 19);
const W2 = calDate(2026, 10, 26);
const W3 = calDate(2026, 11, 2);

const list = (by: UserRecord) => world.run(listDocuments, world.as(by), {});
const headmaster = () => world.seed.user({ role: 'headmaster' });

/** The texts of the last three points of the template replica, in document order. */
const LAST_THREE = ['Seminář Matika Česku', 'Vesmírný seminář', 'Další doposud známé akce školy'];

describe('documents.list', () => {
  it('lists nothing for an empty archive', async () => {
    expect(await list(await headmaster())).toEqual({ ok: true, value: { documents: [] } });
  });

  it('lists the generated poradas only, the latest meeting first, with their count and last three points', async () => {
    const head = await headmaster();
    await stored(W1);
    await stored(W3);
    await fixtures.issue(W2);
    const expected = composeDocument(snapshotFixture('template-replica'));
    const points = expected.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'point');
    expect(points.slice(-3).map((b) => b.text)).toEqual(LAST_THREE);

    const result = await list(head);
    expect(result).toEqual({
      ok: true,
      value: {
        documents: [
          { monday: toIsoDate(W3), points: 17, titles: LAST_THREE },
          { monday: toIsoDate(W1), points: 17, titles: LAST_THREE },
        ],
      },
    });
  });

  it('orders by meeting date, not by Monday', async () => {
    const head = await headmaster();
    // W1's porada was moved to after W2's.
    await stored(W1, { meetingDate: calDate(2026, 10, 29) });
    await stored(W2);

    const result = await list(head);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.documents.map((d) => d.monday)).toEqual([toIsoDate(W1), toIsoDate(W2)]);
  });

  it('reads each porada from its own snapshot', async () => {
    const head = await headmaster();
    const generation = await world.run(generateIssue, world.as(head), {
      monday: toIsoDate(W1),
      confirmed: true,
    });
    if (!generation.ok) throw new Error(JSON.stringify(generation.error));
    await stored(W3);
    const snapshot = await world.tx(
      seeder,
      (tx) => tx.documents.snapshot(generation.value.documentId),
      'read',
    );
    if (!snapshot) throw new Error('no snapshot');
    const points = composeDocument(snapshot)
      .sections.flatMap((s) => s.blocks)
      .filter((b) => b.kind === 'point');
    expect(points.length).toBeLessThan(17);

    const result = await list(head);
    expect(result).toEqual({
      ok: true,
      value: {
        documents: [
          { monday: toIsoDate(W3), points: 17, titles: LAST_THREE },
          {
            monday: toIsoDate(W1),
            points: points.length,
            titles: points.slice(-3).map((b) => b.text),
          },
        ],
      },
    });
  });

  it('skips a porada whose stored snapshot the schema refuses and lists the others', async () => {
    const head = await headmaster();
    await stored(W1);
    // A control character (BEL) in a table cell: the text rule refuses it, as it does an older stored snapshot.
    await stored(W3, {
      snapshot: {
        ...snapshotFixture('template-replica'),
        annexes: [{ title: '', parts: [{ kind: 'table', rows: [['a\u0007b']] }] }],
      },
    });

    const result = await list(head);

    expect(result).toEqual({
      ok: true,
      value: { documents: [{ monday: toIsoDate(W1), points: 17, titles: LAST_THREE }] },
    });
  });

  it('is open to staff with archive access and refuses a submitter', async () => {
    await stored(W1);
    const reviewer = await world.seed.user({ role: 'reviewer' });
    expect((await list(reviewer)).ok).toBe(true);
    const submitter = await world.seed.user({ role: 'submitter' });
    expect(await list(submitter)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('writes no audit record', async () => {
    await stored(W1);
    const head = await headmaster();
    const before = await world.inspect.audit();
    expect((await list(head)).ok).toBe(true);
    expect(await world.inspect.audit()).toEqual(before);
  });
});
