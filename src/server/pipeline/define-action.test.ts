import { beforeEach, describe, expect, it, vi } from 'vitest';

import { me } from '@/application/use-cases';

import { recordingLog } from '../../../test/support/log';
import { defineAction } from './define-action';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
const resolvePrincipal = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../container', () => ({
  getContainer: () => ({
    resolvePrincipal,
    requestIdFrom: () => 'req-1',
    log: recordingLog().log,
  }),
}));

describe('defineAction', () => {
  const action = defineAction(me, { rateLimit: 'none' });
  beforeEach(() => resolvePrincipal.mockClear());

  it('runs as the user of the one session cookie', async () => {
    request.headers = new Headers({ cookie: '__Host-ap_session=tok' });
    await action({});
    expect(resolvePrincipal).toHaveBeenCalledWith('tok', 'req-1');
  });

  it('treats a cookie sent twice as none, though Next’s cookies() keeps the last', async () => {
    request.headers = new Headers({ cookie: '__Host-ap_session=one; __Host-ap_session=two' });
    expect(await action({})).toEqual({ ok: false, error: { code: 'unauthenticated' } });
    expect(resolvePrincipal).toHaveBeenCalledWith(null, 'req-1');
  });
});
