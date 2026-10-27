import type { WallTime } from '@/domain/time';

export const DEBOUNCE_MS = 1_500;
export const RETRY_STEPS = [5, 15, 60] as const;

export type Phase =
  'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'locked' | 'gone' | 'failed' | 'signedOut';

export interface AutosaveState<C> {
  readonly phase: Phase;
  readonly content: C | null;
  readonly version: number;
  readonly unsent: boolean;
  readonly due: boolean;
  readonly checking: boolean;
  readonly attempt: number;
  readonly serverVersion: number | null;
  readonly savedAt: WallTime | null;
}

export type SaveAnswer =
  | { readonly kind: 'ok'; readonly version: number }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'not-editable' }
  /** The server finds no such point for this author (ADR 0013 item 3): the gone banner offers a reload. */
  | { readonly kind: 'gone' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number }
  /** The server refused the content itself: a retry of the same text would fail the same way. */
  | { readonly kind: 'invalid' }
  | { readonly kind: 'failed' };
export type StatusAnswer =
  | { readonly kind: 'ok'; readonly version: number; readonly editable: boolean }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'failed' };

export type Effect<C> =
  | { readonly type: 'timer'; readonly name: 'debounce' | 'retry'; readonly ms: number }
  | { readonly type: 'cancel'; readonly name: 'debounce' | 'retry' }
  | { readonly type: 'save'; readonly content: C; readonly expectedVersion: number }
  | { readonly type: 'status' }
  | { readonly type: 'flush'; readonly content: C; readonly expectedVersion: number }
  | { readonly type: 'refresh' };

export type AutosaveEvent<C> =
  | { readonly type: 'change'; readonly content: C }
  | { readonly type: 'blur' }
  | { readonly type: 'hidden' }
  | { readonly type: 'debounced' }
  | { readonly type: 'answered'; readonly answer: SaveAnswer; readonly at: WallTime }
  | { readonly type: 'statused'; readonly answer: StatusAnswer }
  | { readonly type: 'flushed'; readonly answer: SaveAnswer; readonly at: WallTime }
  | { readonly type: 'retryElapsed' }
  | { readonly type: 'retry' }
  | { readonly type: 'keepMine' }
  | { readonly type: 'reload' }
  | { readonly type: 'leave' };

export function initialState<C>(version: number): AutosaveState<C> {
  return {
    phase: 'idle',
    content: null,
    version,
    unsent: false,
    due: false,
    checking: false,
    attempt: 0,
    serverVersion: null,
    savedAt: null,
  };
}

type Step<C> = { readonly state: AutosaveState<C>; readonly effects: readonly Effect<C>[] };

/** The longest a retry waits, whatever the server asks: the last step of the ladder. */
const MAX_WAIT_S = 60;
const READ_ONLY: ReadonlySet<Phase> = new Set(['conflict', 'locked', 'gone', 'signedOut']);
/** The point can never be saved again, so leaving flushes nothing; only a reload gets out. */
const NO_SAVE: ReadonlySet<Phase> = new Set(['locked', 'gone']);
const DEBOUNCE: Effect<never> = { type: 'timer', name: 'debounce', ms: DEBOUNCE_MS };
const CANCEL_DEBOUNCE: Effect<never> = { type: 'cancel', name: 'debounce' };

const stay = <C>(state: AutosaveState<C>): Step<C> => ({ state, effects: [] });

/** Starts the one save: the latest content against the latest version. */
function send<C>(s: AutosaveState<C>, before: readonly Effect<C>[] = []): Step<C> {
  if (s.content === null) return stay(s);
  return {
    state: {
      ...s,
      phase: 'saving',
      unsent: false,
      due: false,
      checking: false,
      serverVersion: null,
    },
    effects: [...before, { type: 'save', content: s.content, expectedVersion: s.version }],
  };
}

/** A pause, blur or hidden: save now when idle, or as soon as the save in flight lands. */
function early<C>(s: AutosaveState<C>, timerFired: boolean): Step<C> {
  if (s.phase === 'saving') return stay(s.unsent ? { ...s, due: true } : s);
  if (s.phase === 'dirty' && s.attempt === 0 && s.unsent)
    return send(s, timerFired ? [] : [CANCEL_DEBOUNCE]);
  return stay(s);
}

/** The state may not be saved any more as it is: the banner says why (its alert is the announcement). */
function halt<C>(
  s: AutosaveState<C>,
  phase: 'failed' | 'conflict' | 'locked' | 'gone' | 'signedOut',
  serverVersion: number | null = null,
): Step<C> {
  return {
    state: { ...s, phase, unsent: true, due: false, checking: false, serverVersion },
    effects: [CANCEL_DEBOUNCE],
  };
}

/** A failed save: wait and retry down the ladder, then stop at failed. */
function lose<C>(s: AutosaveState<C>, seconds: number | null): Step<C> {
  const base = { ...s, unsent: true, due: false, checking: false, serverVersion: null };
  if (s.unsent && !s.checking) {
    // Typed on during the flight: the ladder starts over and the pause owns the next save.
    const next: AutosaveState<C> = { ...base, phase: 'dirty', attempt: 0 };
    return s.due ? send(next) : stay(next);
  }
  if (s.attempt >= RETRY_STEPS.length) return halt(base, 'failed');
  const wait = seconds ?? RETRY_STEPS[s.attempt] ?? MAX_WAIT_S;
  return {
    state: { ...base, phase: 'dirty', attempt: s.attempt + 1 },
    effects: [{ type: 'timer', name: 'retry', ms: wait * 1000 }],
  };
}

/**
 * The server will refuse this text however often it is sent, so the ladder and the banner
 * (which promise a retry) are no answer. The text waits, unsaved, for the author's next
 * change, pause or blur; the editor shows what to fix. Text typed during the flight keeps
 * its pause, or goes out now when the pause came during the flight.
 */
function park<C>(s: AutosaveState<C>): Step<C> {
  const next = { ...s, unsent: true, due: false, checking: false, attempt: 0, serverVersion: null };
  return s.unsent && s.due ? send(next) : stay({ ...next, phase: 'dirty' });
}

function answered<C>(s: AutosaveState<C>, a: SaveAnswer, at: WallTime): Step<C> {
  switch (a.kind) {
    case 'ok': {
      const next = { ...s, version: a.version, attempt: 0 };
      if (!s.unsent) return stay({ ...next, phase: 'saved', savedAt: at });
      return s.due ? send(next) : stay({ ...next, phase: 'dirty' });
    }
    case 'conflict':
      return { state: { ...s, unsent: true, checking: true }, effects: [{ type: 'status' }] };
    case 'not-editable':
      return halt(s, 'locked');
    case 'gone':
      return halt(s, 'gone');
    case 'unauthenticated':
      return halt(s, 'signedOut');
    case 'rate-limited': {
      const sec = a.retryAfterSeconds;
      return lose(s, Number.isFinite(sec) && sec > 0 ? Math.min(sec, MAX_WAIT_S) : null);
    }
    case 'invalid':
      return park(s);
    case 'failed':
      return lose(s, null);
  }
}

function statused<C>(s: AutosaveState<C>, a: StatusAnswer): Step<C> {
  if (a.kind === 'unauthenticated') return halt(s, 'signedOut');
  if (a.kind === 'failed') return lose(s, null);
  if (a.kind === 'gone') return halt(s, 'gone');
  // Editable: a newer version of the same point; otherwise its state moved on.
  return a.editable ? halt(s, 'conflict', a.version) : halt(s, 'locked');
}

/** The unsent content as a flush; no timer may send it a second time. */
function flushOf<C>(s: AutosaveState<C>): readonly Effect<C>[] {
  if (!s.unsent || s.content === null) return [];
  return [
    CANCEL_DEBOUNCE,
    { type: 'cancel', name: 'retry' },
    { type: 'flush', content: s.content, expectedVersion: s.version },
  ];
}

/**
 * The flush's answer, when the page lives on (the back/forward cache brought it back, or
 * the refresh is still to come). Saved text moves the version on; anything else leaves the
 * text unsaved, and the normal save path (the pause, then the ladder) takes it from here.
 */
function flushed<C>(s: AutosaveState<C>, a: SaveAnswer, at: WallTime): Step<C> {
  if (a.kind === 'ok') {
    const next = { ...s, version: a.version, attempt: 0 };
    return stay(s.unsent ? next : { ...next, phase: 'saved', savedAt: at });
  }
  if (s.unsent || s.phase === 'saving') return stay(s);
  if (s.phase === 'dirty' || s.phase === 'saved') {
    return {
      state: { ...s, phase: 'dirty', unsent: true, attempt: 0 },
      effects: [DEBOUNCE],
    };
  }
  return stay({ ...s, unsent: true });
}

/** Every change of state, with what the hook must do about it (timers, calls, flushes). */
export function step<C>(s: AutosaveState<C>, e: AutosaveEvent<C>): Step<C> {
  switch (e.type) {
    case 'change': {
      if (READ_ONLY.has(s.phase)) return stay(s);
      const next = { ...s, content: e.content, unsent: true, due: false };
      if (s.phase === 'saving') return { state: next, effects: [DEBOUNCE] };
      const waiting = s.phase === 'dirty' && s.attempt > 0;
      return {
        state: { ...next, phase: 'dirty', attempt: 0 },
        effects: waiting ? [{ type: 'cancel', name: 'retry' }, DEBOUNCE] : [DEBOUNCE],
      };
    }
    case 'blur':
    case 'hidden':
      return early(s, false);
    case 'debounced':
      return early(s, true);
    case 'answered':
      return s.phase === 'saving' && !s.checking ? answered(s, e.answer, e.at) : stay(s);
    case 'statused':
      return s.phase === 'saving' && s.checking ? statused(s, e.answer) : stay(s);
    case 'flushed':
      return flushed(s, e.answer, e.at);
    case 'retryElapsed':
      return s.phase === 'dirty' && s.attempt > 0 ? send(s) : stay(s);
    case 'retry':
      return s.phase === 'failed' || s.phase === 'signedOut' ? send({ ...s, attempt: 0 }) : stay(s);
    case 'keepMine':
      return s.phase === 'conflict'
        ? send({ ...s, attempt: 0, version: s.serverVersion ?? s.version })
        : stay(s);
    case 'reload': {
      const saveable = s.phase === 'dirty' || s.phase === 'saving' || s.phase === 'failed';
      const flush = saveable ? flushOf(s) : [];
      return {
        state: flush.length > 0 ? { ...s, unsent: false } : s,
        effects: [...flush, { type: 'refresh' }],
      };
    }
    case 'leave': {
      const flush = NO_SAVE.has(s.phase) ? [] : flushOf(s);
      return { state: flush.length > 0 ? { ...s, unsent: false } : s, effects: flush };
    }
  }
}

/**
 * `beforeunload` warns while the page holds text the server does not have: unsent
 * or failed changes as well as a save in flight (ADR 0017 item 5 names dirty and
 * saving; failed, conflict, signedOut and locked hold unsaved text too).
 */
export function warnOnUnload<C>(s: AutosaveState<C>): boolean {
  return s.phase === 'saving' || s.unsent;
}

export function isReadOnly(phase: Phase): boolean {
  return READ_ONLY.has(phase);
}
