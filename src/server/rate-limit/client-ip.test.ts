import { describe, expect, it } from 'vitest';

import { clientIp, UNKNOWN_CLIENT } from './index';

describe('clientIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['198.51.100.1, 203.0.113.7', '203.0.113.7'],
    ['2001:db8:85a3:8d3:1319:8a2e:370:7348', '2001:db8:85a3:8d3::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:DB8:0000:0001::42', '2001:db8:0:1::/64'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::1', '0:0:0:0::/64'],
  ])('reads %j as %j', (header, key) => {
    expect(clientIp(header)).toBe(key);
  });

  it('groups a whole /64 into one key', () => {
    expect(clientIp('2001:db8:1:2::a')).toBe(clientIp('2001:db8:1:2:ffff::1'));
  });

  it.each([null, '', 'garbage', '203.0.113.7:443', '1.2.3.4, not-an-ip'])(
    'falls back to the shared key for %j',
    (header) => {
      expect(clientIp(header)).toBe(UNKNOWN_CLIENT);
    },
  );
});
