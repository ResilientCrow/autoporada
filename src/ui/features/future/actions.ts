import type { z } from 'zod';

import type {
  createFutureInput,
  createFutureOutput,
  getFutureInput,
  getFutureOutput,
  retractFutureInput,
  retractFutureOutput,
  saveFutureInput,
  saveFutureOutput,
  ServerAction,
  submitFutureInput,
  submitFutureOutput,
} from '@/contracts';

import type { CancelFutureAction, DecideFutureAction } from './review-calls';

export type CreateFutureAction = ServerAction<
  z.input<typeof createFutureInput>,
  z.output<typeof createFutureOutput>
>;
export type SaveFutureAction = ServerAction<
  z.input<typeof saveFutureInput>,
  z.output<typeof saveFutureOutput>
>;
export type SubmitFutureAction = ServerAction<
  z.input<typeof submitFutureInput>,
  z.output<typeof submitFutureOutput>
>;
export type RetractFutureAction = ServerAction<
  z.input<typeof retractFutureInput>,
  z.output<typeof retractFutureOutput>
>;
/** What the editor asks after a conflict: the item's version and whether it may still be saved. */
export type FutureStatusAction = ServerAction<
  z.input<typeof getFutureInput>,
  z.output<typeof getFutureOutput>
>;

/** The actions the screen's parts are made from. */
export interface FutureActions {
  readonly saveFuture: SaveFutureAction;
  readonly submitFuture: SubmitFutureAction;
  readonly getFuture: FutureStatusAction;
  readonly retractFuture: RetractFutureAction;
  readonly decideFuture: DecideFutureAction;
  readonly cancelFuture: CancelFutureAction;
}
