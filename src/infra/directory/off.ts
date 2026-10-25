import type { DirectoryPort } from '@/application/ports';

/** Search is switched off: every query answers so, and nothing is read or sent anywhere. */
export function createOffDirectory(): DirectoryPort {
  return { search: () => Promise.resolve({ ok: false, code: 'directory.off' }) };
}
