import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import GlobalError from './global-error';
import RootLayout from './layout';
import NotFound from './not-found';

vi.mock('next/server', () => ({ connection: async () => {} }));

type Props = {
  readonly children?: ReactNode;
  readonly suppressHydrationWarning?: boolean;
  readonly href?: string;
};

function find(node: ReactNode, type: string): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) {
    return Array.isArray(node) ? node.map((n) => find(n, type)).find(Boolean) : undefined;
  }
  return node.type === type ? node : find(node.props.children, type);
}

/*
 * Browser extensions write classes and attributes onto <html> and <body> before React hydrates
 * (the user saw `className=" idc0_343 …"`); the server never sends them, so the root elements
 * accept a mismatch in their own attributes. It does not reach their children.
 */
describe('root elements', () => {
  it('the layout tolerates attributes an extension adds', async () => {
    const tree = await RootLayout({ children: null });
    expect(find(tree, 'html')?.props.suppressHydrationWarning).toBe(true);
    expect(find(tree, 'body')?.props.suppressHydrationWarning).toBe(true);
  });

  it('the global error page does too', () => {
    const tree = GlobalError({ error: undefined, retry: () => {} });
    expect(find(tree, 'html')?.props.suppressHydrationWarning).toBe(true);
    expect(find(tree, 'body')?.props.suppressHydrationWarning).toBe(true);
  });
});

describe('the pages of the shell', () => {
  it('both take the Arch stylesheet, the only style there is', () => {
    expect(find(NotFound(), 'link')?.props.href).toMatch(/^\/arch\/app\.css\?v=/);
    expect(find(GlobalError({ error: undefined, retry: () => {} }), 'link')?.props.href).toBe(
      '/arch/app.css',
    );
  });
});
