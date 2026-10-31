import { describe, expect, it, vi } from 'vitest';

import { askBeforeUnload } from './use-dirty-guard';

describe('askBeforeUnload', () => {
  it('cancels the event and sets the empty returnValue older Safari needs', () => {
    const preventDefault = vi.fn();
    const event = {
      preventDefault,
      returnValue: undefined as unknown,
    } as unknown as BeforeUnloadEvent;
    askBeforeUnload(event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
  });
});
