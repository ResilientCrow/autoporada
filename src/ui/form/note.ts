/** A quick phrase added to the note: alone in an empty note, after a space otherwise. */
export function withPhrase(note: string, phrase: string): string {
  const kept = note.trimEnd();
  return kept.trim() === '' ? phrase : `${kept} ${phrase}`;
}

/** The note's length as the server counts it: trimmed, in UTF-16 units (POINT_LIMITS). */
export const noteLength = (note: string): number => note.trim().length;
