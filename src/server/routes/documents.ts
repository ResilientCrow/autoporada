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

/** A refusal as a status: a wrong date or a missing file is just not there. */
function refusal(code: ErrorCode): Response {
  if (code === 'unauthenticated') return status(401);
  if (code === 'forbidden') return status(403);
  if (code === 'not-found' || code === 'invalid-input') return status(404);
  if (code === 'rate-limited') return status(429);
  return status(500);
}

async function download(ctx: RouteContext): Promise<Response> {
  const { datum, format } = await ctx.params;
  if (typeof datum !== 'string' || !isFormat(format)) return status(404);
  const result = await ctx.run(downloadDocument, { monday: datum, format });
  if (!result.ok) return refusal(result.error.code);
  const { bytes, fileName } = result.data;
  // A copy on an ArrayBuffer of its own: the driver's Buffer may be a view into a shared pool.
  return new Response(bytes.slice(), {
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
  handle: (_request, ctx) => download(ctx),
};
