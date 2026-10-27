import { describe, expect, it, vi } from 'vitest';

import { chooseOnPress, keepOnPress } from './radio-press';

describe('chooseOnPress', () => {
  it('hands the choice on', () => {
    const onChange = vi.fn();
    chooseOnPress('radlice', false, onChange);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('radlice');
  });

  it('hands nothing on while the group is read-only', () => {
    const onChange = vi.fn();
    chooseOnPress('radlice', true, onChange);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('needs no listener', () => {
    expect(() => chooseOnPress('radlice', false, undefined)).not.toThrow();
  });
});

describe('keepOnPress', () => {
  it('takes the press back while the group is read-only (the native radio would change)', () => {
    const preventDefault = vi.fn();
    keepOnPress(true, { preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves the press alone otherwise', () => {
    const preventDefault = vi.fn();
    keepOnPress(false, { preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
