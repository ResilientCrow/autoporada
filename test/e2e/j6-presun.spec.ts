/**
 * J6: „Porada se nekoná“ holds the next porada on any day (ADR 0051): a later porada moved to a
 * Tuesday, or this one moved within its week, which the Přehled line shows; and a report of a
 * Sunday akce handed in at 22.00 lands in Monday's preview.
 *
 * Every test works on Mondays of its own, far enough ahead for no seeded point to sit on them, and
 * forgets them afterwards. The Přehled strip holds only the next four Mondays, shared with the
 * other specs, so the strip test moves one of them and runs once, in the desktop project.
 */
import { issues, porada, status } from '@/ui/copy';

import { forgetPoints, personaOf } from './db';
import { expect, freezeClock, test } from './fixtures';
import { addDaysIso, forgetIssues, mondayIn, seedHandedIn } from './porada-db';

const WEEK = {
  move: { desktop: 14, mobile: 17 },
  late: { desktop: 20, mobile: 23 },
  strip: { desktop: 1, mobile: 1 },
} as const;

const weekOf = (test: keyof typeof WEEK, project: string) =>
  WEEK[test][project as 'desktop' | 'mobile'];
const headmaster = (project: string) =>
  new RegExp(`^Test – ${personaOf('rizeni', project).subject}`);

/** The instant a Prague wall clock shows `time` on `iso`, as an ISO string with its offset. */
function pragueInstant(iso: string, time: string): string {
  const offset =
    new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${iso}T12:00:00Z`))
      .find((p) => p.type === 'timeZoneName')
      ?.value.replace('GMT', '') ?? '+00:00';
  return `${iso}T${time}:00${offset}`;
}

test.describe('J6: the next porada on any day', () => {
  const seeded: string[] = [];
  test.afterEach(async ({}, testInfo) => {
    const project = testInfo.project.name;
    const move = mondayIn(weekOf('move', project));
    const late = mondayIn(weekOf('late', project));
    // Only the point this test made: the other tests of the file share the author, in parallel.
    await forgetPoints(seeded.splice(0));
    await forgetIssues([move, addDaysIso(move, 7), late, addDaysIso(late, -7)]);
  });

  test('the next porada is held on a Tuesday, and this one does not take place', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = mondayIn(weekOf('move', project));
    const next = addDaysIso(day, 7);
    await signInAs(headmaster(project));
    await page.goto(`/porada/${day}`);
    await hydrated();
    await page.getByRole('button', { name: porada.skip.title }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByLabel(porada.skip.nextMeeting);
    // Pre-filled with the next porada as it is.
    await expect(field).toHaveValue(next);

    // Its own meeting date changes nothing, and the dialog says so.
    await field.fill(day);
    await expect(dialog.getByText(porada.skip.refused.same)).toBeVisible();

    // The Tuesday after the next Monday: that porada moves there.
    await field.fill(addDaysIso(next, 1));
    await expect(dialog.getByText(/^Další porada bude úterý /)).toBeVisible();
    await expectAccessible();
    await dialog.getByLabel(issues.strip.skip.confirm).check();
    await dialog.getByRole('button', { name: issues.strip.skip.submit }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText(status.issue.skipped).first()).toBeVisible();

    await page.goto(`/porada/${next}`);
    await hydrated();
    await expect(page.getByText(/^Přesunuto z\u00a0pondělí /)).toBeVisible();
  });

  test('the Přehled line shows a porada moved within its week', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the strip is shared: one project moves it');
    const day = mondayIn(weekOf('strip', 'desktop'));
    // The other tests clean up their own Mondays only: this one is shared with nobody but the strip.
    try {
      await signInAs(headmaster('desktop'));
      await page.goto(`/porada/${day}`);
      await hydrated();
      await page.getByRole('button', { name: porada.skip.title }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(porada.skip.nextMeeting).fill(addDaysIso(day, 1));
      await dialog.getByLabel(issues.strip.skip.confirm).check();
      await dialog.getByRole('button', { name: issues.strip.skip.submit }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByText(/^Přesunuto z\u00a0pondělí /)).toBeVisible();
      await page.goto('/klasicke');
      await hydrated();
      await expect(page.getByText(/^Porada se koná .*, uzávěrka /)).toBeVisible();
    } finally {
      await forgetIssues([day]);
    }
  });

  test('a report of a Sunday akce handed in at 22:00 is in Monday’s preview', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = mondayIn(weekOf('late', project));
    const title = `Nedělní akce J6 ${project}`;
    const lateId = await seedHandedIn(personaOf('ctenar', project).email, title, 'approved', {
      monday: day,
      eventDate: addDaysIso(day, -1),
      submittedAt: pragueInstant(addDaysIso(day, -1), '22:00'),
    });
    seeded.push(lateId);
    await freezeClock(page);
    await signInAs(headmaster(project));

    await page.goto(`/porada/${day}/nahled`);
    await hydrated();
    const paper = page.getByRole('region', { name: porada.preview.paper });
    await expect(paper).toContainText(title);

    await page.goto(`/porada/${addDaysIso(day, -7)}/nahled`);
    await hydrated();
    await expect(page.getByRole('region', { name: porada.preview.paper })).not.toContainText(title);
  });
});
