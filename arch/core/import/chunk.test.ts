import { describe, expect, it } from 'vitest';
import { loadChunk } from './chunk';
import { importMessage, ImportError } from './messages';

describe('loadChunk', () => {
  it('hands on what the import gives', async () => {
    expect(await loadChunk(() => Promise.resolve(7))).toBe(7);
  });

  it('turns a chunk that cannot be fetched into the stale-page error, with its own sentence', async () => {
    const err = await loadChunk(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).code).toBe('stale');
    expect(importMessage(err as ImportError)).toBe('Aplikace se mezitím aktualizovala. Obnovte stránku a vyberte soubor znovu.');
  });
});
