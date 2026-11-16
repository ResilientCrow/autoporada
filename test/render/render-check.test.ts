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

const PLACEHOLDER = 'Dne 9. 10. 2026 proběhla akce s názvem Vesmírný seminář.';

/** The replica with its second report a placeholder for a report nobody delivered (ADR 0049). */
const missingReport = () =>
  snapshotFixture('template-replica', (raw) => {
    const reports = raw['reports'] as Record<string, unknown>[];
    reports[1] = {
      ...reports[1],
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: PLACEHOLDER }] }],
      },
      bullets: [],
      statements: [],
      missing: true,
    };
  });

const SNAPSHOTS: Record<string, () => ReturnType<NonNullable<(typeof VARIANTS)[string]>>> = {
  ...VARIANTS,
  'long-point-10-a': longPoint10(4),
  'long-point-10-b': longPoint10(12),
  'missing-report': missingReport,
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
      'missing-report',
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

  it('embeds only the expected fonts: no fallback, no tofu', () => {
    for (const pdf of Object.values(pdfs)) {
      const used = fonts(pdf);
      // Originals when licensed, otherwise the metric-compatible substitutes.
      const allowed =
        /^(TimesNewRoman|LiberationSerif|CourierNew|LiberationMono|OpenSymbol|Symbol|Wingdings|AptosNarrow|PTSans-Narrow)/;
      expect(used.filter((f) => !allowed.test(f))).toEqual([]);
      expect(used.some((f) => /^(OpenSymbol|Symbol|Wingdings)/.test(f))).toBe(true);
    }
  });

  /** Splits an annex page into its two newspaper columns at the gap between them. */
  function columns(page: string): [string[], string[]] {
    const lines = page.split('\n').filter((l) => !l.includes('Stránka'));
    const gap = Math.max(...lines.map((l) => l.indexOf('Jméno a příjmení', 10)));
    const split = gap > 0 ? gap : Math.floor(Math.max(...lines.map((l) => l.length)) / 2);
    return [lines.map((l) => l.slice(0, split).trim()), lines.map((l) => l.slice(split).trim())];
  }

  it('starts every Příloha 1 column that has rows with the header, and never ends one on it', () => {
    const all = pages(pdfs['many-students']!);
    const first = all.findIndex((p) => p.includes('PŘÍLOHA 1'));
    expect(first).toBeGreaterThanOrEqual(0);
    const isRow = (line: string) => /\s(\d\.[A-Z]|L\d[A-Z])$/.test(line);
    let checkedColumns = 0;
    for (const page of all.slice(first)) {
      for (const column of columns(page)) {
        const content = column.filter((l) => l !== '');
        const tableStart = content.findIndex((l) => l.startsWith('Jméno a příjmení') || isRow(l));
        if (tableStart < 0) continue;
        checkedColumns++;
        expect(content[tableStart]).toMatch(/^Jméno a příjmení/);
        expect(content.at(-1)).not.toMatch(/^Jméno a příjmení/);
      }
    }
    // 150 students fill both columns of at least two pages.
    expect(checkedColumns).toBeGreaterThanOrEqual(3);
  });

  it('prints a missing report as its sentence and the fixed line, under its heading', () => {
    const text = pages(pdfs['missing-report']!).join('\n').replace(/\s+/g, ' ');
    const at = text.indexOf('Vesmírný seminář');
    expect(at).toBeGreaterThan(-1);
    const rest = text.slice(at);
    expect(rest).toContain(PLACEHOLDER);
    // ADR 0060: one report line follows the paragraph.
    expect(rest.indexOf('vyjádření organizátora: nebylo dodáno')).toBeGreaterThan(
      rest.indexOf(PLACEHOLDER),
    );
    // Nothing else sits between the placeholder's heading and the next point.
    const point = rest.slice(0, rest.indexOf('Další doposud známé akce školy'));
    expect(point).not.toContain('účast studentů');
    expect(point.split('vyjádření')).toHaveLength(2);
  });

  it('puts Příloha 2 on a page of its own', () => {
    const all = pages(pdfs['annex2']!);
    const annex2 = all.findIndex((p) => p.includes('PŘÍLOHA 2'));
    expect(annex2).toBe(all.length - 1);
    expect(all[annex2]?.trimStart().startsWith('PŘÍLOHA 2')).toBe(true);
  });
});
