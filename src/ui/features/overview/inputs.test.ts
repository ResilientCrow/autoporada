import { describe, expect, it } from 'vitest';

import { skipInput } from './inputs';

const ticked = () => {
  const data = new FormData();
  data.set('confirmed', 'on');
  return data;
};

describe('skipInput', () => {
  it('names the Monday and the event, and leaves out what it does not know', () => {
    const input = skipInput('2026-11-09', 'skip', null, new FormData());
    expect(input).toEqual({ monday: '2026-11-09', event: 'skip' });
    expect(input).not.toHaveProperty('expectedVersion');
    expect(input).not.toHaveProperty('confirmed');
  });

  it('sends the version of the row the page showed', () => {
    expect(skipInput('2026-11-16', 'unskip', 3, new FormData())).toEqual({
      monday: '2026-11-16',
      event: 'unskip',
      expectedVersion: 3,
    });
  });

  it('sends confirmed: true only when the box is ticked', () => {
    expect(skipInput('2026-11-09', 'skip', 1, ticked())).toEqual({
      monday: '2026-11-09',
      event: 'skip',
      expectedVersion: 1,
      confirmed: true,
    });
  });
});
