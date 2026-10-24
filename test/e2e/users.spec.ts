/** „Uživatelé“ as the headmaster: the search, the groups, and two tabs deciding one request. */
import type { Page } from '@playwright/test';

import { cs, users } from '@/ui/copy';

import { expect, test } from './fixtures';

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
