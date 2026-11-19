import type { BulletSpec, PointContent } from './content';

/** The row of the participants: the only one addressed as a group (ADR 0071). */
export const PARTICIPANTS_KEY = 'participants';

/**
 * The rows every report starts with (ADR 0067). Keys are stable slugs: drafts copy them, so a key
 * is never renamed. Older points keep their own extra rows (`speakers`, `audience`, `results`).
 */
export const REPORT_BULLETS: readonly BulletSpec[] = [
  { key: 'organisers', label: 'Organizátoři', kind: 'people', required: false },
  { key: PARTICIPANTS_KEY, label: 'Účastníci', kind: 'people', required: false },
];

/** The rows whose people the opening names; `speakers` is the older Přednáška's. */
export const OPENING_KEYS: readonly string[] = ['organisers', 'speakers'];

/** The index of the row that names the organisers (the one the opening reads), or -1. */
export const organiserAt = (content: PointContent): number =>
  content.bullets.findIndex((b) => b.kind === 'people' && OPENING_KEYS.includes(b.key));
