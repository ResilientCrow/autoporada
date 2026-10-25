import { defineUseCase, ok } from '@/application/core';
import { recentPeopleInput, recentPeopleOutput } from '@/contracts';
import { RECENT_PEOPLE_MAX, recentPeople } from '@/domain/people';

/** How many of the author's points the memory reads, most recently changed first. */
const RECENT_POINTS = 30;
/** A point unchanged for longer than this no longer feeds the memory. */
const RECENT_DAYS = 400;
const DAY_MS = 86_400_000;

/**
 * The people memory (design section 4, D11 (a)): whom the reader named in
 * their own recent points, for the picker. Nothing is stored, so the memory
 * goes when the points go; a reviewer's or the headmaster's is their own too.
 * The gate is the directory's: whoever may search may remember.
 */
export const recentPeopleOf = defineUseCase({
  name: 'people.recent',
  mode: 'read',
  input: recentPeopleInput,
  output: recentPeopleOutput,
  access: { kind: 'gate', check: () => ({ action: 'directory.search' }) },
  async execute({ tx, now }) {
    const since = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
    const points = await tx.points.ownRecent({ limit: RECENT_POINTS, since });
    return ok({ people: recentPeople(points, RECENT_PEOPLE_MAX) });
  },
});
