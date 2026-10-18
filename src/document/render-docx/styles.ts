import { AlignmentType, type IStylesOptions } from 'docx';

/**
 * The template's page and text formatting (test/fixtures/template/format-facts.json),
 * in one place. Units: twips for lengths, half-points for font sizes.
 */
export const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 720, right: 720, bottom: 720, left: 720, header: 0, footer: 113, gutter: 0 },
} as const;

/** Word 2003 compatibility, as in the template, so both lay text out the same way. */
export const COMPATIBILITY_MODE = 11;

export const FONT = 'Times New Roman';
export const TABLE_FONT = 'Aptos Narrow';

/** Half-points: 12 pt body, 14 pt title, 16 pt section headings, 18 pt „PŘÍLOHA n“. */
export const SIZE = {
  body: 24,
  title: 28,
  section: 32,
  annex: 36,
  annexTitle: 28,
  table: 22,
} as const;

export const INDENT = {
  /** First line of a body paragraph. */
  firstLine: 708,
  /** „- účast studentů: …“ report lines. */
  reportLine: 708,
  /** Point headings: number at 170, text at 527. */
  point: { left: 527, hanging: 357 },
} as const;

/** Two newspaper columns for the Příloha 1 table. */
export const ANNEX_COLUMNS = { count: 2, space: 708, equalWidth: true, separate: false } as const;

export const STYLES: IStylesOptions = {
  default: {
    document: {
      run: { font: FONT, size: SIZE.body, language: { value: 'cs-CZ' } },
      paragraph: {
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 0, after: 0, line: 240 },
      },
    },
    heading1: {
      run: { font: FONT, size: SIZE.body, bold: true, color: 'auto' },
      paragraph: {
        keepNext: true,
        indent: INDENT.point,
        spacing: { before: 0, after: 0, line: 240 },
        outlineLevel: 0,
      },
    },
  },
};
