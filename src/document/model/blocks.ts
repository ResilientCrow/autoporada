/**
 * The document as a closed set of blocks. Compose produces it once; the DOCX
 * renderer and the HTML preview both consume it, so they cannot drift apart.
 * All text is final: typography, numbering and bold-for-new are decided.
 */

export interface Run {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
}

export interface StudentRow {
  readonly name: string;
  readonly classCode: string;
  /** Added since the last issue: bold in both cells. */
  readonly isNew: boolean;
}

export type Block =
  /** „PORADA VEDENÍ ŠKOLY – pondělí 12. října 2026“ */
  | { readonly kind: 'title'; readonly text: string }
  /** „Přítomni: …“ / „Hosté: …“ — bold label, plain text. */
  | { readonly kind: 'label'; readonly label: string; readonly text: string }
  /** POKYNY…, INFORMACE Z HOSPODAŘENÍ, INFORMACE Z PROVOZU ŠKOLY */
  | { readonly kind: 'section'; readonly text: string }
  /** „15). Seminář Matika Česku“ — numbered continuously through the whole document. */
  | { readonly kind: 'point'; readonly number: number; readonly text: string }
  /** A justified paragraph whose first line is indented. */
  | { readonly kind: 'body'; readonly runs: readonly Run[] }
  /** „- účast studentů: …“ — literal dash, bold-italic label, indented. */
  | { readonly kind: 'reportLine'; readonly label: string; readonly runs: readonly Run[] }
  /** Points 3 and 4: numbered „-“ list item with a bold-italic label. */
  | { readonly kind: 'dash'; readonly label: string; readonly runs: readonly Run[] }
  /** „•“ — future meetings and events. */
  | { readonly kind: 'bullet'; readonly runs: readonly Run[] }
  /** Standing content: „o“ (bold italic), „o“, „■“. */
  | { readonly kind: 'rich'; readonly level: 0 | 1 | 2; readonly runs: readonly Run[] }
  /** „o vyjádření pana …: „…““ in Ohlasy sociálních partnerů. */
  | { readonly kind: 'partner'; readonly label: string; readonly quote: string }
  /**
   * One empty line: the template spaces blocks with empty paragraphs.
   * `keepNext` holds it on the page of what follows (under a big heading).
   */
  | { readonly kind: 'spacer'; readonly keepNext?: boolean }
  | { readonly kind: 'pageBreak' }
  /** „V Praze dne …“ / „Zpracoval Autonomní systém Autoporada“ */
  | { readonly kind: 'closing'; readonly place: string; readonly signature: string }
  /** „PŘÍLOHA 1“ */
  | { readonly kind: 'annex'; readonly text: string }
  /** The heading under „PŘÍLOHA 1“. */
  | { readonly kind: 'annexTitle'; readonly text: string }
  | { readonly kind: 'studentTable'; readonly rows: readonly StudentRow[] }
  /** A table of an extra annex: the first row is the header. */
  | { readonly kind: 'dataTable'; readonly rows: readonly (readonly string[])[] }
  /** A picture of an extra annex, as a PNG or JPEG data URL; size in CSS pixels. */
  | {
      readonly kind: 'image';
      readonly src: string;
      readonly width: number;
      readonly height: number;
      readonly alt: string;
    };

export interface Section {
  /** `twoColumn` holds the Příloha 1 table; `nextPage` starts Příloha 2 on a fresh page. */
  readonly layout: 'single' | 'twoColumn' | 'nextPage';
  readonly blocks: readonly Block[];
}

export interface DocumentModel {
  readonly meta: { readonly title: string; readonly author: string };
  readonly sections: readonly Section[];
}
