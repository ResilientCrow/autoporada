/**
 * A tiny state-machine engine: each event names the states it may start from,
 * the state it leads to, who may trigger it and whether a note is required.
 */
export interface Transition<S extends string, A> {
  readonly from: readonly S[];
  readonly to: S;
  readonly allowed: (actor: A) => boolean;
  /** E.g. returning a point must tell the author why. */
  readonly requiresNote?: boolean;
}

export type Machine<S extends string, E extends string, A> = Readonly<Record<E, Transition<S, A>>>;

export type TransitionResult<S extends string> =
  | { readonly ok: true; readonly to: S }
  | { readonly ok: false; readonly reason: 'wrong-state' | 'not-allowed' | 'note-required' };

export function transition<S extends string, E extends string, A>(
  machine: Machine<S, E, A>,
  state: S,
  event: E,
  actor: A,
  note?: string,
): TransitionResult<S> {
  const t = machine[event];
  if (!t.from.includes(state)) return { ok: false, reason: 'wrong-state' };
  if (!t.allowed(actor)) return { ok: false, reason: 'not-allowed' };
  if (t.requiresNote && !note?.trim()) return { ok: false, reason: 'note-required' };
  return { ok: true, to: t.to };
}

/** The events `actor` may trigger from `state` — drives which buttons the UI shows. */
export function availableEvents<S extends string, E extends string, A>(
  machine: Machine<S, E, A>,
  state: S,
  actor: A,
): E[] {
  return (Object.keys(machine) as E[]).filter((event) => {
    const t = machine[event];
    return t.from.includes(state) && t.allowed(actor);
  });
}
