import { ImportError } from './messages';

/** Asks the server to turn a .doc into a PDF (`POST /api/arch/convert`); nothing is stored there. */
export async function convertDocWith(fetchFn: typeof fetch, bytes: Uint8Array): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetchFn('/api/arch/convert', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/msword' }, redirect: 'manual', body: bytes as BodyInit });
  } catch (e) { throw new ImportError('doc-failed', undefined, { cause: e }); }
  if (res.ok && (res.headers.get('content-type') ?? '').startsWith('application/pdf')) return new Uint8Array(await res.arrayBuffer());
  // A proxy's 413 page is no JSON; the status alone says the file is too big.
  if (res.status === 413) throw new ImportError('file-too-big');
  // The same two answers the write queue and the state read act on (react.tsx): the page then goes to sign in.
  if (res.status === 401 || res.type === 'opaqueredirect') throw new ImportError('signed-out');
  const out = (await res.json().catch(() => null)) as { error?: { code?: string; retryAfterSeconds?: number } } | null;
  const code = out?.error?.code;
  if (code === 'unauthenticated') throw new ImportError('signed-out');
  if (code === 'step-up-required') throw new ImportError('step-up');
  if (code === 'rate-limited') throw new ImportError('rate-limited', out?.error?.retryAfterSeconds);
  throw new ImportError(code === 'too-long' ? 'file-too-big' : 'doc-failed');
}
