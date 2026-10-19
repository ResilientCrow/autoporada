import type { z } from 'zod';

import {
  ConstraintViolation,
  LockTimeout,
  StaleVersion,
  TransactionConflict,
  type AppDeps,
  type Tx,
  type TxContext,
  type UserPrincipal,
} from '@/application/ports';

import { decide } from './decide';
import type {
  Call,
  GateUseCaseSpec,
  ResourceUseCaseSpec,
  StrictInput,
  SystemUseCaseSpec,
} from './spec';
import { CONSTRAINT_RULES } from './failure';
import { toFieldIssues } from './field-issues';
import { normalizeInput } from './normalize';
import type { PipelineFailure, Result } from './result';

/** Ends the transaction with a failure; never leaves this module. */
class Rollback extends Error {
  constructor(readonly failure: PipelineFailure) {
    super(failure.code);
  }
}

const refused = (error: PipelineFailure): Result<never, PipelineFailure> => ({ ok: false, error });

/** Steps 2 and 3: normalise, then parse strictly. */
function parseInput<S extends StrictInput>(
  schema: S,
  raw: unknown,
): Result<z.output<S>, PipelineFailure> {
  const clean = normalizeInput(raw);
  if (!clean.ok) return refused({ code: 'invalid-input', fields: {} });
  const parsed = schema.safeParse(clean.value, { reportInput: true });
  if (!parsed.success)
    return refused({ code: 'invalid-input', fields: toFieldIssues(parsed.error) });
  return { ok: true, value: parsed.data };
}

/** Port errors a user can cause, as failures; anything else stays an exception. */
function portFailure(error: unknown): PipelineFailure | undefined {
  if (error instanceof Rollback) return error.failure;
  if (error instanceof StaleVersion || error instanceof TransactionConflict) {
    return { code: 'conflict' };
  }
  if (error instanceof LockTimeout) return { code: 'busy' };
  if (error instanceof ConstraintViolation) {
    return { code: 'rule', rule: CONSTRAINT_RULES[error.constraint] };
  }
  return undefined;
}

/** Steps 5–8: one transaction; a failure result always rolls back. */
async function inTransaction<T>(
  deps: AppDeps,
  ctx: TxContext,
  spec: { readonly mode: 'write' | 'read'; readonly timeouts?: object },
  work: (tx: Tx) => Promise<T>,
): Promise<Result<T, PipelineFailure>> {
  try {
    return {
      ok: true,
      value: await deps.db.transaction(ctx, { ...spec.timeouts, mode: spec.mode }, work),
    };
  } catch (error) {
    const failure = portFailure(error);
    if (failure) return refused(failure);
    throw error;
  }
}

function userOf(call: Call, name: string): UserPrincipal {
  if (call.principal.kind !== 'user') throw new Error(`${name}: runs as a signed-in user`);
  return call.principal;
}

function versionOf(resource: unknown, name: string): number {
  const version: unknown =
    typeof resource === 'object' && resource !== null && 'version' in resource
      ? resource.version
      : undefined;
  if (typeof version !== 'number') throw new Error(`${name}: the resource has no version`);
  return version;
}

/** Access checked before the transaction (step 4). */
export async function runGatePipeline<S extends StrictInput, O extends z.ZodType>(
  spec: GateUseCaseSpec<S, O>,
  call: Call,
  deps: AppDeps,
): Promise<Result<z.output<O>, PipelineFailure>> {
  const principal = userOf(call, spec.name);
  const parsed = parseInput(spec.input, call.input);
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  const now = deps.clock.now();
  const refusal = decide(spec.access.check(input), principal, now);
  if (refusal) return refused({ code: refusal });
  const ctx: TxContext = { principal, now, requestId: call.requestId };
  return inTransaction(deps, ctx, spec, async (tx) => {
    const result = await spec.execute({ ...ctx, principal, actor: principal.actor, tx }, input);
    if (!result.ok) throw new Rollback(result.error);
    return spec.output.parse(result.value);
  });
}

/**
 * Access checked on the loaded row (steps 6a–6c): visibility first, so an
 * invisible row is not-found; the version next, so a stale form is a
 * conflict; then the policy on the locked row.
 */
export async function runResourcePipeline<S extends StrictInput, O extends z.ZodType, R>(
  spec: ResourceUseCaseSpec<S, O, R>,
  call: Call,
  deps: AppDeps,
): Promise<Result<z.output<O>, PipelineFailure>> {
  const principal = userOf(call, spec.name);
  const parsed = parseInput(spec.input, call.input);
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  const now = deps.clock.now();
  const { access } = spec;
  const ctx: TxContext = { principal, now, requestId: call.requestId };
  return inTransaction(deps, ctx, spec, async (tx) => {
    const resource = await access.load(tx, input);
    if (resource === null) throw new Rollback({ code: 'not-found' });
    const expected = access.expectedVersion;
    if (expected !== 'unversioned' && versionOf(resource, spec.name) !== expected(input)) {
      throw new Rollback({ code: 'conflict' });
    }
    const refusal = decide(access.check(resource, input), principal, now);
    if (refusal) throw new Rollback({ code: refusal });
    const result = await spec.execute(
      { ...ctx, principal, actor: principal.actor, tx },
      input,
      resource,
    );
    if (!result.ok) throw new Rollback(result.error);
    return spec.output.parse(result.value);
  });
}

export async function runSystemPipeline<S extends StrictInput, O extends z.ZodType>(
  spec: SystemUseCaseSpec<S, O>,
  call: Call,
  deps: AppDeps,
): Promise<Result<z.output<O>, PipelineFailure>> {
  const { principal } = call;
  if (principal.kind !== 'system') throw new Error(`${spec.name}: runs as the system`);
  const parsed = parseInput(spec.input, call.input);
  if (!parsed.ok) return parsed;
  const now = deps.clock.now();
  const ctx: TxContext = { principal, now, requestId: call.requestId };
  return inTransaction(deps, ctx, spec, async (tx) => {
    const result = await spec.execute(
      { principal, now, requestId: call.requestId, tx },
      parsed.value,
    );
    if (!result.ok) throw new Rollback(result.error);
    return spec.output.parse(result.value);
  });
}
