import type { ActionError, ActionResult, FieldIssues } from '@/contracts';

/**
 * What a form shows above its fields besides field issues: any error but
 * `invalid-input` with fields, `invalid-input` with none (nothing to point at),
 * and `network` (the action promise rejected).
 */
export type Problem =
  | Exclude<ActionError, { readonly code: 'invalid-input' }>
  | { readonly code: 'invalid-input' }
  | { readonly code: 'network' };

export type Settled<Out> =
  | { readonly kind: 'ok'; readonly value: Out }
  | { readonly kind: 'issues'; readonly issues: FieldIssues }
  | { readonly kind: 'problem'; readonly problem: Problem };

function problem(value: Problem): Settled<never> {
  return { kind: 'problem', problem: value };
}

/** Turns a result, or a rejected action (`'network'`), into one of three cases. */
export function settle<Out>(result: ActionResult<Out> | 'network'): Settled<Out> {
  if (result === 'network') return problem({ code: 'network' });
  if (result.ok) return { kind: 'ok', value: result.data };
  const error = result.error;
  switch (error.code) {
    case 'invalid-input':
      return Object.keys(error.fields).length === 0
        ? problem({ code: 'invalid-input' })
        : { kind: 'issues', issues: error.fields };
    case 'unauthenticated':
    case 'step-up-required':
    case 'forbidden':
    case 'not-found':
    case 'conflict':
    case 'busy':
    case 'rule':
    case 'rate-limited':
    case 'unavailable':
      return problem(error);
    default: {
      const unhandled: never = error;
      throw new Error(`Unhandled error code: ${JSON.stringify(unhandled)}`);
    }
  }
}

const MINUTES_LIMIT = 90;

/** „za 12 minut“ / „za 2 hodiny“, with a no-break space after the number. */
export function retryAfterText(seconds: number): string {
  const format = new Intl.RelativeTimeFormat('cs', { numeric: 'auto' });
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const text =
    minutes < MINUTES_LIMIT
      ? format.format(minutes, 'minute')
      : format.format(Math.ceil(seconds / 3600), 'hour');
  return text.replaceAll(/(\d) /g, '$1\u{A0}');
}
