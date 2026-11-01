/** The report card („Akce čekající na zprávu“) on the home page: „Napsat zprávu“ opens the prefilled draft. Every approved akce owes one (ADR 0048). */
import { future, points } from '@/ui/copy';

import { emailOf, signInAsRe } from './akce-steps';
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
});
