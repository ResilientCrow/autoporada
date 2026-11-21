import { MAX_COLS, MAX_ROWS, trimRow, type Rows } from './rows';

/** A tie goes to the first: Czech Excel separates with a semicolon, and a comma may sit inside a name. */
const SEPARATORS = [';', '\t', ','] as const;
const SAMPLE_LINES = 10;
const SEP_LINE = /^sep=([^\r\n])(?:\r\n|\n|\r)/i; // Excel's own hint, written by some exports

const has = (b: Uint8Array, ...bom: number[]) => bom.every((x, i) => b[i] === x);

/** The text of a CSV: UTF-16 with a BOM, else UTF-8 (a BOM is dropped), else Windows-1250, as Czech Excel saves it. */
export function decodeText(bytes: Uint8Array): string {
  if (has(bytes, 0xff, 0xfe)) return new TextDecoder('utf-16le').decode(bytes);
  if (has(bytes, 0xfe, 0xff)) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1250').decode(bytes); }
}

/** The separator used most outside quotes in the first lines; null when there is none, so the file is one column. */
function separatorOf(text: string): string | null {
  const n = new Map<string, number>(SEPARATORS.map((s) => [s, 0]));
  let quoted = false; let lines = 0;
  for (let i = 0; i < text.length && lines < SAMPLE_LINES; i++) {
    const c = text[i]!;
    if (c === '"') quoted = !quoted; // a doubled quote toggles twice
    else if (quoted) continue;
    else if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) lines++; // CRLF counts once, on its LF
    else if (n.has(c)) n.set(c, n.get(c)! + 1);
  }
  let best: string | null = null;
  for (const s of SEPARATORS) if (n.get(s)! > (best === null ? 0 : n.get(best)!)) best = s;
  return best;
}

/**
 * Rows of cells (RFC 4180 quoting; CRLF, LF or CR line ends); the separator is found, not assumed. Like a sheet, it
 * stops at `MAX_ROWS` rows and `MAX_COLS` cells a row, and a row loses the empty cells at its end.
 */
export function parseCsv(text: string): Rows {
  const hint = SEP_LINE.exec(text);
  const body = hint ? text.slice(hint[0].length) : text;
  const sep = hint ? hint[1]! : separatorOf(body);
  const rows: Rows = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  const endCell = () => { if (row.length < MAX_COLS) row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(trimRow(row)); row = []; };
  for (let i = 0; i < body.length && rows.length < MAX_ROWS; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (body[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
    } else if (c === '"' && cell === '') quoted = true; // a quote opens a cell only at its start
    else if (c === sep) endCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && body[i + 1] === '\n') i++; endRow(); }
    else cell += c;
  }
  if (rows.length < MAX_ROWS && (cell || row.length)) endRow();
  return rows;
}
