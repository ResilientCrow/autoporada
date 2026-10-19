import { createHash, randomBytes } from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** 256 random bits, base64url (43 characters): session cookies, state, nonce, PKCE verifier. */
export const newToken = (): string => randomBytes(32).toString('base64url');

export const isToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN.test(value);

/** What the database stores instead of a token: its SHA-256, 64 lower-case hex characters. */
export const digest = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');
