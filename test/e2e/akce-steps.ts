/** What the specs share: who signs in, and the day arithmetic. */
import { personaOf } from './db';

/** The mock IdP's button of a persona of this project. */
export const signInAsRe = (name: string, project: string): RegExp =>
  new RegExp(`^Test – ${personaOf(name, project).subject}`);

/** The persona's e-mail: what the db helpers look up. */
export const emailOf = (name: string, project: string): string => personaOf(name, project).email;

/** ISO date `days` from today (UTC is near enough for a date a month away). */
export const isoInDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
