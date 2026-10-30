import { describe, expect, it } from 'vitest';

import type { FormState } from './context';
import { refusalAsGone } from './refusal';

describe('what the form of a decision shows of an answer', () => {
  const state = (problem: FormState['problem']): FormState => ({
    issues: null,
    problem,
    attempt: 1,
    submitting: null,
    onSubmit: () => undefined,
  });

  it('reads a refusal as the point being gone, with its reload', () => {
    expect(refusalAsGone(state({ code: 'forbidden' })).problem).toEqual({ code: 'not-found' });
  });

  it('keeps every other answer as it came', () => {
    for (const problem of [
      { code: 'conflict' },
      { code: 'not-found' },
      { code: 'busy' },
      { code: 'network' },
      null,
    ] as const) {
      expect(refusalAsGone(state(problem)).problem).toEqual(problem);
    }
  });
});
