/**
 * The journeys of „Žádost o přístup“, desktop only. Every test has a persona of
 * its own that nothing else touches. The server counts access requests per
 * user, 3 per 24 hours and invalid ones too, in its memory for the whole run:
 * a test makes at most 2 (prazdny) and a CI retry repeats only that test.
 */
import type { Page } from '@playwright/test';

import { formatLongDate, typographizeText } from '@/domain/cs';
import { cooldownEnd } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';
import { renderMail } from '@/notify';
import { access, cs, users } from '@/ui/copy';

import { endSession } from './db';
import { E2E_ENV } from './env';
import { expect, showAllPersonas, signInElsewhere, test, withDates } from './fixtures';
import { mailpit } from './mailpit';

const REASON = 'Jsem třídní učitelka 2.A.';
const ORIGIN = E2E_ENV.APP_ORIGIN;
/** The personas' addresses (docker/dev/mock-oauth2.json): each decision mails its requester once. */
const APPROVED_ADDRESS = 'schvalit@ssps.cz';
const REJECTED_ADDRESS = 'zamitnout@ssps.cz';

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
  await showAllPersonas(popup);
  await popup.getByRole('button', { name: /^Test – relace/ }).click();
  await expect(popup).toHaveURL(/\/pristup$/);
  await popup.close();

  await expect(reasonField(page)).toHaveValue(REASON);
  await submit(page).click();
  await settled();
  await expect(heading(page)).toHaveText(access.pending.title);
});

/** A second signed-in person in a context of their own, guarded like the test's. */
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
  await expect(applicant).toHaveURL(/:\d+\/$/);
  await mailpit.forget(APPROVED_ADDRESS);
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
  await applicant.goto('/');
  await expect(applicant).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
  await applicant.getByRole('link', { name: cs.signIn.button }).click();
  await showAllPersonas(applicant);
  await applicant.getByRole('button', { name: /^Test – schvalit/ }).click();
  await expect(applicant).toHaveURL(/:\d+\/$/);
  const main = applicant.getByRole('main');
  await expect(main.getByText(cs.status.role.submitter, { exact: true })).toBeVisible();
  await expect(main.getByText(cs.status.student, { exact: true })).toBeVisible();
  const list = await applicant.goto('/uzivatele');
  expect(list?.status()).toBe(404);

  // One mail, from the worker: the approval, with the way back in.
  const mail = await mailpit.waitFor({ to: APPROVED_ADDRESS });
  expect(mail.subject).toBe(renderMail('access.approved', {}, ORIGIN).subject);
  expect(mail.text).toContain(`${ORIGIN}/prihlaseni`);
  const raw = await mailpit.raw(mail.id);
  expect(raw).toMatch(/^X-Auto-Response-Suppress: All\r?$/m);
  expect(raw).toMatch(/^X-Autoporada-Dedupe: access\.approved:[0-9a-f-]{36}\r?$/m);
  await mailpit.quiet({ to: APPROVED_ADDRESS });
});

test('rejecting announces it, and the applicant then sees the cooldown', async ({
  page,
  newContext,
  hydrated,
  settled,
  signInAs,
}) => {
  await mailpit.forget(REJECTED_ADDRESS);
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
  await expect(applicant).toHaveURL(/:\d+\/$/);
  await applicant.goto('/pristup');
  const main = applicant.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(access.cooldown.title);
  await expect(main.getByText(withDates(access.cooldown.text))).toBeVisible();

  // One mail: the rejection, naming the day a new request can be made.
  const retryFrom = instantToWallClock(cooldownEnd(new Date())).date;
  const mail = await mailpit.waitFor({ to: REJECTED_ADDRESS });
  expect(mail.subject).toBe(renderMail('access.rejected', { retryFrom }, ORIGIN).subject);
  expect(mail.text).toContain(typographizeText(formatLongDate(retryFrom)));
  const raw = await mailpit.raw(mail.id);
  expect(raw).toMatch(/^X-Auto-Response-Suppress: All\r?$/m);
  expect(raw).toMatch(/^X-Autoporada-Dedupe: access\.rejected:[0-9a-f-]{36}\r?$/m);
  await mailpit.quiet({ to: REJECTED_ADDRESS });
});
