/**
 * Branch arch-ui only: `/` serves the Arch UI, a client app that reads and writes through /api/arch.
 * Signed out, it shows its own sign-in screen, whose button starts the real Microsoft sign-in.
 */
import { NONCE_HEADER } from '../http';
import type { RouteSpec } from '../pipeline';

/** Busts the browser cache of the client bundle once per server start. */
const BUILD = Date.now().toString(36);

export const archPageSpec: RouteSpec = {
  name: 'arch.page',
  access: 'public',
  rateLimit: 'none',
  handle(request) {
    const nonce = request.headers.get(NONCE_HEADER) ?? '';
    const v = BUILD;
    const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autoporada</title><link rel="icon" href="/arch/sign-dark.svg"><link rel="stylesheet" href="/arch/app.css?v=${v}"></head><body><div id="root"></div><script nonce="${nonce}" src="/arch/app.js?v=${v}"></script></body></html>`;
    return Promise.resolve(
      new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );
  },
};
