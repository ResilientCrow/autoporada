import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs } from '@/ui/copy';

import GlobalError from './global-error';

type Props = { readonly children?: ReactNode; readonly onClick?: () => void };

function find(node: ReactNode, type: string): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) {
    return Array.isArray(node) ? node.map((n) => find(n, type)).find(Boolean) : undefined;
  }
  return node.type === type ? node : find(node.props.children, type);
}

describe('GlobalError', () => {
  it('uses no inline style, which the CSP would refuse', () => {
    const html = renderToStaticMarkup(<GlobalError retry={() => {}} />);
    expect(html).toContain(cs.appError.title);
    expect(html).not.toMatch(/style/i);
  });

  it('uses no React Aria, whose runtime style would find no nonce here', () => {
    const html = renderToStaticMarkup(<GlobalError retry={() => {}} />);
    expect(html).not.toContain('data-rac');
    expect(html).toMatch(/<button type="button" class="[^"]+">/);
  });

  it('asks the server again when the user retries', () => {
    const retry = vi.fn();
    find(GlobalError({ retry }), 'button')?.props.onClick?.();
    expect(retry).toHaveBeenCalledOnce();
  });
});
