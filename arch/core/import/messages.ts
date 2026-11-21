import { rateLimitedText } from '../wait';

/** Why a file did not become annex parts; the editor shows `importMessage(code)`. */
export type ImportCode = 'unknown' | 'broken' | 'doc-failed' | 'empty' | 'too-big' | 'file-too-big' | 'rate-limited' | 'stale' | 'pictures-skipped' | 'signed-out' | 'step-up';

export class ImportError extends Error {
  constructor(readonly code: ImportCode, readonly retryAfterSeconds?: number, options?: ErrorOptions) { super(code, options); }
}

export const IMPORT_HINT = 'Ze souboru Word, OpenDocument nebo PDF se přenese text, tabulky a obrázky jako části přílohy. Pak je můžete upravit.';
export const TEXT_ONLY_NOTE = 'Z PDF a starého formátu .doc se přenesl jen text. Tabulky a obrázky přidejte zvlášť.';
export const SKIPPED_IMAGES_NOTE = 'Některé obrázky jsme nepřenesli. Přidejte je jako obrázek zvlášť.';

const TOO_BIG = 'Soubor je na přílohu příliš velký. Zkuste ho rozdělit nebo zmenšit obrázky.';
const SIGNED_OUT = 'Přihlášení vypršelo. Přihlaste se znovu.'; // the editor sends the person to sign in instead of showing it
const TEXTS: Record<Exclude<ImportCode, 'rate-limited'>, string> = {
  unknown: 'Tenhle soubor neumíme přečíst. Vyberte dokument Word (.docx, .doc), OpenDocument (.odt) nebo PDF.',
  broken: 'Soubor se nepodařilo přečíst. Zkuste ho otevřít a uložit znovu.',
  'doc-failed': 'Starý dokument Word (.doc) se nepodařilo převést. Otevřete ho ve Wordu a uložte jako .docx.',
  empty: 'V souboru jsme nenašli žádný text.',
  'too-big': TOO_BIG,
  'file-too-big': TOO_BIG,
  stale: 'Aplikace se mezitím aktualizovala. Obnovte stránku a vyberte soubor znovu.',
  'pictures-skipped': SKIPPED_IMAGES_NOTE,
  'signed-out': SIGNED_OUT,
  'step-up': SIGNED_OUT,
};
export const importMessage = (e: ImportError): string => (e.code === 'rate-limited' ? rateLimitedText(e.retryAfterSeconds) : TEXTS[e.code]);

/** Participants from a spreadsheet (ADR 0077): the Účastníci field of an akce or jednání. */
export const SHEET_HINT = 'Jména z tabulky Excel, OpenDocument nebo CSV se přidají za to, co už je napsané.';
export const NO_NAMES = 'V souboru jsme nenašli žádná jména. Sloupec se jmény nadepište třeba „Jméno a příjmení“ a sloupec s třídou „Třída“.';
const SHEET_TOO_BIG = 'Soubor je na seznam účastníků příliš velký.';
const SHEET_TEXTS: Partial<Record<ImportCode, string>> = {
  unknown: 'Tenhle soubor neumíme přečíst. Vyberte tabulku Excel (.xlsx), OpenDocument (.ods) nebo CSV. Starší soubor .xls uložte v Excelu jako .xlsx.',
  'too-big': SHEET_TOO_BIG,
  'file-too-big': SHEET_TOO_BIG,
  stale: TEXTS.stale,
};
/** A spreadsheet is read in the browser only, so the server's answers (sign-in, rate limit) never come; the rest is `broken`. */
export const sheetMessage = (e: ImportError): string => SHEET_TEXTS[e.code] ?? TEXTS.broken;
export const tooManyNames = (length: number, max: number): string => `Tolik jmen se do pole nevejde: vejde se do něj ${max} znaků, se jmény ze souboru by jich bylo ${length}. Zkraťte seznam v souboru.`;
