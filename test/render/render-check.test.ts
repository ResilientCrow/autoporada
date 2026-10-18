/**
 * Renders documents through Gotenberg (LibreOffice) and inspects the PDF with
 * poppler (pdftotext, pdffonts). Needs the dev services: pnpm dev:services.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { composeDocument } from '@/document';
import { renderDocx } from '@/document/render-docx';

import { snapshotFixture } from '../support/snapshots';
import { VARIANTS } from '../support/variants';

const GOTENBERG = process.env['GOTENBERG_URL'] ?? 'http://localhost:3001';
const work = mkdtempSync(join(tmpdir(), 'autoporada-render-'));

/** The replica with `sentences` extra sentences in point 10, to move page breaks around. */
const longPoint10 = (sentences: number) => () =>
  snapshotFixture('template-replica', (raw) => {
    const pokyny = raw['pokyny'] as Record<string, unknown>[];
    const text =
      'Výuka probíhá podle nového rozvrhu a studenti jsou o změnách informováni třídními učiteli. ';
    pokyny[9] = {
      ...pokyny[9],
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: text.repeat(sentences).trim() }] },
        ],
      },
    };
  });

const SNAPSHOTS: Record<string, () => ReturnType<NonNullable<(typeof VARIANTS)[string]>>> = {
  ...VARIANTS,
  'long-point-10-a': longPoint10(4),
  'long-point-10-b': longPoint10(12),
};

async function renderPdf(variant: string): Promise<string> {
  const docx = await renderDocx(composeDocument(SNAPSHOTS[variant]!()));
  const form = new FormData();
  form.append('files', new Blob([docx as BlobPart]), `${variant}.docx`);
  const response = await fetch(`${GOTENBERG}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) throw new Error(`Gotenberg answered ${response.status}`);
  const file = join(work, `${variant}.pdf`);
  writeFileSync(file, new Uint8Array(await response.arrayBuffer()));
  return file;
}

const pages = (pdf: string) =>
  execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' })
    .split('\f')
    .filter((p) => p.trim());
const fonts = (pdf: string) =>
  execFileSync('pdffonts', [pdf], { encoding: 'utf8' })
    .split('\n')
    .slice(2)
    .map((line) => line.split(/\s+/)[0]?.replace(/^[A-Z]{6}\+/, '') ?? '')
    .filter(Boolean);

describe('PDF render check', () => {
  const pdfs: Record<string, string> = {};
  beforeAll(async () => {
    const variants = [
      'template-replica',
      'many-students',
      'annex2',
      'long-point-10-a',
      'long-point-10-b',
    ];
    for (const variant of variants) pdfs[variant] = await renderPdf(variant);
  }, 180_000);

  it('numbers every page „Stránka k z N“', () => {
    for (const pdf of Object.values(pdfs)) {
      const all = pages(pdf);
      all.forEach((page, k) => expect(page).toContain(`Stránka ${k + 1} z ${all.length}`));
    }
  });

  it('prints the page numbers in bold, as the template does', () => {
    const xml = execFileSync('pdftohtml', ['-xml', '-stdout', '-i', pdfs['template-replica']!], {
      encoding: 'utf8',
    });
    const footers = [
      ...xml.matchAll(
        />Stránka <\/text>\s*<text[^>]*>(.*?)<\/text>\s*(?:<text[^>]*> z <\/text>\s*)?<text[^>]*>(.*?)<\/text>/g,
      ),
    ];
    expect(footers.length).toBe(pages(pdfs['template-replica']!).length);
    for (const [, page, total] of footers) {
      expect(page).toMatch(/^<b>\d+<\/b>$/);
      expect(total).toMatch(/^<b>\d+<\/b>$/);
    }
  });

  it('never ends a page with a big section heading', () => {
    const heading =
      /^\s*(POKYNY PRO ZAMĚSTNANCE|INFORMACE Z HOSPODAŘENÍ|INFORMACE Z PROVOZU ŠKOLY)/;
    for (const variant of ['template-replica', 'long-point-10-a', 'long-point-10-b']) {
      for (const page of pages(pdfs[variant]!)) {
        const lines = page.split('\n').filter((l) => l.trim() && !l.includes('Stránka'));
        expect(lines.at(-1) ?? '').not.toMatch(heading);
      }
    }
  });

  it('keeps an empty line between the Příloha 1 intro and the table', () => {
    const annex = pages(pdfs['template-replica']!).find((p) => p.includes('PŘÍLOHA 1')) ?? '';
    const lines = annex.split('\n');
    const header = lines.findIndex((l) => l.includes('Jméno a příjmení'));
    expect(header).toBeGreaterThan(0);
    expect(lines[header - 1]?.trim()).toBe('');
  });

  it('prints the points in order, numbered 1 to 17', () => {
    const text = pages(pdfs['template-replica']!).join('\n');
    const numbers = [...text.matchAll(/^\s*(\d+)\)\.\s/gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it('embeds real fonts for the text, the bullet glyphs and the table (no tofu)', () => {
    const used = fonts(pdfs['template-replica']!);
    expect(used.some((f) => /^(TimesNewRoman|LiberationSerif)/.test(f))).toBe(true);
    // Symbol „•“ and Wingdings „■“ come out as OpenSymbol, or as themselves when installed.
    expect(used.some((f) => /^(OpenSymbol|Symbol|Wingdings)/.test(f))).toBe(true);
    expect(used.some((f) => /^(AptosNarrow|PTSans-Narrow)/.test(f))).toBe(true);
  });

  it('starts every Příloha 1 column that has rows with the header', () => {
    const all = pages(pdfs['many-students']!);
    const annexPages = all.slice(all.findIndex((p) => p.includes('PŘÍLOHA 1')));
    for (const page of annexPages.filter((p) => /\d\.[A-Z]|L\d[A-Z]/.test(p))) {
      const rows = page
        .split('\n')
        .filter((line) => /\s(\d\.[A-Z]|L\d[A-Z])\s*(\S.*\s(\d\.[A-Z]|L\d[A-Z]))?\s*$/.test(line));
      const twoColumns = rows.some(
        (line) => (line.match(/\s(\d\.[A-Z]|L\d[A-Z])(\s|$)/g) ?? []).length === 2,
      );
      expect((page.match(/Jméno a příjmení/g) ?? []).length).toBe(twoColumns ? 2 : 1);
    }
  });

  it('puts Příloha 2 on a page of its own', () => {
    const all = pages(pdfs['annex2']!);
    const annex2 = all.findIndex((p) => p.includes('PŘÍLOHA 2'));
    expect(annex2).toBe(all.length - 1);
    expect(all[annex2]?.trimStart().startsWith('PŘÍLOHA 2')).toBe(true);
  });
});
