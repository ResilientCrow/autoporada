/** What the akce specs share: who signs in, the editor of a new akce filled in through its controls, and the day arithmetic. */
import type { Page } from '@playwright/test';

import { future, people, points } from '@/ui/copy';

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

/** Types into the „Přidat vyučujícího“ box and takes the directory's answer, which comes after a pause. */
async function addTeacher(page: Page, query: string, name: string): Promise<void> {
  const box = page.getByRole('combobox', { name: future.editor.responsible.add });
  // React Aria closes the list when the page scrolls under it: scroll first, then open and type.
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await box.click();
  await box.pressSequentially(query);
  await page.getByRole('listbox').getByRole('option', { name, exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
}

/**
 * Fills the editor of a new akce with everything a hand-in needs: the title, the first day,
 * who runs it (Jana Nováková, from the directory, addressed „paní“), and the box that asks for a report.
 */
export async function fillAkce(
  page: Page,
  { title, start }: { title: string; start: string },
): Promise<void> {
  await field(page, points.editor.title).fill(title);
  await field(page, points.facts.eventDate).fill(start);
  await page.getByRole('radio', { name: points.campus.smichov }).check();
  await field(page, future.editor.responsible.behalfOf).fill('8. A');
  await addTeacher(page, 'Novák', 'Jana Nováková');
  await page.getByRole('button', { name: people.chips.bulk.setLabel('paní'), exact: true }).click();
  await page.getByRole('checkbox', { name: future.editor.expectsReport }).check();
  await field(page, points.facts.place).fill('v učebně S206');
  await expect(page.getByText(/^Uloženo v/)).toBeVisible();
}

/** The status region that says `text`: a page has several, so the plain role is ambiguous. */
export const statusSaying = (page: Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });
