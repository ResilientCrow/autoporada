import { describe, expect, it } from 'vitest';

import { focusOrder } from './focus-order';

describe('focusOrder', () => {
  it('tries the sent section, then the sections after it, then the title', () => {
    expect(focusOrder('request')).toEqual(['request', 'role', 'account', 'title']);
    expect(focusOrder('role')).toEqual(['role', 'account', 'title']);
    expect(focusOrder('account')).toEqual(['account', 'title']);
  });
});
