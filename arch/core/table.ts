import { clean } from './text';

/** Splits pasted or typed text into table rows and cells (tab, else semicolon, else one cell a line). */
export const parseTable = (raw: string): string[][] => {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.every((l) => l.includes(';')) ? ';' : null;
  return lines.map((l) => (sep ? l.split(sep) : [l]).map(clean));
};
