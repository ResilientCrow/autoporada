import type { z } from 'zod';

import type { AppDeps } from '@/application/ports';

import type { PipelineFailure, Result } from './result';
import { runGatePipeline, runResourcePipeline, runSystemPipeline } from './run-use-case';
import type {
  Call,
  GateUseCaseSpec,
  Mode,
  ResourceUseCaseSpec,
  StrictInput,
  SystemUseCaseSpec,
} from './spec';

declare const types: unique symbol;

/** What delivery code holds: a name, its schemas and the pipeline for it. */
export interface UseCase<In, Out> {
  readonly name: string;
  readonly principal: 'user' | 'system';
  readonly mode: Mode;
  readonly input: StrictInput;
  readonly output: z.ZodType;
  /** Pipeline steps 2–8 with this use case's own types (runUseCase). */
  readonly run: (call: Call, deps: AppDeps) => Promise<Result<Out, PipelineFailure>>;
  /** Carries the input type to a caller's `(input: In) => Out`; never set. */
  readonly [types]?: (input: In) => Out;
}

/** Any use case, whatever its input and output. */
export type AnyUseCase = UseCase<never, unknown>;

const DEFINED = new WeakSet<object>();

function brand<In, Out>(useCase: UseCase<In, Out>): UseCase<In, Out> {
  DEFINED.add(useCase);
  return Object.freeze(useCase);
}

/** A use case a signed-in user runs, with its access checked at the gate or on a loaded resource. */
export function defineUseCase<S extends StrictInput, O extends z.ZodType>(
  spec: GateUseCaseSpec<S, O>,
): UseCase<z.input<S>, z.output<O>>;
export function defineUseCase<S extends StrictInput, O extends z.ZodType, R>(
  spec: ResourceUseCaseSpec<S, O, R>,
): UseCase<z.input<S>, z.output<O>>;
export function defineUseCase<S extends StrictInput, O extends z.ZodType, R>(
  spec: GateUseCaseSpec<S, O> | ResourceUseCaseSpec<S, O, R>,
): UseCase<z.input<S>, z.output<O>> {
  const run: UseCase<z.input<S>, z.output<O>>['run'] =
    'load' in spec.access
      ? (call, deps) => runResourcePipeline(spec as ResourceUseCaseSpec<S, O, R>, call, deps)
      : (call, deps) => runGatePipeline(spec as GateUseCaseSpec<S, O>, call, deps);
  return brand({
    name: spec.name,
    principal: 'user',
    mode: spec.mode,
    input: spec.input,
    output: spec.output,
    run,
  });
}

/** A use case the system runs for a named reason (sign-in callback, jobs). */
export function defineSystemUseCase<S extends StrictInput, O extends z.ZodType>(
  spec: SystemUseCaseSpec<S, O>,
): UseCase<z.input<S>, z.output<O>> {
  return brand({
    name: spec.name,
    principal: 'system',
    mode: spec.mode,
    input: spec.input,
    output: spec.output,
    run: (call, deps) => runSystemPipeline(spec, call, deps),
  });
}

/** Made by defineUseCase or defineSystemUseCase (the inventory test checks it). */
export function isUseCase(value: unknown): value is AnyUseCase {
  return typeof value === 'object' && value !== null && DEFINED.has(value);
}

/** Runs a use case: pipeline steps 2–8 (ADR 0011). */
export function runUseCase<In, Out>(
  useCase: UseCase<In, Out>,
  call: Call,
  deps: AppDeps,
): Promise<Result<Out, PipelineFailure>> {
  return useCase.run(call, deps);
}
