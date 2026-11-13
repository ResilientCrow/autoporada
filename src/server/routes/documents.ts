import { downloadDocument } from '@/application/use-cases';
import type { ActionError, DownloadError } from '@/contracts';

import type { RouteContext, RouteSpec } from '../pipeline';

const TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const;

const isFormat = (value: unknown): value is keyof typeof TYPES =>
  value === 'docx' || value === 'pdf';

/**
 * Where a download that gave no file lands: the archive of the Arch client, which names the reason
 * (ADR 0044). The route cannot know the page the link was on, and the server never sees a #address,
 * so the archive is the one place every reader can be sent.
 */
const ARCHIVE = '/#/archiv';

/** A 303 with no file. */
const see = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } });
const archiveWith = (chyba: DownloadError) => see(`${ARCHIVE}?chyba=${chyba}`);

/**
 * A refusal as the archive that says why. A wrong date, a missing file and a reader who may not
 * read the archive are all just not there; a lock timeout is a timeout. A signed-out reader never
 * gets here (runRoute sends a session route's GET to `/`), so `unauthenticated` means the session
 * ended mid-request: the plain archive, which Arch keeps through its sign-in.
 */
function refusal(error: ActionError): Response {
  switch (error.code) {
    case 'unauthenticated':
      return see(ARCHIVE);
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
  if (request.headers.get('sec-fetch-site') === 'cross-site') return see(ARCHIVE);
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
