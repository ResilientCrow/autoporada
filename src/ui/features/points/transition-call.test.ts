import { describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/contracts';
import { NETWORK_FAILED, type FormState, type Problem, type SaveAnswer } from '@/ui/form';

import {
  retractInput,
  sentAfterFlush,
  throughFlush,
  withdrawInput,
  quietedBy,
  type Around,
} from './transition-call';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const OK: ActionResult<{ version: number }> = { ok: true, data: { version: 9 } };

/** The runner's primitive as it behaves: the call gets the version the save landed on; a throw is a failed answer. */
const landedAt =
  (version: number): Around =>
  async (send) => {
    try {
      return await send(version);
    } catch {
      return NETWORK_FAILED;
    }
  };
const held: Around = async () => null;

describe('what „Stáhnout“ and „Zrušit bod“ send', () => {
  it('retract names the point and the version the page showed', () => {
    expect(retractInput(ID, 4)).toEqual({ id: ID, expectedVersion: 4 });
  });

  it('withdraw carries the box as it stands', () => {
    const ticked = new FormData();
    ticked.set('confirmed', 'on');
    expect(withdrawInput(ID, 4, ticked)).toEqual({ id: ID, expectedVersion: 4, confirmed: true });
    expect(withdrawInput(ID, 4, new FormData())).toEqual({
      id: ID,
      expectedVersion: 4,
      confirmed: false,
    });
  });
});

describe('a move that waits for the autosave to land', () => {
  it('sends the version the save landed on, and hands back the server’s answer', async () => {
    const call = vi.fn(async (_version: number) => OK);
    expect(await sentAfterFlush(landedAt(7), call)).toBe(OK);
    expect(call).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('hands back a refusal as it came, so its field issue reaches the checkbox', async () => {
    const refused: ActionResult<{ version: number }> = {
      ok: false,
      error: { code: 'invalid-input', fields: { confirmed: 'required' } },
    };
    expect(await sentAfterFlush(landedAt(7), async () => refused)).toBe(refused);
  });

  it('tells the runner how it went, so a conflict becomes the banner', async () => {
    let told: SaveAnswer | null = null;
    const around: Around = async (send) => {
      told = await send(2);
      return told;
    };
    await sentAfterFlush(around, async () => ({ ok: false, error: { code: 'conflict' } }));
    expect(told).toEqual({ kind: 'conflict' });
    await sentAfterFlush(around, async () => OK);
    expect(told).toEqual({ kind: 'ok', version: 9 });
  });

  it('sends nothing while a banner holds the editor, and says it was busy', async () => {
    const call = vi.fn(async () => OK);
    expect(await sentAfterFlush(held, call)).toEqual({ ok: false, error: { code: 'busy' } });
    expect(call).not.toHaveBeenCalled();
  });

  it('lets a call that throws reach the form as a network problem', async () => {
    await expect(
      sentAfterFlush(landedAt(7), async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('transition.network');
  });
});

describe('an action through the flush', () => {
  const action = vi.fn(async (_input: { id: string; expectedVersion: number }) => OK);

  it('is the action itself on a read view', () => {
    expect(throughFlush(action, undefined)).toBe(action);
  });

  it('replaces the version the form carried by the one the save landed on', async () => {
    action.mockClear();
    const result = await throughFlush(action, landedAt(7))({ id: ID, expectedVersion: 4 });
    expect(result).toBe(OK);
    expect(action).toHaveBeenCalledExactlyOnceWith({ id: ID, expectedVersion: 7 });
  });
});

describe('what the form shows of an answer the editor’s banners own', () => {
  const state = (problem: Problem | null, issues: FormState['issues'] = null): FormState => ({
    issues,
    problem,
    attempt: 2,
    submitting: null,
    onSubmit: () => undefined,
  });
  const inEditor: Around = landedAt(7);

  it.each([
    { code: 'conflict' },
    { code: 'not-found' },
    { code: 'unauthenticated' },
    { code: 'rule', rule: 'point-not-editable' },
  ] as const)('shows nothing of %j in the editor: the banner says it, once', (problem) => {
    expect(quietedBy(inEditor, state(problem)).problem).toBeNull();
  });

  it('keeps the other problems on the form', () => {
    for (const problem of [
      { code: 'busy' },
      { code: 'network' },
      { code: 'rate-limited', retryAfterSeconds: 5 },
      { code: 'forbidden' },
    ] as const) {
      expect(quietedBy(inEditor, state(problem)).problem).toEqual(problem);
    }
  });

  it('keeps a field issue, which no banner owns', () => {
    const issues = { confirmed: 'required' } as const;
    expect(quietedBy(inEditor, state(null, issues)).issues).toEqual(issues);
  });

  it('shows every problem on a read view, where no banner exists', () => {
    const shown = state({ code: 'conflict' });
    expect(quietedBy(undefined, shown)).toBe(shown);
  });

  it('a conflict reaches the runner and leaves the form with no problem', async () => {
    let told: SaveAnswer | null = null;
    const around: Around = async (send) => {
      told = await send(2);
      return told;
    };
    const answer = await sentAfterFlush(around, async () => ({
      ok: false,
      error: { code: 'conflict' },
    }));
    expect(told).toEqual({ kind: 'conflict' });
    expect(answer).toEqual({ ok: false, error: { code: 'conflict' } });
    expect(quietedBy(around, state({ code: 'conflict' })).problem).toBeNull();
  });
});
