import { downloadDocument } from '@/application/use-cases';
import type { ActionError, DownloadError } from '@/contracts';
import { safeReturnTo } from '@/domain/identity';

import type { RouteContext, RouteSpec } from '../pipeline';

const TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const;

const isFormat = (value: unknown): value is keyof typeof TYPES =>
  value === 'docx' || value === 'pdf';

/** Where a download that gave no file lands: the archive, which names the reason (ADR 0044). */
const ARCHIVE = '/porada/archiv';
const SIGN_IN = '/prihlaseni';

/**
 * A 303 with no file. The archive is the target for every reader: `archive.view` is also what
 * `/porada/[datum]` asks, but that page sends a reviewer on to the preview (the parameter would be
 * lost) and is not found for a Monday outside the calendar, while a download from another site
 * already lands here.
 */
const see = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } });
const archiveWith = (chyba: DownloadError) => see(`${ARCHIVE}?chyba=${chyba}`);

/** A session that ended signs in again and comes back to the archive. */
const signIn = () => see(`${SIGN_IN}?returnTo=${encodeURIComponent(safeReturnTo(ARCHIVE))}`);

/**
 * A refusal as the page that says why. A wrong date, a missing file and a reader who may not read
 * the archive are all just not there; a lock timeout is a timeout.
 */
function refusal(error: ActionError): Response {
  switch (error.code) {
    case 'unauthenticated':
      return signIn();
    case 'forbidden':
    case 'not-found':
    case 'invalid-input':
      return archiveWith('not-found');
    case 'rate-limited':
      return archiveWith('rate-limited');
    case 'busy':
      return archiveWith('timeout');
    case 'unavailable':
      return archiveWith(error.cause);
    case 'conflict':
    case 'step-up-required':
    case 'rule':
      // None of these can come from a read of one file: if one does, the code is wrong.
      return archiveWith('bug');
  }
}

async function download(request: Request, ctx: RouteContext): Promise<Response> {
  // Next answers HEAD with GET; a HEAD sends no file, so it must not audit a download.
  if (request.method !== 'GET')
    return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  // The session cookie is SameSite=Lax: a link on another site would download, and audit, in the
  // reader's name (ADR 0039). The return from the sign-in also comes cross-site, hence a redirect.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return see(ARCHIVE);
  }
  const { datum, format } = await ctx.params;
  if (typeof datum !== 'string' || !isFormat(format)) return archiveWith('not-found');
  const result = await ctx.run(downloadDocument, { monday: datum, format });
  if (!result.ok) return refusal(result.error);
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
  failure: ({ cause }) => archiveWith(cause),
  rateLimited: () => archiveWith('rate-limited'),
};
