/**
 * After a decision or a cancel on /akce/[id] the button pressed is gone with the refresh, so the page
 * must say what happened in its status region and put focus on the title: for a reviewer's decision,
 * for a headmaster approving their own akce (which turns the read view into the editor) and for a cancel.
 */
import type { Page } from '@playwright/test';

import { future, review } from '@/ui/copy';

import { emailOf, signInAsRe, statusSaying } from './akce-steps';
import { forgetFutureOf, readFuture, seedFuture } from './future-db';
import { expect, signInElsewhere, test } from './fixtures';

/** The page says it, and focus is on the item's title. */
async function expectSaidAndFocused(page: Page, said: string, title: string): Promise<void> {
  await expect(statusSaying(page, said)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeFocused();
}

test.describe('deciding on an akce', () => {
  // The authors and the reviewer are per project, and each test clears what it seeded.
  test.describe.configure({ mode: 'serial' });
  const clear = async (project: string) => {
    await forgetFutureOf(emailOf('navrh', project));
    await forgetFutureOf(emailOf('rizeni', project));
  };
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('a reviewer approves, and returns with a note: each is said and keeps focus on the title', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const author = emailOf('navrh', project);
    const approve = await seedFuture(author, `Exkurze ke schválení (${project})`, 'submitted');
    const back = await seedFuture(author, `Exkurze k vrácení (${project})`, 'submitted');
    await signInAs(signInAsRe('revizor', project));

    await page.goto(`/akce/${approve}`);
    await hydrated();
    await expectAccessible();
    await page.getByRole('button', { name: review.decision.approve, exact: true }).click();
    await expectSaidAndFocused(
      page,
      future.review.said.approve,
      `Exkurze ke schválení (${project})`,
    );
    await expect(page.getByText(future.state.approved, { exact: true }).first()).toBeVisible();
    expect((await readFuture(approve)).state).toBe('approved');

    await page.goto(`/akce/${back}`);
    await hydrated();
    await page.getByRole('button', { name: review.decision.return }).click();
    // A return without a note is refused where it stands.
    await page.getByRole('button', { name: review.decision.return }).click();
    await expect(page.getByText(review.decision.noteRequired).first()).toBeVisible();
    await page.getByRole('button', { name: future.review.phrases[0], exact: true }).click();
    await expectAccessible();
    await page.getByRole('button', { name: review.decision.return }).click();
    await expectSaidAndFocused(page, future.review.said.return, `Exkurze k vrácení (${project})`);
    expect((await readFuture(back)).state).toBe('returned');
  });

  test('a headmaster approves their own akce: the page turns into the editor and still says so', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const TITLE = `Ředitelova akce (${project})`;
    const id = await seedFuture(emailOf('rizeni', project), TITLE, 'submitted');
    await signInAs(signInAsRe('rizeni', project));
    await page.goto(`/akce/${id}`);
    await hydrated();
    await page.getByRole('button', { name: review.decision.approve, exact: true }).click();
    await expectSaidAndFocused(page, future.review.said.approve, TITLE);
    // The author's own view of an approved akce is the editor with „Uložit změny“, not the read view.
    await expect(page.getByRole('button', { name: future.editor.revise })).toBeVisible();
    await expectAccessible();
  });

  test('an approved akce is cancelled by its author and by a reviewer, after the box is ticked', async ({
    page,
    hydrated,
    signInAs,
    newContext,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const OWN = `Akce k zrušení autorem (${project})`;
    const OTHER = `Akce k zrušení kontrolou (${project})`;
    const author = emailOf('navrh', project);
    const own = await seedFuture(author, OWN, 'approved');
    const other = await seedFuture(author, OTHER, 'approved');
    await signInAs(signInAsRe('navrh', project));
    await page.goto(`/akce/${own}`);
    await hydrated();
    const cancel = page.getByRole('button', { name: future.review.cancel.button });
    // Not ticked: nothing is cancelled.
    await cancel.click();
    await expect(page.getByText(future.review.cancel.unconfirmed).first()).toBeVisible();
    expect((await readFuture(own)).state).toBe('approved');
    await expectAccessible();
    await page.getByRole('checkbox', { name: future.review.cancel.confirm }).check();
    await cancel.click();
    await expectSaidAndFocused(page, future.review.cancel.said, OWN);
    await expect(page.getByText(future.state.cancelled, { exact: true }).first()).toBeVisible();
    expect((await readFuture(own)).state).toBe('cancelled');

    const reviewer = await signInElsewhere(newContext, signInAsRe('revizor', project));
    await reviewer.goto(`/akce/${other}`);
    await hydrated(reviewer);
    await reviewer.getByRole('checkbox', { name: future.review.cancel.confirm }).check();
    await reviewer.getByRole('button', { name: future.review.cancel.button }).click();
    await expectSaidAndFocused(reviewer, future.review.cancel.said, OTHER);
    expect((await readFuture(other)).state).toBe('cancelled');
  });
});
