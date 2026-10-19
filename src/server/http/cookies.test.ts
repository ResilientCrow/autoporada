import { describe, expect, it } from 'vitest';

import { withoutRepeatedCookies } from './cookies';

describe('withoutRepeatedCookies', () => {
  it('keeps a header without repeats as it is', () => {
    expect(withoutRepeatedCookies('a=1; __Host-ap_session=tok')).toBe('a=1; __Host-ap_session=tok');
  });

  it('drops every copy of a cookie sent twice, and nothing else', () => {
    expect(withoutRepeatedCookies('__Host-ap_session=A; a=1; __Host-ap_session=B')).toBe('a=1');
    expect(withoutRepeatedCookies('s=A;s=B')).toBeNull();
  });

  it('keeps values that contain = and ignores empty parts', () => {
    expect(withoutRepeatedCookies(' ; x=a=b ;;')).toBe('x=a=b');
  });
});
