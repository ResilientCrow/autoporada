import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sleepOn } from './index';

/** Whether `promise` has settled, after letting pending callbacks run. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

describe('sleepOn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits the whole time when nothing aborts', async () => {
    const sleep = sleepOn(60_000, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(await settled(sleep)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(sleep)).toBe(true);
  });

  it('ends early when the signal aborts during the wait', async () => {
    const controller = new AbortController();
    const sleep = sleepOn(60_000, controller.signal);
    controller.abort();
    expect(await settled(sleep)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  // An aborted signal never fires `abort` again (a SIGTERM during the handler call, A4).
  it('returns at once for a signal that is already aborted, and leaves no timer', async () => {
    const sleep = sleepOn(900_000, AbortSignal.abort());
    expect(await settled(sleep)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
