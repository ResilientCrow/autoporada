import { stripForbiddenCharacters } from '@/domain/richtext';

/** Line breaks that are not `\n` (Word copies a break inside a cell as a vertical tab): they part words like a space. */
const BREAKS = /[\v\f\u0085\u2028\u2029]/g;

/** One line of plain text: forbidden characters out, every run of white space one space. */
export const clean = (s: string): string => stripForbiddenCharacters(s.replace(BREAKS, ' ')).replace(/\s+/g, ' ').trim();

/** What a single-line field keeps while it is typed or pasted: no trimming, so a space can still be typed. */
export const typedLine = (s: string): string => stripForbiddenCharacters(s.replace(BREAKS, ' ')).replace(/[\t\n]/g, ' ');
