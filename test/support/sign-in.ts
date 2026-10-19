import { createHash } from 'node:crypto';

/** Digests and tokens shaped like the server's, for the auth use-case tests. */
export const sha = (text: string) => createHash('sha256').update(text).digest('hex');
export const token = (char: string) => char.repeat(43);

export const beginInput = (cookie = 'cookie', returnTo = '/porada') => ({
  cookieSha256: sha(cookie),
  state: token('S'),
  nonce: token('N'),
  codeVerifier: token('V'),
  returnTo,
});
