import { describe, expect, it } from 'vitest';

import { blockInput } from './inputs';

describe('blockInput', () => {
  it('leaves confirmed out when the box is not ticked', () => {
    const input = blockInput('r1', 3, new FormData());
    expect(input).toEqual({ requestId: 'r1', version: 3, decision: 'block' });
    expect(input).not.toHaveProperty('confirmed');
  });

  it('sends confirmed: true when it is ticked', () => {
    const data = new FormData();
    data.set('confirmed', 'on');
    expect(blockInput('r1', 3, data)).toEqual({
      requestId: 'r1',
      version: 3,
      decision: 'block',
      confirmed: true,
    });
  });
});
