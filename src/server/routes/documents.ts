import { downloadDocument } from '@/application/use-cases';
import type { ErrorCode } from '@/contracts';

import type { RouteContext, RouteSpec } from '../pipeline';

const TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const;

const isFormat = (value: unknown): value is keyof typeof TYPES =>
  value === 'docx' || value === 'pdf';

const status = (code: number) => new Response(null, { status: code });

/** Where a download another site started lands instead: the archive, one click from the file. */
const ARCHIVE = '/porada/archiv';

/** A refusal as a status: a wrong date or a missing file is just not there. */
function refusal(code: ErrorCode): Response {
  if (code === 'unauthenticated') return status(401);
  if (code === 'forbidden') return status(403);
  if (code === 'not-found' || code === 'invalid-input') return status(404);
  if (code === 'rate-limited') return status(429);
  return status(500);
}

async function download(request: Request, ctx: RouteContext): Promise<Response> {
  // Next answers HEAD with GET; a HEAD sends no file, so it must not audit a download.
  if (request.method !== 'GET')
    return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  // The session cookie is SameSite=Lax: a link on another site would download, and audit, in the
  // reader's name (ADR 0039). The return from the sign-in also comes cross-site, hence a redirect.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response(null, { status: 303, headers: { Location: ARCHIVE } });
  }
  const { datum, format } = await ctx.params;
  if (typeof datum !== 'string' || !isFormat(format)) return status(404);
  const result = await ctx.run(downloadDocument, { monday: datum, format });
  if (!result.ok) return refusal(result.error.code);
  const { bytes, fileName } = result.data;
  // A copy on an ArrayBuffer of its own: the driver's Buffer may be a view into a shared pool.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': TYPES[format],
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * `GET /porada/[datum]/dokument/[format]` (ADR 0038): the DOCX or the PDF of a generated porada,
 * as an attachment. The use case checks `archive.view` and audits the download.
 */
export const documentRouteSpec: RouteSpec = {
  name: 'documents.download',
  access: 'session',
  rateLimit: 'admin',
  handle: (request, ctx) => download(request, ctx),
};
