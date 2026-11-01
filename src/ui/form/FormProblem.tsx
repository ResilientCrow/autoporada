'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode, Ref } from 'react';

import { app, errors, failures, problemActions, rules } from '@/ui/copy';
import { Notice, TextLink } from '@/ui/kit';

import { retryAfterText, type Problem } from './settle';

function textOf(problem: Problem, readOnly: boolean): string {
  if (problem.code === 'rule') return rules[problem.rule];
  if (problem.code === 'rate-limited') {
    return `${errors['rate-limited']} ${problemActions.retry} ${retryAfterText(problem.retryAfterSeconds)}.`;
  }
  if (problem.code === 'unavailable') {
    // A failure always rolls back (ADR 0011), so a write says its changes were not saved.
    const cause = failures[problem.cause];
    return readOnly ? cause : `${errors.unavailable} ${cause}`;
  }
  return errors[problem.code];
}

/**
 * A sign-in page opens in a new tab so the typed text stays; a plain link, since
 * /auth/* is not a page. It returns to the path alone: a query can hold a search
 * that names people, which the sign-in URL would put in the server log and the
 * stored sign-in.
 */
function SignInLink({ path, label, pathname }: { path: string; label: string; pathname: string }) {
  return (
    <>
      <a href={`${path}?returnTo=${encodeURIComponent(pathname)}`} target="_blank" rel="noopener">
        {label}
      </a>{' '}
      {problemActions.returnHint}
    </>
  );
}

function actionOf(problem: Problem, pathname: string, location: string): ReactNode {
  if (problem.code === 'unauthenticated') {
    return <SignInLink path="/auth/login" label={problemActions.signIn} pathname={pathname} />;
  }
  if (problem.code === 'step-up-required') {
    return <SignInLink path="/auth/step-up" label={problemActions.stepUp} pathname={pathname} />;
  }
  if (problem.code === 'conflict' || problem.code === 'not-found') {
    return <TextLink href={location}>{problemActions.reload}</TextLink>;
  }
  return null;
}

/**
 * Says what went wrong besides field issues, and what to do about it. The outer
 * element can take focus (see `Form`); the nested notice is what is announced,
 * as in `ErrorSummary`.
 */
export function FormProblem({
  problem,
  focusRef,
  readOnly = false,
}: {
  readonly problem: Problem;
  readonly focusRef?: Ref<HTMLDivElement>;
  /** The form's action only reads: no „Změny se neuložily“. */
  readonly readOnly?: boolean;
}) {
  // Both are available on the server here: every route is dynamic, so no Suspense boundary is needed.
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // The reload stays on this page, query and all; a sign-in returns to the path only.
  const action = actionOf(problem, pathname, search === '' ? pathname : `${pathname}?${search}`);
  return (
    <div ref={focusRef} tabIndex={-1}>
      <Notice tone="problem">
        <p>{textOf(problem, readOnly)}</p>
        {problem.code === 'unavailable' && problem.detail !== undefined ? (
          <p className="font-mono text-sm break-words">
            {app.technical} {problem.detail}
          </p>
        ) : null}
        {action === null ? null : <p>{action}</p>}
      </Notice>
    </div>
  );
}
