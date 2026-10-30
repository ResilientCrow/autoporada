import type { FormState } from './context';

/**
 * The answer as a decision's form shows it. A refusal means the item moved out of the viewer's
 * reach (a role changed, the item went elsewhere), so it reads as the item being gone, with the
 * reload the not-found problem offers; a conflict keeps its own text and reload.
 */
export function refusalAsGone(state: FormState): FormState {
  if (state.problem?.code !== 'forbidden') return state;
  return { ...state, problem: { code: 'not-found' } };
}
