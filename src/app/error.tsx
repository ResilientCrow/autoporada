'use client';

import { causeOfError } from '@/contracts';
import { app, appError, failures, pageTitle } from '@/ui/copy';
import { Button, SlantLabel } from '@/ui/kit';
import { Shell } from '@/ui/shell';

/**
 * A page that failed to render (ADR 0044). It replaces the page, not the root layout, so
 * the CSP nonce is there; the shell is not, since each page renders its own, so it shows
 * the visitor's frame as the 404 page does. It names the cause from the digest the page
 * loader gave the error, `bug` for any other. In development only, the error's message
 * follows; a production build never renders it. `retry` asks the server again.
 */
export default function PageError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}) {
  const cause = causeOfError(error);
  const technical =
    process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : null;
  return (
    <Shell>
      <title>{pageTitle(appError.title)}</title>
      <SlantLabel level={1}>{appError.title}</SlantLabel>
      <p>{failures[cause]}</p>
      {technical === null ? null : (
        <p className="font-mono text-sm break-words">
          {app.technical} {technical}
        </p>
      )}
      <div>
        <Button onPress={() => retry()}>{appError.retry}</Button>
      </div>
    </Shell>
  );
}
