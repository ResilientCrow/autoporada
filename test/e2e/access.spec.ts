/**
 * The journeys of „Žádost o přístup“, desktop only. Every test has a persona of
 * its own that nothing else touches. The server counts access requests per
 * user, 3 per 24 hours and invalid ones too, in its memory for the whole run:
 * a test makes at most 2 (prazdny) and a CI retry repeats only that test.
 */
import type { BrowserContext, Page } from '@playwright/test';

import { access, cs, users } from '@/ui/copy';

import { endSession } from './db';
import { expect, test, withDates } from './fixtures';

const REASON = 'Jsem třídní učitelka 2.A.';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'journeys change data, so they run once');
});

const heading = (page: Page) => page.getByRole('main').getByRole('heading', { level: 2 });
const reasonField = (page: Page) => page.getByLabel(access.open.reason.label);
const submit = (page: Page) => page.getByRole('button', { name: access.open.send });

test('a request is sent, announced and cancelled, with focus on the state heading', async ({
  page,
  hydrated,
  settled,
  signInAs,
}) => {
  await signInAs(/^Test – zadatel/);
  await page.goto('/pristup');
  await expect(heading(page)).toHaveText(access.open.title);
  await hydrated();
  // The host's live region, the page's only one.
  const status = page.getByRole('main').getByRole('status');
  await expect(status).toBeEmpty();
  const region = await status.elementHandle();

  await reasonField(page).fill(REASON);
  await submit(page).click();
  await settled();
  await expect(heading(page)).toHaveText(access.pending.title);
  await expect(page.getByRole('main').getByText(REASON, { exact: true })).toBeVisible();
  await expect(status).toHaveText(access.said.sent);
  // The region is the node that was there before the submit, so a screen reader announces the fill.
  expect(await region?.evaluate((node, now) => node === now, await status.elementHandle())).toBe(
    true,
  );
  await expect(heading(page)).toBeFocused();

  await page.getByRole('button', { name: access.pending.cancel }).click();
  await settled();
  await expect(heading(page)).toHaveText(access.open.title);
  await expect(page.getByText(access.open.previousCancelled, { exact: true })).toBeVisible();
  await expect(status).toHaveText(access.said.cancelled);
  await expect(heading(page)).toBeFocused();
});

test('an empty submit focuses the summary and prefixes the title until a valid one', async ({
  page,
  hydrated,
  settled,
  signInAs,
}) => {
  await signInAs(/^Test – prazdny/);
  await page.goto('/pristup');
  await hydrated();
  const title = await page.title();
  expect(title.startsWith(cs.form.errorPrefix)).toBe(false);

  await submit(page).click();
  await settled();
  const summary = page
    .locator('form#zadost [tabindex="-1"]')
    .filter({ has: page.getByRole('alert') });
  await expect(summary).toBeFocused();
  await expect(page).toHaveTitle(`${cs.form.errorPrefix} ${title}`);

  await summary.getByRole('link', { name: new RegExp(`^${access.open.reason.label}:`) }).click();
  await expect(reasonField(page)).toBeFocused();

  // The second counted request of this persona.
  await reasonField(page).fill(REASON);
  await submit(page).click();
  await settled();
  await expect(heading(page)).toHaveText(access.pending.title);
  await expect(page).toHaveTitle(title);
});

test('an expired session keeps the typed reason, and signing in on another tab lets it be sent', async ({
  page,
  context,
  hydrated,
  settled,
  signInAs,
}) => {
  await signInAs(/^Test – relace/);
  await page.goto('/pristup');
  await hydrated();
  await reasonField(page).fill(REASON);

  const cookie = (await context.cookies()).find((c) => c.name === '__Host-ap_session');
  expect(cookie, 'a session cookie').toBeDefined();
  expect(await endSession(cookie!.value)).toBe(1);

  await submit(page).click();
  await settled();
  const problem = page.locator('form#zadost').getByRole('alert');
  await expect(problem).toContainText(cs.errors.unauthenticated);
  const link = problem.getByRole('link', { name: cs.problemActions.signIn });
  await expect(link).toHaveAttribute('target', '_blank');

  const popupOpened = page.waitForEvent('popup');
  await link.click();
  const popup = await popupOpened;
  await expect(popup.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
  await popup.getByRole('button', { name: /^Test – relace/ }).click();
  await expect(popup).toHaveURL(/\/pristup$/);
  await popup.close();

  await expect(reasonField(page)).toHaveValue(REASON);
  await submit(page).click();
  await settled();
  await expect(heading(page)).toHaveText(access.pending.title);
});

/** A second signed-in person in a context of their own, guarded like the test's. */
async function signInElsewhere(newContext: () => Promise<BrowserContext>, persona: RegExp) {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: cs.signIn.button }).click();
  await page.getByRole('button', { name: persona }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  return { context, page };
}

/** The queue item of a person, found by name; the people list below repeats names. */
const queueItem = (page: Page, name: string) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: users.queue.title }) })
    .getByRole('listitem')
    .filter({ hasText: name });

test("approving as a student announces it, ends the applicant's session, and shows their new standing", async ({
  page,
  newContext,
  hydrated,
  settled,
  signInAs,
}) => {
  const applicant = await signInElsewhere(newContext, /^Test – schvalit/);
  await signInAs(/^Ředitel/);
  await page.goto('/uzivatele');
  await hydrated();
  const item = queueItem(page, 'Soňa Schvalovaná');
  await item.getByRole('button', { name: users.queue.approveStudent }).click();
  await settled();
  await expect(page.getByRole('main').getByRole('status')).toHaveText(users.queue.said.approved);
  await expect(page.getByRole('heading', { name: users.queue.title })).toBeFocused();
  await expect(item).toHaveCount(0);

  // The approval ended every session of the applicant, so the next request asks to sign in.
  await applicant.page.goto('/');
  await expect(applicant.page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
  await applicant.page.getByRole('link', { name: cs.signIn.button }).click();
  await applicant.page.getByRole('button', { name: /^Test – schvalit/ }).click();
  await expect(applicant.page).toHaveURL(/:\d+\/$/);
  const main = applicant.page.getByRole('main');
  await expect(main.getByText(cs.status.role.submitter, { exact: true })).toBeVisible();
  await expect(main.getByText(cs.status.student, { exact: true })).toBeVisible();
  const list = await applicant.page.goto('/uzivatele');
  expect(list?.status()).toBe(404);
});

test('rejecting announces it, and the applicant then sees the cooldown', async ({
  page,
  newContext,
  hydrated,
  settled,
  signInAs,
}) => {
  await signInAs(/^Ředitel/);
  await page.goto('/uzivatele');
  await hydrated();
  const item = queueItem(page, 'Zdeněk Zamítaný');
  await item.getByRole('button', { name: users.queue.reject }).click();
  await settled();
  await expect(page.getByRole('main').getByRole('status')).toHaveText(users.queue.said.rejected);
  await expect(page.getByRole('heading', { name: users.queue.title })).toBeFocused();
  await expect(item).toHaveCount(0);

  const applicant = await signInElsewhere(newContext, /^Test – zamitnout/);
  await applicant.page.goto('/pristup');
  const main = applicant.page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(access.cooldown.title);
  await expect(main.getByText(withDates(access.cooldown.text))).toBeVisible();
});
