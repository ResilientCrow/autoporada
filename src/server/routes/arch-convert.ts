/**
 * Branch arch-ui only: POST /api/arch/convert. The annex editor reads a Word, OpenDocument or PDF
 * file in the browser; an old Word `.doc` it cannot read there, so it sends the bytes here and
 * gets a PDF back to read (ADR 0066). Headmaster only. Nothing is stored or audited, and the log
 * carries the converter's code, never the file or its text.
 */
import type { DocumentConverter } from '@/application/ports';
import { can } from '@/domain/policy';

import type { Log } from '../log';
import type { RouteSpec } from '../pipeline';
import type { RateLimiter } from '../rate-limit';
import { json, rateLimited } from './arch-http';

/** What the route needs beyond the pipeline; the container has all three. */
export interface ArchConvertDeps {
  readonly converter: DocumentConverter;
  readonly limiter: RateLimiter;
  readonly log: Log;
}

/** Decimal, like Caddy's `10MB` and the browser's own cap (ADR 0066). */
export const MAX_DOC_BYTES = 10_000_000;

/** The header of an OLE compound file, which every `.doc` is. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** The stream a Word document keeps its text in, as the compound file's directory spells it. */
const WORD_STREAM = Buffer.from('WordDocument', 'utf16le');

/** An OLE file with a `WordDocument` stream: a `.doc`, not an `.xls` or an installer. */
const isWordDocument = (bytes: Uint8Array) =>
  OLE_MAGIC.every((b, i) => bytes[i] === b) &&
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(WORD_STREAM);

/** One conversion at a time per process: LibreOffice is slow, and the file is untrusted. */
let converting = false;

/** The body, or null once it passes the cap (the rest is cancelled unread). */
async function boundedBytes(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DOC_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function archConvertSpec(deps: () => ArchConvertDeps): RouteSpec {
  return {
    name: 'arch.convert',
    access: 'session',
    rateLimit: 'none',
    async handle(request, ctx) {
      const actor = ctx.principal!.actor;
      if (!can(actor, { action: 'issue.edit' }))
        return json({ ok: false, error: { code: 'forbidden' } }, 403);
      const { converter, limiter, log } = deps();
      const decision = limiter.take('import', actor.id);
      if (!decision.ok) return rateLimited(decision.retryAfterMs);
      const declared = Number(request.headers.get('content-length'));
      if (!declared || declared > MAX_DOC_BYTES)
        return json({ ok: false, error: { code: 'too-long' } }, 413);
      // Taken before the body is read, so a burst cannot hold several 10 MB buffers either.
      if (converting) return rateLimited(BUSY_RETRY_MS);
      converting = true;
      try {
        return await convert(request, ctx.requestId, converter, log);
      } finally {
        converting = false;
      }
    },
  };
}

/** What a client that meets another conversion is told to wait. */
const BUSY_RETRY_MS = 5_000;

async function convert(
  request: Request,
  requestId: string,
  converter: DocumentConverter,
  log: Log,
): Promise<Response> {
  const doc = await boundedBytes(request);
  if (doc === null) return json({ ok: false, error: { code: 'too-long' } }, 413);
  if (!isWordDocument(doc)) return json({ ok: false, error: { code: 'invalid' } }, 400);
  const result = await converter.docToPdf(doc);
  if (!result.ok) {
    log.warn({ name: 'arch.convert', reqId: requestId, code: result.code }, 'convert failed');
    return json({ ok: false, error: { code: 'convert-failed' } }, 502);
  }
  return new Response(result.pdf as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      // Never shown as a page, whatever the converter returned.
      'content-disposition': 'attachment; filename="annex.pdf"',
      'content-security-policy': 'sandbox',
    },
  });
}
