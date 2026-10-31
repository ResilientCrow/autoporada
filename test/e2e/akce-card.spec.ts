/** The report card („Akce čekající na zprávu“) on the home page: „Napsat zprávu“ opens the prefilled draft, a decline drops the akce and is announced. */
import { future, points } from '@/ui/copy';

import { emailOf, signInAsRe, statusSaying } from './akce-steps';
import { forgetPointsOf } from './db';
import { expect, field, test } from './fixtures';
import { forgetFutureOf, readFuture, seedFuture } from './future-db';

test.describe('the report card', () => {
  // One author per project, whose ended akce and reports are cleared around each test: the tests take turns.
  test.describe.configure({ mode: 'serial' });
  const clear = async (project: string) => {
    const email = emailOf('karta', project);
    await forgetFutureOf(email);
    await forgetPointsOf(email);
  };
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('„Napsat zprávu“ on the home page opens the draft made from the akce', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const email = emailOf('karta', testInfo.project.name);
    const id = await seedFuture(email, 'Exkurze do Terezína', 'approved', {
      startInDays: -3,
      expectsReport: true,
    });
    await signInAs(signInAsRe('karta', testInfo.project.name));
    await page.goto('/');
    await hydrated();
    await expect(page.getByRole('heading', { name: future.report.title })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exkurze do Terezína' })).toHaveAttribute(
      'href',
      `/akce/${id}`,
    );
    await expectAccessible();

    // A press without a type says what is missing; with one it opens the draft.
    await page.getByRole('button', { name: future.report.start }).click();
    await expect(page.getByText(future.report.typeRequired).first()).toBeVisible();
    await page.getByRole('radio', { name: 'Seminář', exact: true }).check();
    await page.getByRole('button', { name: future.report.start }).click();
    await expect(page).toHaveURL(/\/body\/[0-9a-f-]{36}$/);
    await hydrated();
    await expect(field(page, points.editor.title)).toHaveValue('Exkurze do Terezína');
    await expect(page.getByRole('listitem').filter({ hasText: 'Jana Nováková' })).toBeVisible();
    expect((await readFuture(id)).reportPointId).not.toBeNull();
  });

  test('„Zprávu psát nebudu“ drops the akce, says so and keeps focus on the card', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const email = emailOf('karta', testInfo.project.name);
    const first = await seedFuture(email, 'Exkurze do Plzně', 'approved', {
      startInDays: -3,
      expectsReport: true,
    });
    await seedFuture(email, 'Exkurze do Brna', 'approved', {
      startInDays: -4,
      expectsReport: true,
    });
    await signInAs(signInAsRe('karta', testInfo.project.name));
    await page.goto('/');
    await hydrated();
    const heading = page.getByRole('heading', { name: future.report.title });
    const row = (title: string) =>
      page.getByRole('listitem').filter({ has: page.getByRole('link', { name: title }) });

    await row('Exkurze do Plzně').getByRole('button', { name: future.report.decline }).click();
    // The row is gone with its button, so the card announces it and takes focus.
    await expect(statusSaying(page, future.report.declined('Exkurze do Plzně'))).toBeVisible();
    await expect(row('Exkurze do Plzně')).toHaveCount(0);
    await expect(row('Exkurze do Brna')).toBeVisible();
    await expect(heading).toBeFocused();
    expect((await readFuture(first)).reportState).toBe('declined');
    await expectAccessible();

    // The last one: the card stays long enough to say it, with nothing left to press.
    await row('Exkurze do Brna').getByRole('button', { name: future.report.decline }).click();
    await expect(statusSaying(page, future.report.declined('Exkurze do Brna'))).toBeVisible();
    await expect(page.getByRole('button', { name: future.report.decline })).toHaveCount(0);
    await expect(heading).toBeFocused();
    await expectAccessible();

    // A fresh load has no card at all.
    await page.reload();
    await hydrated();
    await expect(heading).toHaveCount(0);
  });
});
