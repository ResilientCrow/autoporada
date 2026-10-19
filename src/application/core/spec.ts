import type { z } from 'zod';

import type { Principal, SystemPrincipal, Tx, TxOptions, UserPrincipal } from '@/application/ports';
import type { Actor } from '@/domain/actor';
import type { Check } from '@/domain/policy';

import type { Outcome } from './result';

/**
 * An input schema: z.strictObject(…), so unknown keys are refused, never
 * stripped. Zod's types cannot tell strict from stripping objects; the
 * schema hygiene test checks every registered use case.
 */
export type StrictInput = z.ZodObject;
export type Mode = 'write' | 'read';

/** Checked before any connection is taken. */
export interface GateAccess<I> {
  readonly kind: 'gate';
  check(input: I): Check;
}

/** Checked inside the transaction: load, expected version, `can()`, step-up (ADR 0011). */
export interface ResourceAccess<I, R> {
  readonly kind: 'resource';
  /** Through the scoped repositories (`lock` when writing); null is not-found. */
  load(tx: Tx, input: I): Promise<R | null>;
  /**
   * The version the form started from, compared with the loaded `version`.
   * Not comparing is a written-down choice: 'unversioned'.
   */
  readonly expectedVersion: ((input: I) => number) | 'unversioned';
  check(resource: R, input: I): Check;
}

export interface UserContext {
  readonly principal: UserPrincipal;
  readonly actor: Actor;
  readonly now: Date;
  readonly requestId: string;
  readonly tx: Tx;
}

export interface SystemContext {
  readonly principal: SystemPrincipal;
  readonly now: Date;
  readonly requestId: string;
  readonly tx: Tx;
}

interface Common<S extends StrictInput, O extends z.ZodType> {
  /** `access.decide`: the name in logs; unique. */
  readonly name: `${string}.${string}`;
  readonly mode: Mode;
  /** From contracts/. */
  readonly input: S;
  /** The DTO, from contracts/; parsing strips anything it does not name. */
  readonly output: O;
  readonly timeouts?: Omit<TxOptions, 'mode'>;
}

export interface GateUseCaseSpec<S extends StrictInput, O extends z.ZodType> extends Common<S, O> {
  readonly access: GateAccess<z.output<S>>;
  execute(ctx: UserContext, input: z.output<S>): Promise<Outcome<z.input<O>>>;
}

export interface ResourceUseCaseSpec<S extends StrictInput, O extends z.ZodType, R> extends Common<
  S,
  O
> {
  readonly access: ResourceAccess<z.output<S>, R>;
  execute(ctx: UserContext, input: z.output<S>, resource: R): Promise<Outcome<z.input<O>>>;
}

export interface SystemUseCaseSpec<S extends StrictInput, O extends z.ZodType> extends Common<
  S,
  O
> {
  execute(ctx: SystemContext, input: z.output<S>): Promise<Outcome<z.input<O>>>;
}

/** One call of a use case, as delivery code makes it. */
export interface Call {
  readonly principal: Principal;
  readonly requestId: string;
  readonly input: unknown;
}
