'use client';

import { gallery } from '@/ui/copy';
import { FormProblem, type Problem } from '@/ui/form';

const { code } = gallery.problems;

const PROBLEMS: readonly Problem[] = [
  { code: 'invalid-input' },
  { code: 'unauthenticated' },
  { code: 'step-up-required' },
  { code: 'forbidden' },
  { code: 'not-found' },
  { code: 'conflict' },
  { code: 'busy' },
  { code: 'rule', rule: 'last-headmaster' },
  { code: 'rate-limited', retryAfterSeconds: 720 },
  { code: 'unavailable', requestId: 'abcdef12-3456' },
  { code: 'network' },
];

/** One static problem notice per code, so the checks see all of the copy. */
export function ProblemDemos() {
  return (
    <div className="flex flex-col gap-4">
      {PROBLEMS.map((problem) => (
        <div key={problem.code} className="flex flex-col gap-1">
          <h3 className="font-bold">{code[problem.code]}</h3>
          <FormProblem problem={problem} />
        </div>
      ))}
    </div>
  );
}
