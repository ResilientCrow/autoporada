import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CspNonce } from './csp-nonce';

const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA==';

describe('CspNonce', () => {
  it('renders one meta carrying the nonce', () => {
    const html = renderToStaticMarkup(<CspNonce nonce={NONCE} />);
    expect(html).toBe(`<meta name="csp-nonce" nonce="${NONCE}"/>`);
  });

  it('renders nothing without a nonce', () => {
    expect(renderToStaticMarkup(<CspNonce nonce={null} />)).toBe('');
  });
});
