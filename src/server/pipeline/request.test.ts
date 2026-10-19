import { describe, expect, it } from 'vitest';

import { cookieValue } from './request';

describe('cookieValue', () => {
  it('reads one cookie, and treats a duplicate as none', () => {
    expect(cookieValue('a=1; __Host-ap_session=abc; b=2', '__Host-ap_session')).toBe('abc');
    expect(
      cookieValue('__Host-ap_session=abc; __Host-ap_session=evil', '__Host-ap_session'),
    ).toBeNull();
    expect(cookieValue('__Host-ap_session=', '__Host-ap_session')).toBeNull();
    expect(cookieValue(null, '__Host-ap_session')).toBeNull();
  });
});
