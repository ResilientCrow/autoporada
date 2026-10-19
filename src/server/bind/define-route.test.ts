import { describe, expect, it } from 'vitest';

import type { RouteSpec } from '../pipeline';
import { defineRoute } from './define-route';

const route = (over: Partial<RouteSpec>): RouteSpec => ({
  name: 'test.route',
  access: 'session',
  rateLimit: 'none',
  handle: async () => new Response(null),
  ...over,
});

describe('defineRoute', () => {
  it('refuses a public route limited per user, which would not limit anonymous callers', () => {
    expect(() => defineRoute(route({ access: 'public', rateLimit: 'directory' }))).toThrow(
      /client address/,
    );
    expect(() => defineRoute(route({ access: 'public', rateLimit: 'auth' }))).not.toThrow();
    expect(() => defineRoute(route({ access: 'session', rateLimit: 'directory' }))).not.toThrow();
  });
});
