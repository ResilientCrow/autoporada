/** J2, the review: a reviewer returns a point, its author rewrites it, the reviewer approves; and what a reviewer may not do. */
import { renderMail } from '@/notify';
import { points, review } from '@/ui/copy';

import { forgetPointsOf, personaOf, seedPoint } from './db';
import { E2E_ENV } from './env';
import { expect, field, signInElsewhere, test } from './fixtures';
import { mailpit } from './mailpit';

const TITLE = 'Seminář k vrácení';
const OWN_TITLE = 'Vlastní bod kontrolora';
const PHRASE = review.decision.phrases[0];
const ORIGIN = E2E_ENV.APP_ORIGIN;

test.describe('the review', () => {
  // One author and one reviewer per project, whose points are cleared around each test: they take turns.
  test.describe.configure({ mode: 'serial' });

  const people = (project: string) => ({
    author: personaOf('vraceny', project),
    reviewer: personaOf('kontrolor', project),
  });
  const clear = async (project: string) => {
    const { author, reviewer } = people(project);
    await forgetPointsOf(author.email);
    await forgetPointsOf(reviewer.email);
    await mailpit.forget(author.email);
  };
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('a returned point is rewritten and handed in again, then approved, and both decisions stay in its history', async ({
    page,
    hydrated,
    settled,
    signInAs,
    newContext,
    expectAccessible,
  }, testInfo) => {
    const { author, reviewer } = people(testInfo.project.name);
    const pointId = await seedPoint(author.email, TITLE, 'submitted');

    // The reviewer returns it with a quick phrase.
    await signInAs(new RegExp(`^Test – ${reviewer.subject}`));
    await page.goto(`/kontrola/${pointId}`);
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expectAccessible();
    await page.getByRole('button', { name: review.decision.return }).click();
    await page.getByRole('button', { name: PHRASE, exact: true }).click();
    await expect(page.getByLabel(review.decision.note)).toHaveValue(PHRASE);
    await expectAccessible();
    await page.getByRole('button', { name: review.decision.return }).click();
    await settled();
    await expect(page.getByText(review.decision.said.return)).toBeVisible();
    await expect(page.getByText(points.state.returned, { exact: true }).first()).toBeVisible();

    // The author sees the note on the point, and the mail names no title and links to /body.
    const authorPage = await signInElsewhere(newContext, new RegExp(`^Test – ${author.subject}`));
    await authorPage.goto(`/body/${pointId}`);
    await expect(authorPage.getByText(points.timeline.returned(PHRASE))).toBeVisible();
    const mail = await mailpit.waitFor({ to: author.email });
    expect(mail.subject).toBe(renderMail('point.returned', {}, ORIGIN).subject);
    expect(mail.text).not.toContain(TITLE);
    expect(mail.text).not.toContain(PHRASE);
    expect(mail.text).toMatch(new RegExp(`^${ORIGIN}/#/moje\\s*$`, 'm'));
    expect(mail.text).not.toContain(pointId);

    // The author edits and hands it in again.
    await hydrated(authorPage);
    await expectAccessible(authorPage);
    await field(authorPage, points.facts.place).fill('v učebně S207');
    await expect(authorPage.getByText(/^Uloženo v/)).toBeVisible();
    await authorPage.getByRole('button', { name: points.submit.button }).click();
    await expect(authorPage.getByRole('button', { name: points.submit.button })).toHaveCount(0);
    await expect(
      authorPage.getByText(points.state.submitted, { exact: true }).first(),
    ).toBeVisible();

    // The reviewer approves and goes on: to another point of the shared queue, or back to it, never to this one.
    await page.goto(`/kontrola/${pointId}`);
    await hydrated();
    await expect(page.getByText(points.state.submitted, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: review.decision.approveNext }).click();
    await expect(page).toHaveURL(new RegExp(`/kontrola(?:/(?!${pointId})[0-9a-f-]{36})?$`));

    // Both decisions are in the history, newest first.
    await authorPage.reload();
    const lines = authorPage
      .getByRole('region', { name: points.timeline.label })
      .getByRole('listitem');
    await expect(lines).toHaveText([
      points.timeline.approve,
      /^Odesláno ke kontrole /,
      points.timeline.returned(PHRASE),
      /^Odesláno ke kontrole /,
    ]);
    await expect(
      authorPage.getByText(points.state.approved, { exact: true }).first(),
    ).toBeVisible();
    await expectAccessible(authorPage);
  });

  test('a reviewer cannot approve their own point, and a colleague’s draft is not found', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author, reviewer } = people(testInfo.project.name);
    const own = await seedPoint(reviewer.email, OWN_TITLE, 'submitted');
    const draft = await seedPoint(author.email, TITLE, 'draft');

    await signInAs(new RegExp(`^Test – ${reviewer.subject}`));
    await page.goto(`/kontrola/${own}`);
    await hydrated();
    await expect(page.getByText(review.decision.ownPoint)).toBeVisible();
    await expect(
      page.getByRole('button', { name: review.decision.approve, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: review.decision.approveNext })).toHaveCount(0);
    // The rest of the bar stays: the machine only keeps the approval from the author.
    await expect(page.getByRole('button', { name: review.decision.return })).toBeVisible();
    await expectAccessible();

    // Nobody else's draft is there to read, on either of the two routes.
    for (const path of [`/kontrola/${draft}`, `/body/${draft}`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByText(TITLE)).toHaveCount(0);
    }
  });
});
