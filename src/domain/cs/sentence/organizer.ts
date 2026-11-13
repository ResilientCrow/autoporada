/** What our person does at an akce or jednání (ADR 0063): they organize it, or coordinate it for the school. */
export const ORGANIZER_ROLES = ['organizes', 'coordinates'] as const;
export type OrganizerRole = (typeof ORGANIZER_ROLES)[number];

const VERBS: Readonly<Record<OrganizerRole, { one: string; many: string }>> = {
  organizes: { one: 'organizuje', many: 'organizují' },
  coordinates: { one: 'koordinuje', many: 'koordinují' },
};

/** Names typed on several lines before the field was one line, put on one line. */
export const organizerOnOneLine = (names: string): string => names.replace(/\s*\r?\n\s*/g, ' ');

/**
 * The organizer as the agenda line prints it (ADR 0063): „organizuje Jana Nováková“, or with a
 * comma in the names, which is how several people are listed, „organizují Jana Nováková, Petr
 * Malý“; „koordinuje“ and „koordinují“ likewise. No role (an item typed before the role existed)
 * prints the names as typed. Empty names print nothing. The names are never inflected.
 */
export function organizerPhrase(role: OrganizerRole | null, names: string): string {
  const typed = names.trim();
  if (typed === '' || role === null) return typed;
  const verb = VERBS[role];
  return `${typed.includes(',') ? verb.many : verb.one} ${typed}`;
}
