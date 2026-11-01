import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { failureDigest, FAILURE_CAUSES } from '@/contracts';
import { cs } from '@/ui/copy';
import { Button } from '@/ui/kit';

import PageError from './error';

type Props = { readonly children?: ReactNode; readonly onPress?: () => void };

function findButton(node: ReactNode): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) {
    return Array.isArray(node) ? node.map(findButton).find(Boolean) : undefined;
  }
  return node.type === Button ? node : findButton(node.props.children);
}

/** What Next hands the boundary for a server error: an Error with a digest. */
function serverError(
  digest: string,
  message = 'An error occurred in the Server Components render.',
) {
  return Object.assign(new Error(message), { digest });
}

describe('error.tsx', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(FAILURE_CAUSES)('names the %s cause from the digest, with no code', (cause) => {
    const html = renderToStaticMarkup(
      <PageError error={serverError(failureDigest(cause))} retry={() => {}} />,
    );
    expect(html).toContain(cs.appError.title);
    expect(html).toContain(cs.failures[cause]);
    expect(html).not.toContain(cs.app.errorCode);
  });

  it.each([
    ['a digest of Next’s own', serverError('1234567890')],
    ['no digest', new Error('boom')],
    ['a thrown string', 'boom'],
    ['nothing', undefined],
  ])('takes %s for a bug', (_name, error) => {
    const html = renderToStaticMarkup(<PageError error={error} retry={() => {}} />);
    expect(html).toContain(cs.failures.bug);
  });

  it('keeps the shell’s frame around the failure, as the 404 page does', () => {
    const html = renderToStaticMarkup(<PageError error={undefined} retry={() => {}} />);
    expect(html).toContain(cs.shell.brand);
    expect(html).toContain('id="obsah"');
  });

  it('uses no inline style, which the CSP would refuse', () => {
    const html = renderToStaticMarkup(<PageError error={undefined} retry={() => {}} />);
    expect(html).not.toMatch(/style=/i);
  });

  it('asks the server again when the user retries', () => {
    const retry = vi.fn();
    findButton(PageError({ error: undefined, retry }))?.props.onPress?.();
    expect(retry).toHaveBeenCalledOnce();
  });

  describe('technical line', () => {
    const shown = (error: unknown) =>
      renderToStaticMarkup(<PageError error={error} retry={() => {}} />);

    it('shows the error message in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(shown(serverError(failureDigest('bug'), 'points.get: bug'))).toContain(
        `${cs.app.technical} points.get: bug`,
      );
    });

    it.each(['production', 'test'])('never shows it in %s', (env) => {
      vi.stubEnv('NODE_ENV', env);
      const html = shown(serverError(failureDigest('bug'), 'points.get: bug'));
      expect(html).not.toContain(cs.app.technical);
      expect(html).not.toContain('points.get');
    });

    it('shows nothing technical in development for a thrown non-error', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(shown('boom')).not.toContain(cs.app.technical);
    });
  });
});
