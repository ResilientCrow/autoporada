import { describe, expect, it } from 'vitest';

import { wallTime } from '@/domain/time';

import {
  DEBOUNCE_MS,
  initialState,
  isReadOnly,
  RETRY_STEPS,
  step,
  warnOnUnload,
  type AutosaveEvent,
  type AutosaveState,
  type Effect,
  type Phase,
  type SaveAnswer,
  type StatusAnswer,
} from './machine';

type S = AutosaveState<string>;
type E = AutosaveEvent<string>;
type F = Effect<string>;

const AT = wallTime(14, 32);
const debounce: F = { type: 'timer', name: 'debounce', ms: DEBOUNCE_MS };
const cancel = (name: 'debounce' | 'retry'): F => ({ type: 'cancel', name });
const save = (content: string, expectedVersion: number): F => ({
  type: 'save',
  content,
  expectedVersion,
});
const stopTimers: readonly F[] = [cancel('debounce'), cancel('retry')];
const retryIn = (seconds: number): F => ({ type: 'timer', name: 'retry', ms: seconds * 1000 });

const change = (content: string): E => ({ type: 'change', content });
const answer = (a: SaveAnswer): E => ({ type: 'answered', answer: a, at: AT });
const ok = (version: number): E => answer({ kind: 'ok', version });
const failure: E = answer({ kind: 'failed' });
const status = (a: StatusAnswer): E => ({ type: 'statused', answer: a });
const ev = (
  type:
    'blur' | 'hidden' | 'debounced' | 'retryElapsed' | 'retry' | 'keepMine' | 'reload' | 'leave',
): E => ({ type });

/** Runs events from `from`, returning the last state and every step's effects. */
function run(events: readonly E[], from: S = initialState<string>(3)) {
  let state = from;
  const trail: (readonly F[])[] = [];
  for (const event of events) {
    const out = step(state, event);
    state = out.state;
    trail.push(out.effects);
  }
  return { state, trail, last: trail[trail.length - 1] ?? [] };
}

/** A state reached the way a session would reach it. */
const REACH: Record<Phase, readonly E[]> = {
  idle: [],
  dirty: [change('a')],
  saving: [change('a'), ev('blur')],
  saved: [change('a'), ev('blur'), ok(4)],
  failed: [
    change('a'),
    ev('blur'),
    failure,
    ev('retryElapsed'),
    failure,
    ev('retryElapsed'),
    failure,
    ev('retryElapsed'),
    failure,
  ],
  conflict: [
    change('a'),
    ev('blur'),
    answer({ kind: 'conflict' }),
    status({ kind: 'ok', version: 9, editable: true }),
  ],
  locked: [change('a'), ev('blur'), answer({ kind: 'not-editable' })],
  signedOut: [change('a'), ev('blur'), answer({ kind: 'unauthenticated' })],
};
const at = (phase: Phase) => run(REACH[phase]).state;

describe('the constants', () => {
  it('are the ADR numbers', () => {
    expect(DEBOUNCE_MS).toBe(1500);
    expect(RETRY_STEPS).toEqual([5, 15, 60]);
  });
});

describe('reaching each state', () => {
  it.each(Object.keys(REACH) as Phase[])('%s', (phase) => {
    expect(at(phase).phase).toBe(phase);
  });
});

describe('the debounce', () => {
  it('starts a timer on the first change and moves to dirty', () => {
    const { state, last } = run([change('a')]);
    expect(state).toMatchObject({ phase: 'dirty', content: 'a', unsent: true });
    expect(last).toEqual([debounce]);
  });

  it('restarts the timer on every change, with the latest content', () => {
    const { state, trail } = run([change('a'), change('ab'), change('abc')]);
    expect(trail).toEqual([[debounce], [debounce], [debounce]]);
    expect(state.content).toBe('abc');
  });

  it('saves when the timer elapses, against the version the server gave', () => {
    const { state, last } = run([change('a'), ev('debounced')]);
    expect(state.phase).toBe('saving');
    expect(last).toEqual([save('a', 3)]);
  });

  it.each(['blur', 'hidden'] as const)('saves at once on %s and drops the timer', (event) => {
    const { state, last } = run([change('a'), ev(event)]);
    expect(state.phase).toBe('saving');
    expect(last).toEqual([cancel('debounce'), save('a', 3)]);
  });

  it.each(['blur', 'hidden', 'debounced'] as const)(
    '%s with nothing to save does nothing',
    (event) => {
      expect(run([ev(event)]).last).toEqual([]);
      expect(run([ev(event)], at('saved')).last).toEqual([]);
      expect(run([ev(event)], at('saved')).state.phase).toBe('saved');
    },
  );

  it('is not an early save for a retry wait: blur and hidden leave the ladder alone', () => {
    const waiting = run([change('a'), ev('blur'), failure]).state;
    expect(waiting.phase).toBe('dirty');
    for (const event of ['blur', 'hidden', 'debounced'] as const) {
      expect(run([ev(event)], waiting)).toMatchObject({ last: [], state: waiting });
    }
  });
});

describe('one save in flight', () => {
  it('sends nothing while a save is out; a change restarts the timer only', () => {
    const { state, trail } = run([change('a'), ev('blur'), change('ab')]);
    expect(state).toMatchObject({ phase: 'saving', content: 'ab', unsent: true });
    expect(trail[2]).toEqual([debounce]);
    expect(run([ev('debounced')], state).last).toEqual([]);
    expect(run([ev('blur')], state).last).toEqual([]);
  });

  it('after the answer, waits for the timer and then sends with the new version', () => {
    const mid = run([change('a'), ev('blur'), change('ab')]).state;
    const landed = run([ok(4)], mid);
    expect(landed.state).toMatchObject({ phase: 'dirty', version: 4 });
    expect(landed.last).toEqual([]);
    expect(run([ev('debounced')], landed.state).last).toEqual([save('ab', 4)]);
  });

  it('sends at once after the answer when the pause or a blur came during the save', () => {
    for (const early of ['debounced', 'blur', 'hidden'] as const) {
      const mid = run([change('a'), ev('blur'), change('ab'), ev(early)]).state;
      const landed = run([ok(4)], mid);
      expect(landed.state.phase).toBe('saving');
      expect(landed.last).toEqual([save('ab', 4)]);
    }
  });

  it('a change after that pause is a new pause', () => {
    const mid = run([change('a'), ev('blur'), change('ab'), ev('debounced'), change('abc')]).state;
    expect(run([ok(4)], mid).last).toEqual([]);
  });

  it('without a change meanwhile, the answer is saved with the time and the version', () => {
    const { state, last } = run([change('a'), ev('blur'), ok(4)]);
    expect(state).toMatchObject({ phase: 'saved', version: 4, savedAt: AT, unsent: false });
    expect(last).toEqual([]);
  });

  it('a later change after saved starts again from the version the server gave', () => {
    const { last } = run([change('b'), ev('blur')], at('saved'));
    expect(last).toEqual([cancel('debounce'), save('b', 4)]);
  });

  it('ignores an answer that nothing waits for', () => {
    expect(run([ok(9)]).state).toEqual(initialState(3));
    expect(run([ok(9)], at('saved')).state).toEqual(at('saved'));
    expect(run([status({ kind: 'ok', version: 9, editable: true })], at('saving')).state).toEqual(
      at('saving'),
    );
  });
});

describe('the retry ladder', () => {
  it('retries after 5, 15 and 60 seconds, then stops at failed', () => {
    const first = run([failure], at('saving'));
    expect(first.state.phase).toBe('dirty');
    expect(first.last).toEqual([retryIn(5)]);

    const second = run([ev('retryElapsed'), failure], first.state);
    expect(second.trail[0]).toEqual([save('a', 3)]);
    expect(second.last).toEqual([retryIn(15)]);

    const third = run([ev('retryElapsed'), failure], second.state);
    expect(third.last).toEqual([retryIn(60)]);

    const fourth = run([ev('retryElapsed'), failure], third.state);
    expect(fourth.state).toMatchObject({ phase: 'failed', unsent: true });
    expect(fourth.last).toEqual([cancel('debounce')]);
  });

  it('a success on a retry clears the ladder', () => {
    const { state } = run([failure, ev('retryElapsed'), ok(4), change('b'), ev('blur'), failure]);
    expect(state.attempt).toBe(1);
  });

  it('any change resets the ladder and cancels the wait', () => {
    const waiting = run([failure], at('saving')).state;
    const { state, last } = run([change('ab')], waiting);
    expect(state).toMatchObject({ phase: 'dirty', attempt: 0 });
    expect(last).toEqual([cancel('retry'), debounce]);
    // The next failure starts at 5 seconds again.
    expect(run([ev('blur'), failure], state).last).toEqual([retryIn(5)]);
  });

  it('a change in failed leaves failed and resets the ladder; the fields stay editable', () => {
    const { state, last } = run([change('abc')], at('failed'));
    expect(state).toMatchObject({ phase: 'dirty', attempt: 0, content: 'abc' });
    expect(last).toEqual([debounce]);
    expect(isReadOnly('failed')).toBe(false);
  });

  it('"Zkusit znovu" sends at once and resets the ladder', () => {
    const { state, last } = run([ev('retry')], at('failed'));
    expect(state).toMatchObject({ phase: 'saving', attempt: 0 });
    expect(last).toEqual([save('a', 3)]);
    expect(run([failure], state).last).toEqual([retryIn(5)]);
  });

  it('a change during the save that fails starts the ladder over and leaves the pause to the timer', () => {
    const mid = run([change('a'), ev('blur'), change('ab')]).state;
    const lost = run([failure], mid);
    expect(lost.state).toMatchObject({ phase: 'dirty', attempt: 0, unsent: true });
    expect(lost.last).toEqual([]);
    expect(run([ev('debounced')], lost.state).last).toEqual([save('ab', 3)]);
  });

  it('keeps the retry wait for a press that arrives early', () => {
    expect(run([ev('retry')], run([failure], at('saving')).state).last).toEqual([]);
  });

  it('a retry that fires with no wait pending does nothing', () => {
    expect(run([ev('retryElapsed')], at('saved')).last).toEqual([]);
  });
});

describe('rate limiting', () => {
  const limited = (retryAfterSeconds: number) =>
    answer({ kind: 'rate-limited', retryAfterSeconds });

  it('waits the seconds the server gave instead of the ladder step', () => {
    expect(run([limited(30)], at('saving')).last).toEqual([retryIn(30)]);
  });

  it('shows failed only if it persists through the ladder', () => {
    let state = at('saving');
    for (let i = 0; i < RETRY_STEPS.length; i++) {
      state = run([limited(2), ev('retryElapsed')], state).state;
      expect(state.phase).toBe('saving');
    }
    const last = run([limited(2)], state);
    expect(last.state.phase).toBe('failed');
    expect(last.last).toEqual([cancel('debounce')]);
  });

  it.each([0, -3, Number.NaN])('falls back to the ladder step for %s seconds', (seconds) => {
    expect(run([limited(seconds)], at('saving')).last).toEqual([retryIn(5)]);
  });

  it('waits at most a minute', () => {
    expect(run([limited(3600)], at('saving')).last).toEqual([retryIn(60)]);
  });
});

describe('conflict, status and locked', () => {
  it('asks the status first and shows nothing yet', () => {
    const { state, last } = run([answer({ kind: 'conflict' })], at('saving'));
    expect(state).toMatchObject({ phase: 'saving', checking: true, unsent: true });
    expect(last).toEqual([{ type: 'status' }]);
  });

  it('editable gives conflict, holding the status version', () => {
    const { state, last } = run([status({ kind: 'ok', version: 9, editable: true })], at('saving'));
    expect(last).toEqual([]);
    const asked = run(
      [answer({ kind: 'conflict' }), status({ kind: 'ok', version: 9, editable: true })],
      at('saving'),
    );
    expect(asked.state).toMatchObject({
      phase: 'conflict',
      serverVersion: 9,
      version: 3,
      checking: false,
    });
    expect(asked.last).toEqual([cancel('debounce')]);
    expect(state.phase).toBe('saving');
  });

  it('not editable gives locked', () => {
    const asked = run(
      [answer({ kind: 'conflict' }), status({ kind: 'ok', version: 9, editable: false })],
      at('saving'),
    );
    expect(asked.state.phase).toBe('locked');
    expect(asked.last).toEqual([cancel('debounce')]);
  });

  it('the rule point-not-editable gives locked at once', () => {
    const { state, last } = run([answer({ kind: 'not-editable' })], at('saving'));
    expect(state.phase).toBe('locked');
    expect(last).toEqual([cancel('debounce')]);
  });

  it('a status that is unauthenticated gives signedOut; one that fails goes down the ladder', () => {
    const asked = run([answer({ kind: 'conflict' })], at('saving')).state;
    expect(run([status({ kind: 'unauthenticated' })], asked).state.phase).toBe('signedOut');
    const failed = run([status({ kind: 'failed' })], asked);
    expect(failed.state).toMatchObject({ phase: 'dirty', checking: false, attempt: 1 });
    expect(failed.last).toEqual([retryIn(5)]);
    // The retry saves again with the old version and meets the conflict again.
    expect(run([ev('retryElapsed')], failed.state).last).toEqual([save('a', 3)]);
  });

  it('"Ponechat moji verzi" saves the local content against the status version', () => {
    const { state, last } = run([ev('keepMine')], at('conflict'));
    expect(state).toMatchObject({ phase: 'saving', version: 9, checking: false });
    expect(last).toEqual([save('a', 9)]);
    // Saved, the version moves on.
    expect(run([ok(10)], state).state).toMatchObject({ phase: 'saved', version: 10 });
    // Another conflict asks the status again.
    expect(run([answer({ kind: 'conflict' })], state).last).toEqual([{ type: 'status' }]);
  });

  it('"Načíst aktuální stav" asks for the refresh and keeps the state', () => {
    for (const phase of ['conflict', 'locked'] as const) {
      const { state, last } = run([ev('reload')], at(phase));
      expect(last).toEqual([{ type: 'refresh' }]);
      expect(state).toEqual(at(phase));
    }
  });

  it('a refresh from a dirty or failed editor flushes what is unsent first', () => {
    for (const phase of ['dirty', 'failed'] as const) {
      const { state, last } = run([ev('reload')], at(phase));
      expect(last).toEqual([
        ...stopTimers,
        { type: 'flush', content: 'a', expectedVersion: 3 },
        { type: 'refresh' },
      ]);
      expect(state.unsent).toBe(false);
    }
    expect(run([ev('reload')], at('saved')).last).toEqual([{ type: 'refresh' }]);
  });

  it('a refresh from a save in flight with newer text flushes that text, then refreshes', () => {
    const mid = run([change('a'), ev('blur'), change('ab')]).state;
    const { state, last } = run([ev('reload')], mid);
    expect(last).toEqual([
      ...stopTimers,
      { type: 'flush', content: 'ab', expectedVersion: 3 },
      { type: 'refresh' },
    ]);
    expect(state.unsent).toBe(false);
  });

  it('a refresh from a save in flight with nothing newer only refreshes', () => {
    expect(run([ev('reload')], at('saving')).last).toEqual([{ type: 'refresh' }]);
  });

  it('keep mine and reload mean nothing outside their states', () => {
    for (const phase of ['idle', 'dirty', 'saved', 'failed', 'locked', 'signedOut'] as const) {
      expect(run([ev('keepMine')], at(phase)).state).toEqual(at(phase));
    }
  });
});

describe('signed out', () => {
  it('keeps the content and goes read-only', () => {
    const { state, last } = run([answer({ kind: 'unauthenticated' })], at('saving'));
    expect(state).toMatchObject({ phase: 'signedOut', content: 'a', unsent: true });
    expect(last).toEqual([cancel('debounce')]);
  });

  it('"Uložit" retries with the same content and version', () => {
    const { state, last } = run([ev('retry')], at('signedOut'));
    expect(state.phase).toBe('saving');
    expect(last).toEqual([save('a', 3)]);
    expect(run([ok(4)], state).state.phase).toBe('saved');
    expect(run([answer({ kind: 'unauthenticated' })], state).last).toEqual([cancel('debounce')]);
  });
});

describe('read-only states', () => {
  it.each(['conflict', 'locked', 'signedOut'] as const)(
    '%s ignores changes and the timers',
    (phase) => {
      expect(isReadOnly(phase)).toBe(true);
      for (const event of [
        change('zzz'),
        ev('blur'),
        ev('hidden'),
        ev('debounced'),
        ev('retryElapsed'),
      ]) {
        expect(run([event], at(phase))).toMatchObject({ state: at(phase), last: [] });
      }
    },
  );

  it.each(['idle', 'dirty', 'saving', 'saved', 'failed'] as const)('%s is editable', (phase) => {
    expect(isReadOnly(phase)).toBe(false);
  });
});

describe('leaving', () => {
  const flush: F = { type: 'flush', content: 'a', expectedVersion: 3 };
  const flushed = [...stopTimers, flush];

  it.each(['dirty', 'failed', 'conflict', 'signedOut'] as const)(
    'flushes the unsent content in %s',
    (phase) => {
      const { state, last } = run([ev('leave')], at(phase));
      expect(last).toEqual(flushed);
      expect(state.unsent).toBe(false);
    },
  );

  it('does not flush in locked', () => {
    expect(run([ev('leave')], at('locked')).last).toEqual([]);
  });

  it.each(['idle', 'saved'] as const)('has nothing to flush in %s', (phase) => {
    expect(run([ev('leave')], at(phase)).last).toEqual([]);
  });

  it('with a save in flight and nothing newer, leaves it to land', () => {
    expect(run([ev('leave')], at('saving')).last).toEqual([]);
  });

  it('with a save in flight and newer text, flushes the newer text (the runner waits for the save)', () => {
    const mid = run([change('a'), ev('blur'), change('ab')]).state;
    expect(run([ev('leave')], mid).last).toEqual([
      ...stopTimers,
      { type: 'flush', content: 'ab', expectedVersion: 3 },
    ]);
  });

  it('flushes once: pagehide and then the unmount send one call', () => {
    const first = run([ev('leave')], at('dirty'));
    expect(run([ev('leave')], first.state).last).toEqual([]);
  });

  it('a flush while waiting for a retry sends the content with the version we hold', () => {
    const waiting = run([failure], at('saving')).state;
    expect(run([ev('leave')], waiting).last).toEqual(flushed);
  });

  it('a flush drops the timers: a page that lives on does not send the same text again', () => {
    const left = run([ev('leave')], at('dirty')).state;
    // A frozen page restored from the back/forward cache: a blur or a late timer sends nothing.
    for (const event of ['blur', 'hidden', 'debounced', 'retryElapsed'] as const) {
      expect(run([ev(event)], left).last).toEqual([]);
    }
  });
});

describe('the answer to a flush while the page lives on', () => {
  const flushedAnswer = (a: SaveAnswer): E => ({ type: 'flushed', answer: a, at: AT });
  const okFlush = (version: number) => flushedAnswer({ kind: 'ok', version });
  /** The state right after a pagehide flush from `phase`. */
  const left = (phase: Phase) => run([ev('leave')], at(phase)).state;

  it.each(['dirty', 'failed', 'signedOut', 'conflict'] as const)(
    'ok from %s: the version moves on and nothing is unsent, so it is saved',
    (phase) => {
      const { state, last } = run([okFlush(4)], left(phase));
      expect(state).toMatchObject({
        phase: 'saved',
        version: 4,
        attempt: 0,
        savedAt: AT,
        unsent: false,
      });
      expect(last).toEqual([]);
    },
  );

  it('ok resets the ladder', () => {
    const waiting = run([failure], at('saving')).state;
    expect(run([ev('leave'), okFlush(4)], waiting).state).toMatchObject({
      phase: 'saved',
      attempt: 0,
    });
  });

  it('ok with newer text typed since keeps the newer text for the debounce, on the new version', () => {
    const typed = run([ev('leave'), change('ab')], at('dirty'));
    const landed = run([okFlush(4)], typed.state);
    expect(landed.state).toMatchObject({ phase: 'dirty', version: 4, unsent: true, attempt: 0 });
    expect(landed.last).toEqual([]);
    expect(run([ev('debounced')], landed.state).last).toEqual([save('ab', 4)]);
  });

  it.each([
    ['conflict', { kind: 'conflict' }],
    ['failed', { kind: 'failed' }],
    ['rate-limited', { kind: 'rate-limited', retryAfterSeconds: 30 }],
    ['not-editable', { kind: 'not-editable' }],
    ['unauthenticated', { kind: 'unauthenticated' }],
  ] as const)('%s from dirty: the text is not saved, so the normal save path runs', (_, a) => {
    const { state, last } = run([flushedAnswer(a)], left('dirty'));
    expect(state).toMatchObject({ phase: 'dirty', unsent: true, attempt: 0, version: 3 });
    expect(last).toEqual([debounce]);
    expect(run([ev('debounced')], state).last).toEqual([save('a', 3)]);
  });

  it('a failed flush after a retry wait starts the save path from the first step', () => {
    const waiting = run([failure], at('saving')).state;
    const { state, last } = run([ev('leave'), flushedAnswer({ kind: 'failed' })], waiting);
    expect(state).toMatchObject({ phase: 'dirty', attempt: 0, unsent: true });
    expect(last).toEqual([debounce]);
  });

  it('a failed flush from saved goes back to dirty', () => {
    // Nothing was flushed from saved, but a restored page may answer a flush sent before a save.
    const { state, last } = run([flushedAnswer({ kind: 'failed' })], at('saved'));
    expect(state).toMatchObject({ phase: 'dirty', unsent: true });
    expect(last).toEqual([debounce]);
  });

  it.each(['failed', 'conflict', 'locked', 'signedOut'] as const)(
    'a failed flush in %s only keeps the text marked unsent',
    (phase) => {
      const { state, last } = run([flushedAnswer({ kind: 'failed' })], left(phase));
      expect(state).toMatchObject({ phase, unsent: true });
      expect(last).toEqual([]);
    },
  );

  it('a failed flush while a newer save is out changes nothing: that save carries the newest text', () => {
    const mid = run([ev('leave'), change('b'), ev('blur')], at('dirty')).state;
    expect(mid).toMatchObject({ phase: 'saving', content: 'b', unsent: false });
    expect(run([flushedAnswer({ kind: 'failed' })], mid)).toMatchObject({ state: mid, last: [] });
  });

  it('a failed flush with newer text already unsent changes nothing', () => {
    const typed = run([ev('leave'), change('ab')], at('dirty')).state;
    expect(run([flushedAnswer({ kind: 'conflict' })], typed)).toMatchObject({
      state: typed,
      last: [],
    });
  });
});

describe('a failed save after a pause or blur came during it', () => {
  it('sends the newest text against the same version at once', () => {
    const { state, last } = run([change('a'), ev('blur'), change('ab'), ev('blur'), failure]);
    expect(last).toEqual([save('ab', 3)]);
    expect(state).toMatchObject({ phase: 'saving', attempt: 0, version: 3 });
  });
});

describe('warnOnUnload', () => {
  it.each([
    ['idle', false],
    ['dirty', true],
    ['saving', true],
    ['saved', false],
    // These hold text the server does not have, and a pagehide flush may not land.
    ['failed', true],
    ['conflict', true],
    ['signedOut', true],
    ['locked', true],
  ] as const)('%s -> %j', (phase, warns) => {
    expect(warnOnUnload(at(phase))).toBe(warns);
  });

  it('stops once the content has been flushed on leave', () => {
    expect(warnOnUnload(run([ev('leave')], at('dirty')).state)).toBe(false);
  });

  it('is true again for text typed after a save', () => {
    expect(warnOnUnload(run([change('b')], at('saved')).state)).toBe(true);
  });
});
