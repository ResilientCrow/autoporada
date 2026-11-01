/** What an author does with an akce that is already handed in: changes an approved one („Uložit změny“) or takes a submitted one back („Stáhnout“). */
import { future, points, review } from '@/ui/copy';

import { emailOf, signInAsRe, statusSaying } from './akce-steps';
import { forgetFutureOf, readFuture, seedFuture } from './future-db';
import { expect, field, signInElsewhere, test } from './fixtures';

test.describe('an akce handed in', () => {
  // One author per project; the tests take turns and each clears the akce it made.
  test.describe.configure({ mode: 'serial' });
  const clear = (project: string) => forgetFutureOf(emailOf('uprav', project));
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('an approved akce is changed with one press, goes back to review and the reviewer sees it as a change', async ({
    page,
    hydrated,
    signInAs,
    newContext,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const OLD = `Výlet na Karlštejn (${project})`;
    const NEW = `Výlet na Křivoklát (${project})`;
    const id = await seedFuture(emailOf('uprav', project), OLD, 'approved');
    await signInAs(signInAsRe('uprav', project));
    await page.goto(`/akce/${id}`);
    await hydrated();
    await expect(page.getByText(future.editor.reviseNotice)).toBeVisible();
    await expectAccessible();

    // Nothing changed: the press says so, each time, and writes nothing.
    const save = page.getByRole('button', { name: future.editor.revise });
    await save.click();
    await expect(statusSaying(page, future.editor.unchanged)).toBeVisible();
    expect(await readFuture(id)).toMatchObject({ state: 'approved', version: 1, title: OLD });

    // The press sends what is typed even though the field was never left, and the page then shows the akce waiting.
    await field(page, points.editor.title).fill(NEW);
    await save.click();
    await expect(page.getByText(future.state.submitted, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: NEW })).toBeVisible();
    await expect(page.getByRole('button', { name: future.editor.retract.button })).toBeVisible();
    await expect(save).toHaveCount(0);
    expect(await readFuture(id)).toMatchObject({ state: 'submitted', title: NEW });

    // The reviewer finds it flagged as a change of an approved akce.
    const reviewer = await signInElsewhere(newContext, signInAsRe('revizor', project));
    await reviewer.goto('/kontrola/akce');
    const row = reviewer.getByRole('listitem').filter({ hasText: NEW });
    await expect(row).toContainText(review.future.revised);
    await expectAccessible(reviewer);
  });

  test('a submitted akce is taken back and opens as a draft again', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const TITLE = `Návštěva divadla (${project})`;
    const id = await seedFuture(emailOf('uprav', project), TITLE, 'submitted');
    await signInAs(signInAsRe('uprav', project));
    await page.goto(`/akce/${id}`);
    await hydrated();
    await expect(page.getByText(future.editor.retract.hint)).toBeVisible();
    await expect(field(page, points.editor.title)).toHaveCount(0);
    await expectAccessible();

    await page.getByRole('button', { name: future.editor.retract.button }).click();
    // The page refreshes into the editor: the title is a field again and the hand-in is offered.
    await expect(field(page, points.editor.title)).toHaveValue(TITLE);
    await expect(page.getByRole('button', { name: future.editor.submit })).toBeVisible();
    await expect(page.getByText(future.state.draft, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: future.editor.retract.button })).toHaveCount(0);
    expect((await readFuture(id)).state).toBe('draft');
    await expectAccessible();
  });
});
