import { describe, expect, it } from 'vitest';
import { ImportError } from './messages';
import { pdfBlocks, readPdf, type PdfItem, type PdfLib } from './pdf';

/** One line per entry, top down, 14 pt apart unless `gap` says otherwise. */
function page(lines: (string | { t: string; gap: number })[], x = 50): PdfItem[] {
  let y = 800;
  return lines.map((l) => {
    const t = typeof l === 'string' ? l : l.t;
    y -= typeof l === 'string' ? 14 : l.gap;
    return { str: t, x, y, h: 11, eol: true };
  });
}
const texts = (pages: PdfItem[][]) => pdfBlocks(pages).map((b) => (b.k === 'p' ? `${b.indent}:${b.text}` : b.k));

describe('pdfBlocks', () => {
  it('joins the lines of a paragraph with a space', () => {
    expect(texts([page(['Dnes jsme projednali', 'rozpočet školy.'])])).toEqual(['0:Dnes jsme projednali rozpočet školy.']);
  });

  it('starts a paragraph on a gap clearly above the line height', () => {
    expect(texts([page(['První odstavec', 'pokračuje.', { t: 'Druhý odstavec.', gap: 30 }])])).toEqual(['0:První odstavec pokračuje.', '0:Druhý odstavec.']);
  });

  it('makes a bullet an indented paragraph and drops the glyph', () => {
    expect(texts([page(['Úkoly:', '• zajistit sál', '• objednat občerstvení', '- poslat pozvánky', '– zkontrolovat techniku'])])).toEqual([
      '0:Úkoly:', '1:zajistit sál', '1:objednat občerstvení', '1:poslat pozvánky', '1:zkontrolovat techniku',
    ]);
  });

  it('keeps a hyphen inside a word that is not broken, and joins a broken one', () => {
    expect(texts([page(['Ředitel rozhodl o zave-', 'dení nového řádu a o jiho-', 'západním křídle.'])])).toEqual(['0:Ředitel rozhodl o zavedení nového řádu a o jihozápadním křídle.']);
  });

  it('does not join across a hyphen before a capital letter or a number', () => {
    expect(texts([page(['sekce A-', 'Příloha 2'])])).toEqual(['0:sekce A- Příloha 2']);
  });

  it('drops a line that is only a page number at the top or bottom of a page', () => {
    expect(texts([[...page(['Text první stránky.']), { str: '1', x: 300, y: 30, h: 11, eol: true }], [{ str: '2', x: 300, y: 820, h: 11, eol: true }, ...page(['Text druhé stránky.'])]])).toEqual(['0:Text první stránky.', '0:Text druhé stránky.']);
  });

  it('keeps a number that stands alone in the middle of a page', () => {
    expect(texts([page(['Počet žáků:', '120', 'Počet tříd'])])).toEqual(['0:Počet žáků: 120 Počet tříd']);
  });

  it('continues a paragraph over a page break when the sentence is open', () => {
    expect(texts([page(['Rozhodli jsme se, že'], 50), page(['budeme pokračovat.'], 50)])).toEqual(['0:Rozhodli jsme se, že budeme pokračovat.']);
  });

  it('starts a new paragraph on a new page after a finished sentence', () => {
    expect(texts([page(['Konec věty.']), page(['Nový začátek.'])])).toEqual(['0:Konec věty.', '0:Nový začátek.']);
  });

  it('builds a line from items on the same baseline and separates distant ones', () => {
    const items: PdfItem[] = [
      { str: 'Datum', x: 50, w: 30, y: 700, h: 11, eol: false },
      { str: ': 5. 12.', x: 80.5, w: 40, y: 700.2, h: 11, eol: false },
      { str: 'Místo', x: 300, w: 30, y: 700, h: 11, eol: true },
    ];
    expect(texts([items])).toEqual(['0:Datum: 5. 12. Místo']);
  });

  it('ignores empty items and returns nothing for an empty page', () => {
    expect(pdfBlocks([[{ str: '', x: 0, y: 0, h: 0, eol: true }], []])).toEqual([]);
  });

  it('starts a paragraph where the text size changes, as after a heading', () => {
    const items: PdfItem[] = [{ str: 'Výsledky voleb', x: 50, y: 800, h: 16, eol: true }, { str: 'Volby proběhly v úterý.', x: 50, y: 780, h: 11, eol: true }];
    expect(texts([items])).toEqual(['0:Výsledky voleb', '0:Volby proběhly v úterý.']);
  });

  it('ends a paragraph after a line that stops well short of the text width', () => {
    const line = (str: string, y: number, w: number): PdfItem => ({ str, x: 50, y, h: 11, w, eol: true });
    expect(texts([[line('Dlouhý řádek, který vede přes celou šířku', 800, 500), line('stránky a končí tady.', 786, 200), line('Jméno Třída Hlasy', 772, 150), line('Jan Novák 2.A 201', 758, 150)]])).toEqual([
      '0:Dlouhý řádek, který vede přes celou šířku stránky a končí tady.', '0:Jméno Třída Hlasy', '0:Jan Novák 2.A 201',
    ]);
  });

  it('reads a Symbol-font bullet and nests bullets by how far right they sit', () => {
    const b = (str: string, x: number, y: number): PdfItem => ({ str, x, y, h: 11, eol: true });
    expect(texts([[b('Úkoly:', 50, 800), b('\uF0B7 Předseda', 68, 786), b('\uF0B7 Místopředsedkyně', 68, 772), b('\uF0B7 ve druhém kole', 104, 758), b('\uF0B7 Pokladník', 68, 744)]])).toEqual([
      '0:Úkoly:', '1:Předseda', '1:Místopředsedkyně', '2:ve druhém kole', '1:Pokladník',
    ]);
  });

  it('does not take a dash that is part of a word for a bullet', () => {
    expect(texts([page(['-5 stupňů', '-ne- příliš'])])).toEqual(['0:-5 stupňů -ne- příliš']);
  });
});

const lib = (pages: PdfItem[][], fail?: string): PdfLib => ({
  getDocument: () => ({
    destroy: () => Promise.resolve(),
    promise: fail
      ? Promise.reject(Object.assign(new Error('x'), { name: fail }))
      : Promise.resolve({
          numPages: pages.length,
          getPage: (n: number) => Promise.resolve({ getTextContent: () => Promise.resolve({ items: [{ type: 'beginMarkedContent' }, ...pages[n - 1]!.map((i) => ({ str: i.str, transform: [1, 0, 0, 1, i.x, i.y], width: i.w ?? 0, height: i.h, hasEOL: i.eol }))] }), cleanup: () => undefined }),
        }),
  }),
});

describe('readPdf', () => {
  it('reads the text of every page and says only text was read', async () => {
    const r = await readPdf(new Uint8Array([1]), lib([page(['Jedna.']), page(['Dvě.'])]));
    expect(r.textOnly).toBe(true);
    expect(r.blocks).toHaveLength(2);
  });

  it('opens the document with the bytes and no font faces, and without the option pdf.js 6 no longer has', async () => {
    let seen: Record<string, unknown> | undefined;
    const bytes = new Uint8Array([1]);
    const spy: PdfLib = { getDocument: (src) => { seen = src; return lib([page(['Jedna.'])]).getDocument(src); } };
    await readPdf(bytes, spy);
    expect(seen).toEqual({ data: bytes, disableFontFace: true });
    expect(seen).not.toHaveProperty('isEvalSupported');
  });

  it('says broken for a file the library cannot open', async () => {
    await expect(readPdf(new Uint8Array([1]), lib([], 'InvalidPDFException'))).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });

  it('says broken for a password-protected file', async () => {
    await expect(readPdf(new Uint8Array([1]), lib([], 'PasswordException'))).rejects.toBeInstanceOf(ImportError);
  });

  it('refuses a document with an unreasonable number of pages', async () => {
    await expect(readPdf(new Uint8Array([1]), { getDocument: () => ({ destroy: () => Promise.resolve(), promise: Promise.resolve({ numPages: 5000, getPage: () => Promise.reject(new Error('no')) }) }) })).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
  });
});
