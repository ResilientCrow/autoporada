import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { composeDocument } from '@/document';
import { renderDocx } from '@/document/render-docx';
import { parseIssueSnapshot } from '@/snapshot';

export const RENDER_SNAPSHOT_USAGE =
  'render-snapshot <snapshot.json> <out.docx> [--pdf <out.pdf> --gotenberg <url>]';

/** Converts the DOCX with Gotenberg (LibreOffice) — the same path the worker takes. */
async function toPdf(docx: Uint8Array, gotenbergUrl: string, name: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append('files', new Blob([docx as BlobPart]), name);
  const response = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) throw new Error(`Gotenberg answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function option(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
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
    writeFileSync(pdf, await toPdf(docx, gotenberg, basename(output)));
    written.push(pdf);
  }
  return written;
}
