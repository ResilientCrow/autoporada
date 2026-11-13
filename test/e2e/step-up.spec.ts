/**
 * Step-up through the mock IdP (compose.dev.yaml): a stale sign-in asks for a
 * new one before a role or account change, in the same tab (proactive) or a new
 * one (reactive). zastupce is the actor of every test, signed in fresh by each
 * and ageing only its own session cookie, so the tests do not meet. kolega is
 * only a target. Desktop only: the journeys sign in several times.
 */
import type { Page } from '@playwright/test';

import { cs } from '@/ui/copy';

import { ageSession } from './db';
import { expect, sessionToken, showAllPersonas, test } from './fixtures';

const ACTOR = /^Test – zastupce/;
const COLLEAGUE = 'Karel Kolegů';
const STALE_MINUTES = 20;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'journeys change data, so they run once');
});

/** Opens one person's page on the Arch list of people, found by name, and returns its id. */
async function openPerson(page: Page, name: string): Promise<string> {
  await page.goto('/#/lide');
  await page.getByRole('textbox', { name: 'Najít člověka' }).fill(name);
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/#\/lide\/[0-9a-f-]{36}$/);
  return /#\/lide\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
}

const roleOf = (page: Page, id: string) =>
  page.evaluate(async (who) => {
    const r = await fetch('/api/arch/state', { cache: 'no-store' });
    const state = (await r.json()) as { users: { id: string; role: string }[] };
    return state.users.find((u) => u.id === who)?.role;
  }, id);

const roleControl = (page: Page) => page.getByRole('radiogroup', { name: 'Role' });
const note = (page: Page) => page.getByText('Nejdřív ověříme, že jste to vy', { exact: true });

/** The mock IdP's step-up page, answered by the actor. */
async function answerStepUp(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
  await showAllPersonas(page);
  await page.getByRole('button', { name: ACTOR }).click();
}

test('a stale sign-in is asked to confirm before the role form shows', async ({
  page,
  context,
  signInAs,
}) => {
  await signInAs(ACTOR);
  expect(await ageSession(await sessionToken(context), STALE_MINUTES)).toBe(1);
  // The state is read at load: it knows the sign-in is stale.
  await page.goto('/');
  await page.reload();
  const id = await openPerson(page, COLLEAGUE);
  await expect(note(page)).toBeVisible();
  await expect(roleControl(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Ověřit přihlášením' }).click();
  await answerStepUp(page);
  // Arch asks the step-up to return to its home, not to the person's page.
  await expect(page).toHaveURL(/:\d+\/(#.*)?$/);
  await page.goto(`/#/lide/${id}`);
  await page.reload();
  await expect(roleControl(page)).toBeVisible();
  await expect(note(page)).toHaveCount(0);
});

test('a sign-in that goes stale under an open form is asked again in the same tab', async ({
  page,
  context,
  signInAs,
}) => {
  await signInAs(ACTOR);
  const id = await openPerson(page, COLLEAGUE);
  await expect(roleControl(page)).toBeVisible();
  expect(await roleOf(page, id)).toBe('submitter');
  expect(await ageSession(await sessionToken(context), STALE_MINUTES)).toBe(1);

  // The server refuses the change; Arch leaves for the step-up in this tab and drops the choice
  // (the classic form kept it and asked in a new tab).
  await roleControl(page).getByRole('radio', { name: 'Vedení' }).click();
  await answerStepUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();
  expect(await roleOf(page, id)).toBe('submitter');

  await page.goto(`/#/lide/${id}`);
  await page.reload();
  await expect(roleControl(page).getByRole('radio', { name: 'Píše zprávy' })).toBeChecked();
  await roleControl(page).getByRole('radio', { name: 'Vedení' }).click();
  await expect(page.getByText('Uloženo', { exact: true })).toBeVisible();
  await expect.poll(() => roleOf(page, id)).toBe('reviewer');

  // Put the colleague back, so the role stays what the seed made it.
  await roleControl(page).getByRole('radio', { name: 'Píše zprávy' }).click();
  await expect.poll(() => roleOf(page, id)).toBe('submitter');
});

/** The session survived: the Arch state answers for a signed-in user, not with the 303 to `/`. */
async function expectStillSignedIn(page: Page): Promise<void> {
  const response = await page.request.get('/api/arch/state', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(((await response.json()) as { userId: string | null }).userId).not.toBeNull();
}

/** The step-up page with the mock IdP's "an hour ago" box ticked or not, and who answers it. */
async function stepUpAs(page: Page, persona: RegExp, hourAgo: boolean): Promise<void> {
  await page.goto('/auth/step-up?returnTo=%2F');
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
  // The Arch client at `/` says it to someone still signed in, then clears the address.
  await expect(page.getByText(cs.signIn.errors['step-up-stale'])).toBeVisible();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expectStillSignedIn(page);
});

test('a step-up answered by another person is refused and the session stays', async ({
  page,
  signInAs,
}) => {
  await signInAs(ACTOR);
  await stepUpAs(page, /^Učitelka/, false);
  // The Arch client at `/` says it to someone still signed in, then clears the address.
  await expect(page.getByText(cs.signIn.errors['step-up-mismatch'])).toBeVisible();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expectStillSignedIn(page);
});
