/**
 * The proposals path (design section 11): anyone who may write a point starts a finance or pokyn
 * proposal on /navrhy/novy, „Začít“ opens its draft on /body/{id}, and a reviewer edits it in place
 * with „Uložit úpravy“. The one author is cleared around each test; the id is found in the address.
 */
import { points, review } from '@/ui/copy';

import { idOfUrl, emailOf, signInAsRe } from './akce-steps';
import { forgetPointsOf, readPoint } from './db';
import { expect, field, signInElsewhere, test } from './fixtures';

test.describe('a proposal', () => {
  test.describe.configure({ mode: 'serial' });
  const clear = (project: string) => forgetPointsOf(emailOf('navrh', project));
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('is started on /navrhy/novy, written as a draft and edited in place by a reviewer', async ({
    page,
    hydrated,
    signInAs,
    newContext,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const TITLE = `Nákup tabulí (${project})`;
    await signInAs(signInAsRe('navrh', project));
    await page.goto('/navrhy/novy');
    await hydrated();
    await expect(
      page.getByRole('heading', { level: 1, name: points.proposal.title }),
    ).toBeVisible();
    const kinds = page.getByRole('radiogroup', { name: points.proposal.legend });
    await expect(kinds.getByRole('radio', { name: points.kind.finance })).toBeChecked();
    await expect(kinds.getByRole('radio', { name: points.kind.pokyn })).toBeVisible();
    await expectAccessible();

    await page.getByRole('button', { name: points.chooser.start }).click();
    await expect(page).toHaveURL(/\/body\/[0-9a-f-]{36}$/);
    await hydrated();
    const id = idOfUrl(page);
    // A proposal has a title and a text, nothing of a report's form.
    await field(page, points.editor.title).fill(TITLE);
    await field(page, points.proposal.text).fill('Do kmenových tříd chybí tabule.');
    await expect(page.getByText(/^Uloženo v/)).toBeVisible();
    await expect(page.getByRole('button', { name: points.submit.button })).toBeVisible();
    await expectAccessible();
    expect((await readPoint(id)).title).toBe(TITLE);
    await page.getByRole('button', { name: points.submit.button }).click();
    await expect(page.getByText(points.state.submitted, { exact: true }).first()).toBeVisible();

    const reviewer = await signInElsewhere(newContext, signInAsRe('revizor', project));
    await reviewer.goto(`/kontrola/${id}`);
    await expect(reviewer.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await reviewer.getByRole('button', { name: review.edit.open }).click();
    const editor = reviewer.getByRole('region', { name: review.edit.label });
    await field(reviewer, points.editor.title).fill(`${TITLE} upravené`);
    await editor.getByRole('button', { name: review.edit.save }).click();
    await expect(reviewer.getByText(review.edit.saved)).toBeVisible();
    await expect(
      reviewer.getByRole('heading', { level: 1, name: `${TITLE} upravené` }),
    ).toBeVisible();
    expect((await readPoint(id)).title).toBe(`${TITLE} upravené`);
  });
});
