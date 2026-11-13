/** What the akce specs share: who signs in, the editor of a new akce filled in through its controls, and the day arithmetic. */
import type { Page } from '@playwright/test';

import { future, points } from '@/ui/copy';

import { personaOf } from './db';
import { expect, field } from './fixtures';

/** The mock IdP's button of a persona of this project. */
export const signInAsRe = (name: string, project: string): RegExp =>
  new RegExp(`^Test – ${personaOf(name, project).subject}`);

/** The persona's e-mail: what the db helpers and Mailpit look up. */
export const emailOf = (name: string, project: string): string => personaOf(name, project).email;

/** ISO date `days` from today (UTC is near enough for a date a month away). */
export const isoInDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** The id in the address of /akce/[id] and /body/[id]. */
export const idOfUrl = (page: Page): string => {
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error(`no item in ${page.url()}`);
  return id;
};

/**
 * Fills the editor of a new akce with everything a hand-in needs: the title, the first day,
 * and the three free texts (organizer with its role, participants, note).
 */
export async function fillAkce(
  page: Page,
  { title, start }: { title: string; start: string },
): Promise<void> {
  await field(page, points.editor.title).fill(title);
  await field(page, points.facts.eventDate).fill(start);
  await page.getByRole('radio', { name: points.campus.smichov }).check();
  await field(page, points.facts.place).fill('v učebně S206');
  await page.getByRole('radio', { name: future.editor.organizerRole.organizes }).check();
  await field(page, future.editor.organizerNames).fill('paní Jana Nováková');
  await field(page, future.editor.participants).fill('účast 8. A');
  await field(page, future.editor.note).fill('téma stáže');
  await expect(page.getByText(/^Uloženo v/)).toBeVisible();
}

/** The status region that says `text`: a page has several, so the plain role is ambiguous. */
export const statusSaying = (page: Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });
