import type { Clock } from '@/application/ports';

export {
  assertOutsideTransaction,
  inTransactionScope,
  insideTransaction,
} from './transaction-scope';

/** The wall clock of the server. */
export const systemClock: Clock = { now: () => new Date() };
