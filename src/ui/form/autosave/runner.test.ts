import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wallTime } from '@/domain/time';

import { DEBOUNCE_MS, type SaveAnswer, type StatusAnswer } from './machine';
import { createRunner, type Runner } from './runner';

type Request = { content: string; expectedVersion: number };

/** Saves that wait until the test answers them, in order. */
function harness(version = 3) {
  const calls: Request[] = [];
  const waiting: ((a: SaveAnswer) => void)[] = [];
  const statusWaiting: ((a: StatusAnswer) => void)[] = [];
  const refreshed: string[] = [];
  const submits: Request[] = [];
  let submitAnswer: SaveAnswer = { kind: 'ok', version: 99 };
  const runner: Runner<string> = createRunner<string>(
    {
      save: (request) => {
        calls.push(request);
        return new Promise((resolve) => waiting.push(resolve));
      },
      status: () => new Promise((resolve) => statusWaiting.push(resolve)),
      refresh: () => refreshed.push('refresh'),
      now: () => wallTime(14, 32),
      onState: () => undefined,
    },
    version,
  );
  runner.start();
  const answer = async (a: SaveAnswer) => {
    waiting.shift()?.(a);
    await vi.advanceTimersByTimeAsync(0);
  };
  const answerSubmit = (a: SaveAnswer) => {
    submitAnswer = a;
  };
  /** What the page does: closes over its content and sends it with the version the flush brought. */
  const afterLanded = (content: string) =>
    runner.afterLanded((expectedVersion) => {
      submits.push({ content, expectedVersion });
      return Promise.resolve(submitAnswer);
    });
  return { runner, calls, answer, statusWaiting, refreshed, submits, answerSubmit, afterLanded };
}

const change = (runner: Runner<string>, content: string) =>
  runner.dispatch({ type: 'change', content });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('timers', () => {
  it('saves 1500 ms after the last change, and not before', async () => {
    const { runner, calls } = harness();
    change(runner, 'a');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    change(runner, 'ab');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([{ content: 'ab', expectedVersion: 3 }]);
    expect(runner.state().phase).toBe('saving');
  });

  it('a blur saves at once and the dropped timer does not save again', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    expect(calls).toHaveLength(1);
    await answer({ kind: 'ok', version: 4 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(calls).toHaveLength(1);
    expect(runner.state()).toMatchObject({ phase: 'saved', version: 4 });
  });

  it('retries after 5 s, 15 s and 60 s, then stops at failed', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    await answer({ kind: 'failed' });
    for (const [wait, count] of [
      [5_000, 2],
      [15_000, 3],
      [60_000, 4],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(calls).toHaveLength(count - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(count);
      await answer({ kind: 'failed' });
    }
    expect(runner.state().phase).toBe('failed');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls).toHaveLength(4);
  });

  it('a save that throws is a failure', async () => {
    const calls: number[] = [];
    const runner = createRunner<string>(
      {
        save: () => {
          calls.push(1);
          return Promise.reject(new Error('network'));
        },
        status: () => Promise.reject(new Error('network')),
        refresh: () => undefined,
        now: () => wallTime(9, 5),
        onState: () => undefined,
      },
      1,
    );
    runner.start();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.state()).toMatchObject({ phase: 'dirty', attempt: 1 });
  });
});

describe('the conflict path', () => {
  it('asks the status and shows the banner state', async () => {
    const { runner, answer, statusWaiting, calls } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    await answer({ kind: 'conflict' });
    expect(statusWaiting).toHaveLength(1);
    statusWaiting[0]?.({ kind: 'ok', version: 9, editable: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.state()).toMatchObject({ phase: 'conflict', serverVersion: 9 });
    runner.dispatch({ type: 'keepMine' });
    expect(calls[1]).toEqual({ content: 'a', expectedVersion: 9 });
  });

  it('"Načíst aktuální stav" refreshes', () => {
    const { runner, refreshed } = harness();
    runner.dispatch({ type: 'reload' });
    expect(refreshed).toEqual(['refresh']);
  });

  it('a refresh during a save in flight waits for its answer', async () => {
    const { runner, calls, answer, refreshed } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    runner.dispatch({ type: 'reload' });
    expect(calls).toHaveLength(1);
    expect(refreshed).toEqual([]);
    await answer({ kind: 'ok', version: 4 });
    expect(refreshed).toEqual(['refresh']);
  });

  it('a refresh waits for the flush of what was typed last', async () => {
    const { runner, calls, answer, refreshed } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'reload' });
    expect(refreshed).toEqual([]);
    expect(calls).toEqual([{ content: 'a', expectedVersion: 3 }]);
    await answer({ kind: 'ok', version: 4 });
    expect(refreshed).toEqual(['refresh']);
  });
});

describe('sending after what is typed has landed', () => {
  it('sends the content at once when nothing is unsent', async () => {
    const { afterLanded, submits } = harness();
    const answer = await afterLanded('a');
    expect(submits).toEqual([{ content: 'a', expectedVersion: 3 }]);
    expect(answer).toEqual({ kind: 'ok', version: 99 });
  });

  it('waits for the flush of what was typed last and uses the version it brought', async () => {
    const { runner, afterLanded, calls, answer, submits } = harness();
    change(runner, 'a');
    const done = afterLanded('ab');
    expect(calls).toEqual([{ content: 'a', expectedVersion: 3 }]);
    expect(submits).toEqual([]);
    await answer({ kind: 'ok', version: 4 });
    await done;
    expect(submits).toEqual([{ content: 'ab', expectedVersion: 4 }]);
  });

  it('waits for a save in flight', async () => {
    const { runner, afterLanded, answer, submits } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    const done = afterLanded('a');
    expect(submits).toEqual([]);
    await answer({ kind: 'ok', version: 4 });
    await done;
    expect(submits).toEqual([{ content: 'a', expectedVersion: 4 }]);
  });

  it('is refused while a banner holds the editor read-only', async () => {
    const { runner, afterLanded, answer, statusWaiting, submits } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    await answer({ kind: 'conflict' });
    statusWaiting.shift()?.({ kind: 'ok', version: 9, editable: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.state().phase).toBe('conflict');
    expect(await afterLanded('a')).toBeNull();
    expect(submits).toEqual([]);
  });

  it('a conflict on the submit asks the status and ends in the conflict banner', async () => {
    const { afterLanded, runner, statusWaiting, answerSubmit } = harness();
    answerSubmit({ kind: 'conflict' });
    expect(await afterLanded('a')).toEqual({ kind: 'conflict' });
    expect(statusWaiting).toHaveLength(1);
    statusWaiting.shift()?.({ kind: 'ok', version: 9, editable: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.state()).toMatchObject({ phase: 'conflict', serverVersion: 9 });
  });

  it('after a stop it sends nothing', async () => {
    const { runner, afterLanded, submits } = harness();
    runner.stop();
    expect(await afterLanded('a')).toBeNull();
    expect(submits).toEqual([]);
  });

  it('answers failed when the send throws or rejects, and tells the machine', async () => {
    const { runner } = harness();
    expect(
      await runner.afterLanded(() => {
        throw new Error('boom');
      }),
    ).toEqual({ kind: 'failed' });
    expect(await runner.afterLanded(() => Promise.reject(new Error('boom')))).toEqual({
      kind: 'failed',
    });
    expect(runner.state().phase).toBe('idle');
  });

  it('hands the send the version it landed on and the answer back, for any call', async () => {
    const { runner, answer } = harness();
    change(runner, 'a');
    let seen = -1;
    const done = runner.afterLanded((version) => {
      seen = version;
      return Promise.resolve({ kind: 'ok', version: version + 1 });
    });
    await answer({ kind: 'ok', version: 7 });
    expect(await done).toEqual({ kind: 'ok', version: 8 });
    expect(seen).toBe(7);
  });
});

describe('leaving', () => {
  it('flushes the unsent content, drops its answer, and a stopped runner does nothing more', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'leave' });
    runner.stop();
    expect(calls).toEqual([{ content: 'a', expectedVersion: 3 }]);
    await answer({ kind: 'conflict' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 10);
    expect(calls).toHaveLength(1);
  });

  it('with a save in flight, the flush waits for it and uses the version it brought', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    change(runner, 'ab');
    runner.dispatch({ type: 'leave' });
    runner.stop();
    expect(calls).toHaveLength(1);
    await answer({ kind: 'ok', version: 4 });
    expect(calls).toEqual([
      { content: 'a', expectedVersion: 3 },
      { content: 'ab', expectedVersion: 4 },
    ]);
  });

  it('with a save in flight that fails, the flush goes out with the version we hold', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    change(runner, 'ab');
    runner.dispatch({ type: 'leave' });
    await answer({ kind: 'failed' });
    expect(calls[1]).toEqual({ content: 'ab', expectedVersion: 3 });
  });

  it('drops the pause: a page that lives on after pagehide sends nothing more', async () => {
    const { runner, calls } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'leave' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(calls).toEqual([{ content: 'a', expectedVersion: 3 }]);
  });

  it('drops the retry wait too', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    await answer({ kind: 'failed' });
    runner.dispatch({ type: 'leave' });
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(2);
  });

  it('the answer to a flush reaches the machine while the runner runs', async () => {
    const { runner, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'leave' });
    await answer({ kind: 'ok', version: 4 });
    expect(runner.state()).toMatchObject({ phase: 'saved', version: 4, unsent: false });
  });

  it('a flush answered with a failure arms the pause, which saves against the same version', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'leave' });
    await answer({ kind: 'conflict' });
    expect(runner.state()).toMatchObject({ phase: 'dirty', unsent: true });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(calls).toEqual([
      { content: 'a', expectedVersion: 3 },
      { content: 'a', expectedVersion: 3 },
    ]);
  });

  it('the answer to a flush after stop is dropped', async () => {
    const { runner, calls, answer } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'leave' });
    const before = runner.state();
    runner.stop();
    await answer({ kind: 'conflict' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 10);
    expect(runner.state()).toBe(before);
    expect(calls).toHaveLength(1);
  });

  it('a refresh after its flush finds the machine already told', async () => {
    const { runner, answer, refreshed } = harness();
    change(runner, 'a');
    runner.dispatch({ type: 'reload' });
    await answer({ kind: 'ok', version: 4 });
    expect(runner.state()).toMatchObject({ phase: 'saved', version: 4 });
    expect(refreshed).toEqual(['refresh']);
  });

  it('a restart after a stop (React strict mode) works again', async () => {
    const { runner, calls } = harness();
    runner.stop();
    runner.start();
    change(runner, 'a');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
  });
});

describe('use', () => {
  it('a later save call is the one that is made', async () => {
    const { runner, calls } = harness();
    const seen: string[] = [];
    runner.use({
      save: (request) => {
        seen.push(request.content);
        return Promise.resolve({ kind: 'ok', version: 9 });
      },
      status: () => Promise.resolve({ kind: 'failed' }),
      refresh: () => undefined,
    });
    change(runner, 'a');
    runner.dispatch({ type: 'blur' });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([]);
    expect(seen).toEqual(['a']);
    expect(runner.state()).toMatchObject({ phase: 'saved', version: 9 });
  });
});
