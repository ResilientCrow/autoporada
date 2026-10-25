import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineSystemUseCase, defineUseCase, ok } from '@/application/core';
import { me } from '@/application/use-cases';

import { recordingLog } from '../../../test/support/log';
import type * as pipeline from '../pipeline';
import { wrappedInfo } from './brand';
import { defineAction } from './define-action';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
const resolvePrincipal = vi.hoisted(() => vi.fn(async () => null));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ refresh }));
const runAction = vi.hoisted(() => vi.fn());
vi.mock('../pipeline', async (original) => ({
  ...(await original<typeof pipeline>()),
  runAction,
}));
vi.mock('../container', () => ({
  getContainer: () => ({
    resolvePrincipal,
    requestIdFrom: () => 'req-1',
    log: recordingLog().log,
  }),
}));

const write = defineUseCase({
  name: 'test.write',
  mode: 'write',
  input: z.strictObject({}),
  output: z.object({}),
  access: { kind: 'gate', check: () => ({ action: 'profile.manage' }) },
  execute: async () => ok({}),
});

describe('defineAction', () => {
  const action = defineAction(me, { rateLimit: 'none' });
  beforeEach(async () => {
    resolvePrincipal.mockClear();
    refresh.mockClear();
    const real = await vi.importActual<typeof pipeline>('../pipeline');
    runAction.mockReset().mockImplementation(real.runAction);
  });

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

  it('brands what it makes, and nothing else', () => {
    expect(wrappedInfo(action)).toEqual({
      kind: 'action',
      useCase: me,
      rateLimit: 'none',
      refresh: 'page',
    });
    expect(wrappedInfo(async () => ({ ok: true }))).toBeUndefined();
  });

  it('refuses system use cases', () => {
    const job = defineSystemUseCase({
      name: 'test.job',
      reasons: ['job:test'],
      mode: 'read',
      input: z.strictObject({}),
      output: z.object({}),
      execute: async () => ok({}),
    });
    expect(() => defineAction(job, { rateLimit: 'none' })).toThrow(/signed-in user/);
  });

  describe('re-renders the page after a write that succeeded, and only then', () => {
    const answer = defineAction(write, { rateLimit: 'none' });

    it('refreshes after a successful write', async () => {
      runAction.mockResolvedValue({ ok: true, data: {} });
      expect(await answer({})).toEqual({ ok: true, data: {} });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('does not refresh after a failed write, so the form keeps its problem', async () => {
      runAction.mockResolvedValue({ ok: false, error: { code: 'conflict' } });
      await answer({});
      expect(refresh).not.toHaveBeenCalled();
    });

    it('does not refresh after a successful write when the action says refresh: none', async () => {
      const autosave = defineAction(write, { rateLimit: 'none', refresh: 'none' });
      runAction.mockResolvedValue({ ok: true, data: {} });
      expect(await autosave({})).toEqual({ ok: true, data: {} });
      expect(refresh).not.toHaveBeenCalled();
    });

    it('does not refresh after a failed write that says refresh: none either', async () => {
      const autosave = defineAction(write, { rateLimit: 'none', refresh: 'none' });
      runAction.mockResolvedValue({ ok: false, error: { code: 'conflict' } });
      await autosave({});
      expect(refresh).not.toHaveBeenCalled();
    });

    it('reports the refresh it was given, and writes the default out', () => {
      const none = defineAction(write, { rateLimit: 'submission', refresh: 'none' });
      expect(wrappedInfo(none)).toMatchObject({ kind: 'action', refresh: 'none' });
      expect(wrappedInfo(answer)).toMatchObject({ kind: 'action', refresh: 'page' });
    });

    it('does not refresh after a read', async () => {
      runAction.mockResolvedValue({ ok: true, data: {} });
      await action({});
      expect(refresh).not.toHaveBeenCalled();
    });

    it('does not refresh when the call throws', async () => {
      runAction.mockRejectedValue(new Error('boom'));
      await expect(answer({})).rejects.toThrow('boom');
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
