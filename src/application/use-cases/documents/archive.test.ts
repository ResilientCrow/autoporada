import { describe, expect, it } from 'vitest';

import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { setupWorld } from '../../../../test/support/world';
import { generateIssue } from '../issues';
import { documentArchive } from './index';

const world = setupWorld();

// The clock starts Monday 19 October 2026 10.00 Prague: W1, this week's, is the first porada open.
const W1 = calDate(2026, 10, 19);
const W2 = calDate(2026, 10, 26);

const headmaster = () => world.seed.user({ role: 'headmaster' });

async function generate(monday: CalDate) {
  const head = await headmaster();
  const result = await world.run(generateIssue, world.as(head), {
    monday: toIsoDate(monday),
    confirmed: true,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
}

describe('documents.archive', () => {
  it('lists the generated poradas for the staff, the latest meeting first', async () => {
    await generate(W1);
    await generate(W2);
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const result = await world.run(documentArchive, world.as(reviewer), {});
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.documents).toEqual([
      expect.objectContaining({
        monday: toIsoDate(W2),
        meetingDate: toIsoDate(W2),
        pdfStatus: 'pending',
      }),
      expect.objectContaining({
        monday: toIsoDate(W1),
        meetingDate: toIsoDate(W1),
        pdfStatus: 'pending',
      }),
    ]);
  });

  it('is empty before the first generation and refuses a submitter', async () => {
    const head = await headmaster();
    expect(await world.run(documentArchive, world.as(head), {})).toEqual({
      ok: true,
      value: { documents: [] },
    });
    const submitter = await world.seed.user({ role: 'submitter' });
    expect(await world.run(documentArchive, world.as(submitter), {})).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });
});
