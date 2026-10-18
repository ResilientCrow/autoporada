import { readFileSync, writeFileSync } from 'node:fs';

import { composeDocument } from '@/document';
import { renderDocx } from '@/document/render-docx';
import { parseIssueSnapshot } from '@/snapshot';

export const RENDER_SNAPSHOT_USAGE =
  'render-snapshot <snapshot.json> <out.docx> [--pdf <out.pdf> --gotenberg <url>]';

/** Converts the DOCX with Gotenberg (LibreOffice) — the same path the worker takes. */
async function toPdf(docx: Uint8Array, gotenbergUrl: string): Promise<Uint8Array> {
  const form = new FormData();
  // LibreOffice picks the importer by extension, so the upload is always named .docx.
  form.append('files', new Blob([docx as BlobPart]), 'porada.docx');
  const response = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Gotenberg answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The value after `--name`, undefined if the flag is absent; a flag without a value is an error. */
function option(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${name} needs a value. Usage: ${RENDER_SNAPSHOT_USAGE}`);
  return value;
}

/** Renders a stored or hand-written snapshot exactly as generation would. */
export async function renderSnapshot(args: readonly string[]): Promise<string[]> {
  const [input, output] = args;
  if (!input || !output) throw new Error(`Usage: ${RENDER_SNAPSHOT_USAGE}`);

  const parsed = parseIssueSnapshot(JSON.parse(readFileSync(input, 'utf8')));
  if (!parsed.ok) throw new Error(`Invalid snapshot:\n  ${parsed.errors.join('\n  ')}`);

  const docx = await renderDocx(composeDocument(parsed.snapshot));
  writeFileSync(output, docx);
  const written = [output];

  const pdf = option(args, '--pdf');
  if (pdf) {
    const gotenberg = option(args, '--gotenberg');
    if (!gotenberg) throw new Error('--pdf needs --gotenberg <url>');
    writeFileSync(pdf, await toPdf(docx, gotenberg));
    written.push(pdf);
  }
  return written;
}
