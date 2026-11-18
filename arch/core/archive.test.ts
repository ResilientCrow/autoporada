import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentModel } from '@/document/model';
import { createArchive } from './archive';

const MODEL = { sections: [] } as unknown as DocumentModel;
const reply = (body: unknown) => ({ json: async () => body }) as Response;
const ok = (data: unknown) => reply({ ok: true, data });
const refused = (code: string) => reply({ ok: false, error: { code } });
const stub = (...answers: (Response | Error)[]) => {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const a = answers.shift();
    if (!a) throw new Error('unexpected call');
    if (a instanceof Error) throw a;
    return a;
  });
  return { fn, archive: createArchive(fn as unknown as typeof fetch) };
};
const sent = (fn: ReturnType<typeof stub>['fn'], i = 0) => JSON.parse(String(fn.mock.calls[i]![1]!.body)) as unknown;

afterEach(() => vi.unstubAllGlobals());

describe('document', () => {
  it('reads a porada through documents.read and answers ready', async () => {
    const { fn, archive } = stub(ok({ at: 'x', model: MODEL, points: 4 }));
    expect(await archive.document('2026-10-12', 'a')).toEqual({ state: 'ready', model: MODEL, points: 4 });
    expect(fn).toHaveBeenCalledWith('/api/arch/run', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
    expect(sent(fn)).toEqual({ name: 'documents.read', input: { monday: '2026-10-12' } });
  });

  it('asks once per monday and version, then answers from the cache', async () => {
    const { fn, archive } = stub(ok({ at: 'x', model: MODEL, points: 4 }));
    expect(archive.peekDocument('2026-10-12', 'a')).toBeUndefined();
    await archive.document('2026-10-12', 'a');
    await archive.document('2026-10-12', 'a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(archive.peekDocument('2026-10-12', 'a')).toMatchObject({ state: 'ready', points: 4 });
  });

  it('shares one call between readers who ask while it is in flight', async () => {
    const { fn, archive } = stub(ok({ at: 'x', model: MODEL, points: 1 }));
    await Promise.all([archive.document('2026-10-12', 'a'), archive.document('2026-10-12', 'a')]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('asks again for the same monday under another version', async () => {
    const { fn, archive } = stub(ok({ at: 'x', model: MODEL, points: 1 }), ok({ at: 'y', model: MODEL, points: 2 }));
    await archive.document('2026-10-12', 'a');
    expect(await archive.document('2026-10-12', 'b')).toMatchObject({ points: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('answers missing for not-found and keeps that answer', async () => {
    const { fn, archive } = stub(refused('not-found'));
    expect(await archive.document('2026-10-12', 'a')).toEqual({ state: 'missing' });
    expect(await archive.document('2026-10-12', 'a')).toEqual({ state: 'missing' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a refusal', () => refused('unavailable')],
    ['a network error', () => new Error('offline')],
    ['an answer that is not JSON', () => ({ json: async () => { throw new SyntaxError('x'); } }) as unknown as Response],
    ['an answer without a model', () => ok({ at: 'x', points: 3 })],
    ['an answer without a count', () => ok({ at: 'x', model: MODEL })],
  ])('answers failed for %s, and does not keep it', async (_name, bad) => {
    const { fn, archive } = stub(bad(), ok({ at: 'x', model: MODEL, points: 2 }));
    expect(await archive.document('2026-10-12', 'a')).toEqual({ state: 'failed' });
    expect(archive.peekDocument('2026-10-12', 'a')).toBeUndefined();
    expect(await archive.document('2026-10-12', 'a')).toMatchObject({ state: 'ready', points: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('sends a signed-out reader to the front page', async () => {
    const loc = { href: '/#/archiv' };
    vi.stubGlobal('location', loc);
    const { archive } = stub(refused('unauthenticated'));
    expect(await archive.document('2026-10-12', 'a')).toEqual({ state: 'failed' });
    expect(loc.href).toBe('/');
  });

  it('remembers the model a screen had, until the read answers', () => {
    const { archive } = stub();
    expect(archive.known('2026-10-12')).toBeUndefined();
    archive.remember('2026-10-12', MODEL, 5);
    expect(archive.known('2026-10-12')).toEqual({ state: 'ready', model: MODEL, points: 5 });
  });

  it('remembers what a read answered', async () => {
    const { archive } = stub(ok({ at: 'x', model: MODEL, points: 2 }));
    await archive.document('2026-10-12', 'a');
    expect(archive.known('2026-10-12')).toMatchObject({ points: 2 });
  });
});

describe('list', () => {
  const docs = [
    { monday: '2026-10-19', points: 3, titles: ['a', 'b', 'c'] },
    { monday: '2026-10-12', points: 1, titles: ['d'] },
  ];

  it('reads documents.list once per key and maps it by monday', async () => {
    const { fn, archive } = stub(ok({ documents: docs }));
    const r = await archive.list('k1');
    expect(r.state).toBe('ready');
    expect(r.state === 'ready' && r.byMonday.get('2026-10-12')).toEqual({ points: 1, titles: ['d'] });
    expect(sent(fn)).toEqual({ name: 'documents.list', input: {} });
    await archive.list('k1');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(archive.peekList('k1')?.state).toBe('ready');
  });

  it('reads again under a new key, and offers the last list meanwhile', async () => {
    const { fn, archive } = stub(ok({ documents: docs }), ok({ documents: docs.slice(0, 1) }));
    await archive.list('k1');
    expect(archive.peekList('k2')).toBeUndefined();
    expect(archive.lastList().size).toBe(2);
    await archive.list('k2');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(archive.lastList().size).toBe(1);
  });

  it.each([
    ['a refusal', () => refused('unavailable')],
    ['a network error', () => new Error('offline')],
    ['an answer of the wrong shape', () => ok({ documents: [{ monday: 1 }] })],
  ])('answers failed for %s, and tries again next time', async (_name, bad) => {
    const { fn, archive } = stub(bad(), ok({ documents: docs }));
    expect(await archive.list('k1')).toEqual({ state: 'failed' });
    expect(archive.peekList('k1')).toBeUndefined();
    expect((await archive.list('k1')).state).toBe('ready');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
