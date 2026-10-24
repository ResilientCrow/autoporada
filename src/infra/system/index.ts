import type { Clock } from '@/application/ports';

export {
  assertOutsideTransaction,
  inTransactionScope,
  insideTransaction,
} from './transaction-scope';

/** The wall clock of the server. */
export const systemClock: Clock = { now: () => new Date() };

/**
 * Waits `ms`, or less if `signal` aborts first; never rejects. An aborted signal never fires
 * `abort` again, so one that is aborted already ends the wait at once.
 */
export function sleepOn(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}
