import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineUseCase, ok } from '@/application/core';
import { DatabaseFailure, type UserPrincipal } from '@/application/ports';

import { recordingLog } from '../../../test/support/log';
import { guardPage, runPage } from './run-page';
import { PageFailure } from './page-failure';

const runRegistered = vi.hoisted(() => vi.fn());
vi.mock('../pipeline', () => ({ runRegistered }));
const recorded = vi.hoisted(() => ({ log: undefined as unknown }));
vi.mock('../container', () => ({
  getContainer: () => ({ log: recorded.log, useCases: new Set() }),
}));

const echo = defineUseCase({
  name: 'test.echo',
  mode: 'read',
  input: z.strictObject({}),
  output: z.object({}),
  access: { kind: 'gate', check: () => ({ action: 'directory.search' }) },
  execute: async () => ok({}),
});
const call = { principal: { kind: 'user' } as UserPrincipal, requestId: 'req-1', input: {} };
const SECRET = 'Jana Nováková, 2.B';

async function failureOf(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('runPage', () => {
  let lines: ReturnType<typeof recordingLog>['lines'];
  beforeEach(() => {
    const recording = recordingLog();
    lines = recording.lines;
    recorded.log = recording.log;
    runRegistered.mockReset();
  });

  it('passes the result through, a refusal included', async () => {
    runRegistered.mockResolvedValue({ ok: true, value: 3 });
    expect(await runPage(echo, call)).toEqual({ ok: true, value: 3 });
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'forbidden' } });
    expect(await runPage(echo, call)).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(lines).toEqual([]);
  });

  it('turns a lost database into a page failure of that cause, logged with the request id', async () => {
    runRegistered.mockRejectedValue(new DatabaseFailure('08000'));
    const error = await failureOf(() => runPage(echo, call));
    expect(error).toBeInstanceOf(PageFailure);
    expect(error).toMatchObject({ digest: 'autoporada:database-down' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'error',
      fields: {
        kind: 'page',
        name: 'test.echo',
        reqId: 'req-1',
        cause: 'database-down',
        err: { name: 'DatabaseFailure', sqlstate: '08000' },
      },
    });
  });

  it('takes any other exception for a bug and keeps its text out of the page failure', async () => {
    runRegistered.mockRejectedValue(new Error(`boom ${SECRET}`));
    const error = await failureOf(() => runPage(echo, call));
    expect(error).toMatchObject({ digest: 'autoporada:bug', message: 'test.echo: bug' });
    expect(String((error as Error).stack)).not.toContain('Jana');
  });
});

describe('guardPage', () => {
  beforeEach(() => {
    recorded.log = recordingLog().log;
  });

  it('returns what the work returns', async () => {
    expect(await guardPage('auth.session', 'req-1', async () => 7)).toBe(7);
  });

  it('leaves a page failure as it is, so it is logged once', async () => {
    const lines = recordingLog();
    recorded.log = lines.log;
    const original = new PageFailure('timeout', 'x');
    const error = await failureOf(() =>
      guardPage('auth.session', 'req-1', () => Promise.reject(original)),
    );
    expect(error).toBe(original);
    expect(lines.lines).toEqual([]);
  });

  it('turns a failed session lookup into a page failure', async () => {
    const error = await failureOf(() =>
      guardPage('auth.session', 'req-1', () => Promise.reject(new DatabaseFailure('57014'))),
    );
    expect(error).toMatchObject({ digest: 'autoporada:timeout', message: 'auth.session: timeout' });
  });
});
