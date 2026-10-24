/** „Uživatelé“ as the headmaster: the search, the groups, and two tabs deciding one request. */
import type { Locator, Page } from '@playwright/test';

import { access, cs, users } from '@/ui/copy';

import { expect, openUserDetail, signInElsewhere, test } from './fixtures';

const queueItem = (page: Page, name: string) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: users.queue.title }) })
    .getByRole('listitem')
    .filter({ hasText: name });

test.describe('the list', () => {
  test('a search ignores diacritics, and a group keeps it', async ({
    page,
    hydrated,
    signInAs,
  }) => {
    await signInAs(/^Ředitel/);
    await page.goto('/uzivatele');
    await hydrated();
    const search = page.getByRole('search');
    await search.getByLabel(users.people.searchLabel).fill('novak');
    await search.getByRole('button', { name: users.people.search }).click();
    await expect(page).toHaveURL(/hledat=novak/);
    await expect(page.getByText(users.people.found(1), { exact: true })).toBeVisible();
    await expect(page.getByText('Jana Nováková', { exact: true })).toBeVisible();

    const groups = page.getByRole('navigation', { name: users.people.groupsLabel });
    await groups.getByRole('link', { name: users.people.groups.pending }).click();
    await expect(page).toHaveURL(/hledat=novak/);
    await expect(groups.getByRole('link', { name: users.people.groups.pending })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(groups.locator('[aria-current]')).toHaveCount(1);
    await expect(page.getByLabel(users.people.searchLabel)).toHaveValue('novak');
    await expect(page.getByText('Jana Nováková', { exact: true })).toBeVisible();
  });
});

test('a request decided in another tab shows the conflict, focused, and the link loads the current state', async ({
  context,
  page,
  hydrated,
  settled,
  signInAs,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'journeys change data, so they run once');
  await signInAs(/^Ředitel/);
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto('/uzivatele');
    await expect(queueItem(tab, 'Sáva Sporný')).toBeVisible();
  }
  await hydrated();

  await queueItem(page, 'Sáva Sporný').getByRole('button', { name: users.queue.reject }).click();
  await settled();
  await expect(queueItem(page, 'Sáva Sporný')).toHaveCount(0);

  // Tab B still shows the request as it was; its version is stale.
  const stale = queueItem(other, 'Sáva Sporný');
  await hydrated(other);
  await stale.getByRole('button', { name: users.queue.approveStaff }).click();
  const problem = other
    .locator('form')
    .filter({ has: other.getByRole('alert') })
    .locator('[tabindex="-1"]')
    .filter({ has: other.getByRole('alert') });
  await expect(problem).toBeFocused();
  await expect(problem).toContainText(cs.errors.conflict);
  await problem.getByRole('link', { name: cs.problemActions.reload }).click();
  await expect(queueItem(other, 'Sáva Sporný')).toHaveCount(0);
  await expect(other.getByRole('heading', { name: users.queue.title })).toBeVisible();
});

test.describe('administration by the deputy headmaster', () => {
  const ACTOR = /^Test – zastupce/;

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'journeys change data, so they run once');
  });

  const main = (page: Page) => page.getByRole('main');
  const facts = (page: Page, text: string) =>
    main(page).getByRole('definition').filter({ hasText: text });
  const roleForm = (page: Page) => page.locator('form#role');
  const accountForm = (page: Page) => page.locator('form#ucet');
  const problemOf = (form: Locator) =>
    form.locator('[tabindex="-1"]').filter({ has: form.page().getByRole('alert') });

  /** The regression of duplicate keys: a form or a section shown twice after a refresh. */
  async function expectOneOfEach(page: Page): Promise<void> {
    const ids = await page.locator('main form[id]').evaluateAll((forms) => forms.map((f) => f.id));
    expect(new Set(ids).size, `form ids ${ids.join(', ')}`).toBe(ids.length);
    const titles = await main(page).getByRole('heading', { level: 2 }).allTextContents();
    expect(new Set(titles).size, `headings ${titles.join(', ')}`).toBe(titles.length);
  }

  test('a role is raised, then lowered only with the confirmation', async ({
    page,
    hydrated,
    settled,
    signInAs,
  }) => {
    await signInAs(ACTOR);
    await openUserDetail(page, 'Pavla Povýšená');
    await hydrated();
    const role = roleForm(page).getByLabel(users.detail.access.roleLabel, { exact: true });
    const save = roleForm(page).getByRole('button', { name: users.detail.access.save });

    await role.selectOption({ label: cs.status.role.reviewer });
    await save.click();
    await settled();
    await expect(main(page).getByRole('status')).toHaveText(users.detail.access.said.changed);
    await expect(facts(page, cs.status.role.reviewer)).toBeVisible();
    await expect(roleForm(page)).toHaveCount(1);
    await expect(accountForm(page)).toHaveCount(1);
    await expectOneOfEach(page);

    // The confirmation shows only for a role that lowers access, so choose it first.
    await role.selectOption({ label: cs.status.role.submitter });
    await save.click();
    await settled();
    const problem = problemOf(roleForm(page));
    await expect(problem).toBeFocused();
    await expect(problem).toContainText(users.detail.access.unconfirmed);
    await expect(facts(page, cs.status.role.reviewer)).toBeVisible();

    await roleForm(page).getByLabel(users.detail.access.confirm).check();
    await save.click();
    await settled();
    await expect(facts(page, cs.status.role.submitter)).toBeVisible();
    await expectOneOfEach(page);
  });

  test('a student cannot be given a role above contributor', async ({
    page,
    hydrated,
    settled,
    signInAs,
  }) => {
    await signInAs(ACTOR);
    await openUserDetail(page, 'Tomáš Typový');
    await hydrated();
    const form = roleForm(page);
    await form.getByLabel(users.detail.access.roleLabel, { exact: true }).selectOption({
      label: cs.status.role.reviewer,
    });
    await form.getByLabel(users.detail.access.audienceLabel).selectOption({
      label: users.detail.access.audience.student,
    });
    await form.getByRole('button', { name: users.detail.access.save }).click();
    await settled();
    const problem = problemOf(form);
    await expect(problem).toBeFocused();
    await expect(problem).toContainText(cs.rules['student-role']);
    await expect(facts(page, cs.status.role.submitter)).toBeVisible();
  });

  test('further requests are blocked only with the confirmation, and the applicant sees it', async ({
    page,
    newContext,
    hydrated,
    settled,
    signInAs,
  }) => {
    await signInAs(ACTOR);
    await openUserDetail(page, 'Bohdan Blokace');
    await hydrated();
    const form = page.locator('form[id^="blokace-"]');
    await form.getByRole('button', { name: users.detail.block.submit }).click();
    await settled();
    const problem = problemOf(form);
    await expect(problem).toBeFocused();
    await expect(problem).toContainText(users.detail.block.unconfirmed);

    await form.getByLabel(users.detail.block.confirm).check();
    await form.getByRole('button', { name: users.detail.block.submit }).click();
    await settled();
    await expect(main(page).getByRole('status')).toHaveText(users.detail.block.said);
    await expect(main(page).getByText(cs.status.access.blocked, { exact: true })).toBeVisible();
    await expect(page.locator('form[id^="blokace-"]')).toHaveCount(0);
    await expectOneOfEach(page);

    const applicant = await signInElsewhere(newContext, /^Test – zablokovat/);
    await applicant.goto('/pristup');
    await expect(main(applicant).getByRole('heading', { level: 2 })).toHaveText(
      access.blocked.title,
    );
  });

  test('an account is blocked, refused at sign-in, and unblocked', async ({
    page,
    newContext,
    hydrated,
    settled,
    signInAs,
  }) => {
    await signInAs(ACTOR);
    await openUserDetail(page, 'Uršula Účetní');
    await hydrated();
    const form = accountForm(page);
    await form.getByLabel(users.detail.accountStatus.confirm).check();
    await form.getByRole('button', { name: users.detail.accountStatus.block }).click();
    await settled();
    await expect(main(page).getByRole('status')).toHaveText(
      users.detail.accountStatus.said.blocked,
    );
    await expect(facts(page, cs.status.account.blocked)).toBeVisible();
    await expect(accountForm(page)).toHaveCount(1);
    await expectOneOfEach(page);

    const other = await signInElsewhere(newContext, /^Test – ucet/);
    await expect(other).toHaveURL(/\/prihlaseni\?chyba=blocked$/);
    await expect(main(other).getByRole('alert')).toHaveText(cs.signIn.errors.blocked);

    await accountForm(page)
      .getByRole('button', { name: users.detail.accountStatus.unblock })
      .click();
    await settled();
    await expect(facts(page, cs.status.account.active)).toBeVisible();
    await expectOneOfEach(page);
  });

  test('a decision made on the detail page leaves one form per section', async ({
    page,
    hydrated,
    settled,
    signInAs,
  }) => {
    await signInAs(ACTOR);
    await openUserDetail(page, 'Radek Rozhodovaný');
    await hydrated();
    await page
      .locator('form[id^="rozhodnuti-"]')
      .getByRole('button', { name: users.queue.reject })
      .click();
    await settled();
    await expect(main(page).getByRole('status')).toHaveText(users.queue.said.rejected);
    await expect(main(page).getByText(cs.status.access.rejected, { exact: true })).toBeVisible();
    await expect(page.locator('form[id^="rozhodnuti-"]')).toHaveCount(0);
    await expect(roleForm(page)).toHaveCount(1);
    await expect(accountForm(page)).toHaveCount(1);
    await expectOneOfEach(page);
  });
});
