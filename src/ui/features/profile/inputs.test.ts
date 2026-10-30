import { describe, expect, it } from 'vitest';

import { remindersInput } from './inputs';

describe('remindersInput', () => {
  it('sends on when the box is ticked', () => {
    const data = new FormData();
    data.set('on', 'on');
    expect(remindersInput(data)).toEqual({ on: true });
  });

  it('sends off when the box is not ticked, since a clear box submits nothing', () => {
    expect(remindersInput(new FormData())).toEqual({ on: false });
  });
});
