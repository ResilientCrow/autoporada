import type { z } from 'zod';

import type {
  ActionResult,
  retractPointInput,
  ServerAction,
  withdrawPointInput,
  retractPointOutput,
  withdrawPointOutput,
} from '@/contracts';
import type { AuthorMove } from '@/domain/review';
import { flagOf, type FormState, type SaveAnswer } from '@/ui/form';

import { saveAnswer } from './answers';
import { bannerOwns } from './submit-outcome';

export type RetractPointAction = ServerAction<
  z.input<typeof retractPointInput>,
  z.output<typeof retractPointOutput>
>;
export type WithdrawPointAction = ServerAction<
  z.input<typeof withdrawPointInput>,
  z.output<typeof withdrawPointOutput>
>;

/** What the page hands the screen: the buttons that may show, and the actions behind them. */
export interface PointMoves {
  readonly events: readonly AuthorMove[];
  readonly retractPoint: RetractPointAction;
  readonly withdrawPoint: WithdrawPointAction;
}

/** „Stáhnout“: the point and the version the page showed. */
export const retractInput = (id: string, version: number) => ({ id, expectedVersion: version });

/** „Zrušit bod“: the same, with the checkbox as it stands (the server refuses an unticked one). */
export const withdrawInput = (id: string, version: number, data: FormData) => ({
  id,
  expectedVersion: version,
  confirmed: flagOf(data, 'confirmed'),
});

/** The autosave runner's after-the-flush primitive (`useAutosave().afterLanded`). */
export type Around = (
  send: (expectedVersion: number) => Promise<SaveAnswer>,
) => Promise<SaveAnswer | null>;

const BUSY = { ok: false, error: { code: 'busy' } } as const;

/**
 * Makes `call` once everything typed has been saved, with the version it landed on, so a pending
 * autosave never turns the move into a conflict. The runner is told how the call went (a conflict
 * becomes its banner); the form gets the server's own answer. A banner holding the editor sends
 * nothing and reads as busy; a call that throws is the form's network problem.
 */
export async function sentAfterFlush<Out extends { readonly version: number }>(
  around: Around,
  call: (expectedVersion: number) => Promise<ActionResult<Out>>,
): Promise<ActionResult<Out>> {
  const box: { result: ActionResult<Out> | null; thrown: boolean } = {
    result: null,
    thrown: false,
  };
  await around(async (expectedVersion) => {
    try {
      box.result = await call(expectedVersion);
    } catch {
      box.thrown = true;
      return { kind: 'failed' };
    }
    return saveAnswer(box.result);
  });
  if (box.result !== null) return box.result;
  if (box.thrown) throw new Error('transition.network');
  return BUSY;
}

/**
 * The action as a form should call it: unchanged on a read view, and in the editor sent after
 * the flush with the version the save landed on instead of the one the form was made with.
 */
export function throughFlush<
  In extends { readonly expectedVersion: number },
  Out extends { readonly version: number },
>(action: ServerAction<In, Out>, around: Around | undefined): ServerAction<In, Out> {
  if (around === undefined) return action;
  return (input) =>
    sentAfterFlush(around, (expectedVersion) => action({ ...input, expectedVersion }));
}

/**
 * What the form shows of its answer. In the editor (`around` set) the autosave banners own a
 * conflict, a moved state, a missing point and a lost session, exactly as for the submit
 * (`bannerOwns`): the form shows no second alert and focus stays. Field issues, busy, rate limits
 * and network problems stay on the form; so does everything on a read view, where no banner exists.
 */
export function quietedBy(around: Around | undefined, state: FormState): FormState {
  if (around === undefined || state.problem === null || !bannerOwns(state.problem)) return state;
  return { ...state, problem: null };
}
