/**
 * Step-up through the mock IdP (compose.dev.yaml): a stale sign-in asks for a
 * new one before a role or account change, in the same tab (proactive) or a new
 * one (reactive). zastupce is the actor of every test, signed in fresh by each
 * and ageing only its own session cookie, so the tests do not meet. kolega is
 * only a target. Desktop only: the journeys sign in several times.
 */
import type { Page } from '@playwright/test';

import { cs, stepUpNotice, users } from '@/ui/copy';

import { ageSession } from './db';
import { expect, openUserDetail, sessionToken, showAllPersonas, test } from './fixtures';

const ACTOR = /^Test – zastupce/;
const COLLEAGUE = 'Karel Kolegů';
const STALE_MINUTES = 20;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'journeys change data, so they run once');
});

const roleHeading = (page: Page) =>
  page.getByRole('main').getByRole('heading', { name: users.detail.access.title });

test('a stale sign-in is asked to confirm before the role form shows', async ({
  page,
  context,
  signInAs,
}) => {
  await signInAs(ACTOR);
  expect(await ageSession(await sessionToken(context), STALE_MINUTES)).toBe(1);
  await openUserDetail(page, COLLEAGUE);
  const detail = page.url();
  await expect(page.getByText(stepUpNotice.title, { exact: true })).toBeVisible();
  await expect(roleHeading(page)).toHaveCount(0);

  await page.getByRole('link', { name: stepUpNotice.action }).click();
  await expect(page.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
  await showAllPersonas(page);
  await page.getByRole('button', { name: ACTOR }).click();
  await expect(page).toHaveURL(detail);
  await expect(roleHeading(page)).toBeVisible();
  await expect(page.getByText(stepUpNotice.title, { exact: true })).toHaveCount(0);
});

test('a sign-in that goes stale under an open form asks again in a new tab and keeps the input', async ({
  page,
  context,
  hydrated,
  settled,
  signInAs,
}) => {
  await signInAs(ACTOR);
  await openUserDetail(page, COLLEAGUE);
  await hydrated();
  const main = page.getByRole('main');
  const form = page.locator('form#role');
  await expect(roleHeading(page)).toBeVisible();
  expect(await ageSession(await sessionToken(context), STALE_MINUTES)).toBe(1);

  await form.getByLabel(users.detail.access.roleLabel, { exact: true }).selectOption({
    label: cs.status.role.reviewer,
  });
  await form.getByRole('button', { name: users.detail.access.save }).click();
  await settled();
  const problem = form.locator('[tabindex="-1"]').filter({ has: page.getByRole('alert') });
  await expect(problem).toBeFocused();
  await expect(problem).toContainText(cs.errors['step-up-required']);
  const link = problem.getByRole('link', { name: cs.problemActions.stepUp });
  await expect(link).toHaveAttribute('target', '_blank');

  const opened = page.waitForEvent('popup');
  await link.click();
  const popup = await opened;
  await expect(popup.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
  await showAllPersonas(popup);
  await popup.getByRole('button', { name: ACTOR }).click();
  await expect(popup).toHaveURL(/\/uzivatele\/[0-9a-f-]{36}$/);
  await popup.close();

  await form.getByRole('button', { name: users.detail.access.save }).click();
  await settled();
  await expect(main.getByRole('status')).toHaveText(users.detail.access.said.changed);
  // The refreshed page has one role form, not a stale copy beside the new one (f9926b0).
  await expect(roleHeading(page)).toHaveCount(1);
  await expect(
    main.getByRole('definition').filter({ hasText: cs.status.role.reviewer }),
  ).toBeVisible();

  // Put the colleague back, so the role stays what the seed made it (lowering asks for a confirmation).
  await form.getByLabel(users.detail.access.roleLabel, { exact: true }).selectOption({
    label: cs.status.role.submitter,
  });
  await form.getByLabel(users.detail.access.confirm).check();
  await form.getByRole('button', { name: users.detail.access.save }).click();
  await settled();
  await expect(
    main.getByRole('definition').filter({ hasText: cs.status.role.submitter }),
  ).toBeVisible();
});

/** The step-up page with the mock IdP's "an hour ago" box ticked or not, and who answers it. */
async function stepUpAs(page: Page, persona: RegExp, hourAgo: boolean): Promise<void> {
  await page.goto('/auth/step-up?returnTo=%2Fuzivatele');
  await expect(page.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
  await showAllPersonas(page);
  if (hourAgo) await page.getByLabel('Přihlášení před hodinou').check();
  await page.getByRole('button', { name: persona }).click();
}

test('a step-up answered with an old sign-in is refused and the session stays', async ({
  page,
  signInAs,
}) => {
  await signInAs(ACTOR);
  await stepUpAs(page, ACTOR, true);
  await expect(page).toHaveURL(/\/prihlaseni\?chyba=step-up-stale$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    cs.signIn.errors['step-up-stale'],
  );
  const response = await page.goto('/uzivatele');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/uzivatele$/);
});

test('a step-up answered by another person is refused and the session stays', async ({
  page,
  signInAs,
}) => {
  await signInAs(ACTOR);
  await stepUpAs(page, /^Učitelka/, false);
  await expect(page).toHaveURL(/\/prihlaseni\?chyba=step-up-mismatch$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    cs.signIn.errors['step-up-mismatch'],
  );
  const response = await page.goto('/uzivatele');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/uzivatele$/);
});
