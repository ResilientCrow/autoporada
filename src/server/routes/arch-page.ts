/**
 * Branch arch-ui only: `/` serves the Arch UI, a client app that reads and writes through /api/arch.
 * Signed out, it shows its own sign-in screen, whose button starts the real Microsoft sign-in.
 */
import { contentSecurityPolicy, isNonce, newNonce, NONCE_HEADER } from '../http';
import type { RouteSpec } from '../pipeline';

/** Busts the browser cache of the client bundle once per server start. */
const BUILD = Date.now().toString(36);

/** The Arch stylesheet, which the Next shell's own pages (not-found, global error) link too. */
export const ARCH_STYLESHEET = `/arch/app.css?v=${BUILD}`;

export const archPageSpec: RouteSpec = {
  name: 'arch.page',
  access: 'public',
  rateLimit: 'none',
  handle(request) {
    // The proxy overwrites the header with its own nonce. If it did not run, the header is the
    // client's: print it only if it has the exact shape of a nonce, else make one, so nothing
    // unchecked reaches the markup and the page never goes out without a policy.
    // NODE_ENV is a constant Next inlines at build time, read like the proxy reads it
    // (config is otherwise read only in src/infra/config, ADR 0004).
    // eslint-disable-next-line no-restricted-properties
    const dev = process.env.NODE_ENV === 'development';
    const sent = request.headers.get(NONCE_HEADER);
    const nonce = sent !== null && isNonce(sent) ? sent : newNonce();
    const v = BUILD;
    const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autoporada</title><link rel="icon" href="/arch/sign-dark.svg"><link rel="stylesheet" href="${ARCH_STYLESHEET}"></head><body><div id="root"></div><script type="module" nonce="${nonce}" src="/arch/app.js?v=${v}"></script></body></html>`;
    return Promise.resolve(
      new Response(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          // The same policy the proxy sets (same nonce), here too so a skipped proxy is no gap.
          'content-security-policy': contentSecurityPolicy(nonce, { dev }),
        },
      }),
    );
  },
};
