import { describe, expect, it } from 'vitest';

import { createProcessEnd } from './process-end';
import type { RunningWorker } from './worker';

/** A process end whose exits and `worker.failed` lines are recorded instead of taken. */
function recorded() {
  const exits: (0 | 1)[] = [];
  const failures: unknown[] = [];
  const end = createProcessEnd(
    (code) => void exits.push(code),
    (error) => void failures.push(error),
  );
  return { end, exits, failures };
}

/** A signal's stop as main runs it: the worker its start gave, if any, then the rest, then done. */
async function signalStop(end: ReturnType<typeof createProcessEnd>, start: Promise<RunningWorker>) {
  const worker = await end.started(start);
  await worker?.stop();
  end.stopped();
}

const START_FAILED = new Error('worker: queue mail.send is missing; run migrate');

describe('createProcessEnd', () => {
  it('exits 0 after a signal stopped a worker that started', async () => {
    const { end, exits, failures } = recorded();
    let stopped = false;
    await signalStop(
      end,
      Promise.resolve({
        async stop() {
          stopped = true;
        },
      }),
    );
    expect(stopped).toBe(true);
    expect(exits).toEqual([0]);
    expect(failures).toEqual([]);
  });

  it('exits 1 when the start fails with no signal, logging worker.failed', () => {
    const { end, exits, failures } = recorded();
    end.failed(START_FAILED);
    expect(exits).toEqual([1]);
    expect(failures).toEqual([START_FAILED]);
  });

  // The race (830ec94 residue): the start rejects while a signal's stop waits for it. Main's
  // catch and the stop both end the process; the first exit must be 1 and the failure logged once.
  it.each([
    ['the signal’s stop', 'stop'],
    ['main’s catch', 'catch'],
  ] as const)(
    'exits 1 and logs worker.failed once when the start fails during a signal, %s first',
    async (_first, first) => {
      const { end, exits, failures } = recorded();
      const start = Promise.reject(START_FAILED);
      const catchPath = () => start.catch(end.failed);
      if (first === 'stop') {
        await signalStop(end, start);
        await catchPath();
      } else {
        await catchPath();
        await signalStop(end, start);
      }
      expect(exits[0]).toBe(1);
      expect(new Set(exits)).toEqual(new Set([1]));
      expect(failures).toEqual([START_FAILED]);
    },
  );

  it('exits 1 whichever path settles first when both race on the same rejection', async () => {
    const { end, exits, failures } = recorded();
    const start = Promise.reject(START_FAILED);
    await Promise.all([signalStop(end, start), start.catch(end.failed)]);
    expect(exits).not.toContain(0);
    expect(failures).toEqual([START_FAILED]);
  });
});
