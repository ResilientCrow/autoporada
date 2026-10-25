import type { RunningWorker } from './worker';

type Exit = (code: 0 | 1) => void;

/**
 * How the worker process ends (ADR 0015). Two paths may end it at once: main's catch, when the
 * start fails, and a signal's stop, which waits for that same start. A failed start exits 1 and
 * is logged as `worker.failed` once, whichever path gets there first; a stop exits 0 only when
 * the start did not fail.
 */
export function createProcessEnd(exit: Exit, logFailed: (error: unknown) => void) {
  let startFailed = false;
  const failed = (error: unknown): undefined => {
    if (!startFailed) logFailed(error);
    startFailed = true;
    exit(1);
    return undefined;
  };
  return {
    /** Main's catch: the start, or anything before it, threw. */
    failed,
    /** The worker a signal's stop stops; a start that failed has nothing to stop, and fails. */
    started: (start: Promise<RunningWorker> | undefined) => start?.catch(failed),
    /** A signal's stop finished. */
    stopped: () => exit(startFailed ? 1 : 0),
  };
}
