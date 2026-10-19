export { diffRecords, type AuditShape, type FieldRule } from './audit-diff';
export {
  defineSystemUseCase,
  defineUseCase,
  isUseCase,
  runUseCase,
  type AnyUseCase,
  type UseCase,
} from './define-use-case';
export { fromTransition } from './failure';
export {
  fail,
  ok,
  type Outcome,
  type PipelineFailure,
  type Result,
  type UseCaseFailure,
} from './result';
export type {
  Call,
  GateAccess,
  Mode,
  ResourceAccess,
  StrictInput,
  SystemContext,
  UserContext,
} from './spec';
