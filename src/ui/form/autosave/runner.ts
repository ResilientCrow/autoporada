import type { WallTime } from '@/domain/time';

import {
  initialState,
  isReadOnly,
  step,
  type AutosaveEvent,
  type AutosaveState,
  type SaveAnswer,
  type StatusAnswer,
} from './machine';

export interface Ports<C> {
  readonly save: (request: { content: C; expectedVersion: number }) => Promise<SaveAnswer>;
  readonly status: () => Promise<StatusAnswer>;
  readonly refresh: () => void;
  readonly now: () => WallTime;
  readonly onState: (state: AutosaveState<C>) => void;
}

export interface Runner<C> {
  readonly state: () => AutosaveState<C>;
  readonly dispatch: (event: AutosaveEvent<C>) => void;
  readonly start: () => void;
  readonly stop: () => void;
  /** Swaps the calls the page owns (its latest closures); timers and state carry on. */
  readonly use: (calls: Pick<Ports<C>, 'save' | 'status' | 'refresh'>) => void;
  /**
   * Runs `send` (the page's own call: submit, withdraw) once what is unsent and any save in flight
   * have landed, with the version they brought, so a pending autosave never turns it into a conflict.
   * Its answer goes to the machine like a save's and comes back. Resolves null, sending nothing,
   * while a banner holds the editor read-only and after `stop`; a throw is a failed answer.
   */
  readonly afterLanded: (
    send: (expectedVersion: number) => Promise<SaveAnswer>,
  ) => Promise<SaveAnswer | null>;
}

const FAILED: SaveAnswer = { kind: 'failed' };

/**
 * Runs the machine's effects: timers, the calls to `save` and `status`, the flush
 * and the refresh. No React in it, so it is tested with fake timers; the hook only
 * hands it ports and shows its state. After `stop` it ignores every event and every
 * late answer (a flush it already sent still goes out; its answer is dropped).
 */
export function createRunner<C>(initialPorts: Ports<C>, version: number): Runner<C> {
  let ports = initialPorts;
  let state = initialState<C>(version);
  let running = false;
  let inFlight: Promise<SaveAnswer> | null = null;
  const flushes = new Set<Promise<void>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const clear = (name: string) => {
    clearTimeout(timers.get(name));
    timers.delete(name);
  };

  /** A call that never throws: a rejected action is a failed save. */
  const call = (content: C, expectedVersion: number): Promise<SaveAnswer> => {
    try {
      return ports.save({ content, expectedVersion }).catch(() => FAILED);
    } catch {
      return Promise.resolve(FAILED);
    }
  };

  function startSave(content: C, expectedVersion: number): void {
    const sent = call(content, expectedVersion);
    inFlight = sent;
    void sent.then((answer) => {
      if (inFlight === sent) inFlight = null;
      dispatch({ type: 'answered', answer, at: ports.now() });
    });
  }

  function askStatus(): void {
    const asked = (async () => ports.status())().catch((): StatusAnswer => ({ kind: 'failed' }));
    void asked.then((answer) => dispatch({ type: 'statused', answer }));
  }

  /** Sends what is unsent after a save in flight has landed, with the version it brought. */
  function flush(content: C, expectedVersion: number): void {
    const prior = inFlight;
    const send = (previous: SaveAnswer | null) =>
      call(content, previous?.kind === 'ok' ? previous.version : expectedVersion).then((answer) =>
        // Told to the machine while the page lives on (a restored page, a refresh to come).
        dispatch({ type: 'flushed', answer, at: ports.now() }),
      );
    const done = prior === null ? send(null) : prior.then(send);
    flushes.add(done);
    void done.then(() => flushes.delete(done));
  }

  /** Everything sent so far: the flushes and the save in flight. */
  function landed(): Promise<unknown> {
    const pending = [...flushes];
    if (inFlight !== null) pending.push(inFlight.then(() => undefined));
    return Promise.all(pending);
  }

  function refresh(): void {
    const pending = flushes.size + (inFlight === null ? 0 : 1);
    if (pending === 0) ports.refresh();
    else void landed().then(() => ports.refresh());
  }

  async function afterLanded(
    send: (expectedVersion: number) => Promise<SaveAnswer>,
  ): Promise<SaveAnswer | null> {
    if (!running || isReadOnly(state.phase)) return null;
    dispatch({ type: 'submit' });
    await landed();
    if (!running) return null;
    let answer: SaveAnswer;
    try {
      answer = await send(state.version);
    } catch {
      answer = FAILED;
    }
    dispatch({ type: 'submitted', answer, at: ports.now() });
    return answer;
  }

  function dispatch(event: AutosaveEvent<C>): void {
    if (!running) return;
    const next = step(state, event);
    state = next.state;
    ports.onState(state);
    for (const effect of next.effects) {
      switch (effect.type) {
        case 'timer': {
          clear(effect.name);
          const name = effect.name;
          timers.set(
            name,
            setTimeout(() => {
              timers.delete(name);
              dispatch({ type: name === 'debounce' ? 'debounced' : 'retryElapsed' });
            }, effect.ms),
          );
          break;
        }
        case 'cancel':
          clear(effect.name);
          break;
        case 'save':
          clear('debounce');
          clear('retry');
          startSave(effect.content, effect.expectedVersion);
          break;
        case 'status':
          askStatus();
          break;
        case 'flush':
          flush(effect.content, effect.expectedVersion);
          break;
        case 'refresh':
          refresh();
          break;
      }
    }
  }

  return {
    state: () => state,
    dispatch,
    start: () => {
      running = true;
    },
    afterLanded,
    use: (calls) => {
      ports = { ...ports, ...calls };
    },
    stop: () => {
      running = false;
      for (const name of [...timers.keys()]) clear(name);
    },
  };
}
