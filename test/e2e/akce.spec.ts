/**
 * J3, the akce: a teacher proposes an akce with a person responsible, a reviewer approves it, a reader
 * finds it on /akce; once it is over the daily job asks for a report (`jobs:run` and Mailpit) and
 * „Napsat zprávu“ opens the draft report made from it.
 */
import { renderMail } from '@/notify';
import { future, people, points, review } from '@/ui/copy';

import { fillAkce, emailOf, idOfUrl, isoInDays, signInAsRe, statusSaying } from './akce-steps';
import { forgetFutureOf, moveFutureToPast, readFuture } from './future-db';
import { forgetPointsOf } from './db';
import { E2E_ENV } from './env';
import { expect, field, signInElsewhere, test } from './fixtures';
import { runJobForMail } from './jobs';
import { mailpit } from './mailpit';

/** The queue is shared by both projects, so the title says whose it is. */
const titleOf = (project: string) => `Exkurze do Muzea knihy (${project})`;
const ORIGIN = E2E_ENV.APP_ORIGIN;

test.describe('the akce journey', () => {
  // One author per project; their akce, reports and mail are cleared around the test.
  test.describe.configure({ mode: 'serial' });
  // The job runs from the CLI, and waits for the next minute when the other project queued it in this one.
  test.setTimeout(150_000);
  const clear = async (project: string) => {
    const email = emailOf('zapis', project);
    await forgetFutureOf(email);
    await forgetPointsOf(email);
    await mailpit.forget(email);
  };
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('is written, approved, read, and after it a report is asked for and started', async ({
    page,
    hydrated,
    settled,
    signInAs,
    newContext,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const TITLE = titleOf(project);
    await signInAs(signInAsRe('zapis', project));

    // The author starts an akce and fills it in; the autosave keeps it.
    await page.goto('/akce/novy');
    await hydrated();
    await expectAccessible();
    await page.getByRole('radio', { name: future.kind.akce, exact: true }).check();
    await page.getByRole('button', { name: future.chooser.start }).click();
    await expect(page).toHaveURL(/\/akce\/[0-9a-f-]{36}$/);
    const id = idOfUrl(page);
    await hydrated();
    await fillAkce(page, { title: TITLE, start: isoInDays(20) });
    await expectAccessible();
    await page.getByRole('button', { name: future.editor.submit }).click();
    await expect(page.getByRole('button', { name: future.editor.retract.button })).toBeVisible();
    await expect(page.getByText(future.state.submitted, { exact: true }).first()).toBeVisible();
    expect((await readFuture(id)).state).toBe('submitted');

    // The reviewer finds it in the queue and approves it.
    const reviewer = await signInElsewhere(newContext, signInAsRe('revizor', project));
    await reviewer.goto('/kontrola/akce');
    await hydrated(reviewer);
    await expect(
      reviewer.getByRole('heading', { level: 1, name: review.future.title }),
    ).toBeVisible();
    await reviewer.getByRole('link', { name: TITLE }).click();
    await expect(reviewer).toHaveURL(new RegExp(`/akce/${id}$`));
    await hydrated(reviewer);
    await reviewer.getByRole('button', { name: review.decision.approve, exact: true }).click();
    await expect(statusSaying(reviewer, future.review.said.approve)).toBeVisible();
    expect((await readFuture(id)).state).toBe('approved');

    // A colleague who wrote nothing finds it on the list and reads it.
    const reader = await signInElsewhere(newContext, signInAsRe('ctenar', project));
    await reader.goto('/akce');
    await hydrated(reader);
    await reader.getByRole('link', { name: TITLE }).click();
    await expect(reader.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(reader.getByText('Jana Nováková')).toBeVisible();
    await expect(reader.getByText(future.state.approved, { exact: true }).first()).toBeVisible();
    await expectAccessible(reader);

    // The akce is over: the daily job asks for the report, by mail that names no akce.
    const day = await moveFutureToPast(id, 3);
    const mail = await runJobForMail('future.report-prompt', 'daily', emailOf('zapis', project));
    expect(mail.subject).toBe(renderMail('report.prompt', {}, ORIGIN).subject);
    expect(mail.text).not.toContain(TITLE);
    expect(mail.text).toMatch(new RegExp(`^${ORIGIN}/body\\s*$`, 'm'));

    // The author follows it: the card on „Moje body“ waits with the akce, and „Napsat zprávu“ opens the draft made from it.
    await page.goto('/body');
    await hydrated();
    const card = page.getByRole('heading', { name: future.report.title });
    await expect(card).toBeVisible();
    await expectAccessible();
    await page.getByRole('radio', { name: 'Seminář', exact: true }).check();
    await page.getByRole('button', { name: future.report.start }).click();
    await expect(page).toHaveURL(/\/body\/[0-9a-f-]{36}$/);
    await hydrated();
    await settled();
    await expect(field(page, points.editor.title)).toHaveValue(TITLE);
    await expect(field(page, points.facts.eventDate)).toHaveValue(day);
    await expect(page.getByRole('listitem').filter({ hasText: 'Jana Nováková' })).toBeVisible();
    await expectAccessible();

    // The author submits the report; the akce counts as written and the card stops offering it.
    const reportId = idOfUrl(page);
    // What the report still needs: a participant from the directory and one statement.
    const participants = page.getByRole('main').getByRole('group', { name: /^Účastníci/ });
    const box = participants.getByRole('combobox', { name: points.bullets.addPerson });
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await box.click();
    await box.pressSequentially('Svobod');
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'Petr Svoboda', exact: true })
      .click();
    await participants
      .getByRole('button', { name: people.chips.bulk.setLabel('pan'), exact: true })
      .click();
    await page.getByRole('button', { name: points.statements.add }).click();
    const statement = page.getByRole('group', { name: points.statements.legend(1) });
    await field(statement, points.statements.speaker).selectOption({ label: 'Petr Svoboda' });
    await field(statement, points.statements.genitive).fill('Petra Svobody');
    await field(statement, points.statements.quote).fill('Exkurze se vydařila.');
    await field(statement, points.statements.quote).blur();
    await expect(page.getByText(/^Uloženo v/)).toBeVisible();
    await page.getByRole('button', { name: points.submit.button }).click();
    await expect(page.getByText(points.state.submitted, { exact: true }).first()).toBeVisible();
    expect(await readFuture(id)).toMatchObject({ reportState: 'written', reportPointId: reportId });
    await page.goto('/body');
    await hydrated();
    await expect(page.getByRole('heading', { name: future.report.title })).toHaveCount(0);
  });
});
