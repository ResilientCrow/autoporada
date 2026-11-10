/**
 * J6: a porada moves within its week, a porada that does not take place is dropped, and another is
 * added in its place (ADR 0054); and a report of a Sunday akce handed in at 22.00 lands in
 * Monday's preview.
 *
 * The move and the late-report tests work on Mondays of their own, far enough ahead for no seeded
 * point to sit on them, and forget them afterwards. A drop rewrites the shared calendar (rows for
 * the Mondays before it, `plannedThrough`) and the Přehled strip holds only the next four Mondays,
 * so the drop journey runs once, in the desktop project, on the fourth Monday, and restores the
 * calendar setting afterwards.
 */
import { formatNumericDate, formatTitleDate } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { issues, porada } from '@/ui/copy';

import { forgetPoints, personaOf } from './db';
import { expect, freezeClock, test } from './fixtures';
import {
  addDaysIso,
  forgetIssues,
  mondayIn,
  readCalendarSetting,
  restoreCalendarSetting,
  seedHandedIn,
} from './porada-db';

const WEEK = {
  move: { desktop: 14, mobile: 17 },
  late: { desktop: 20, mobile: 23 },
  drop: { desktop: 3, mobile: 3 },
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

test.describe('J6: move, drop and add a porada', () => {
  const seeded: string[] = [];
  test.afterEach(async ({}, testInfo) => {
    const project = testInfo.project.name;
    const move = mondayIn(weekOf('move', project));
    const late = mondayIn(weekOf('late', project));
    // Only the point this test made: the other tests of the file share the author, in parallel.
    await forgetPoints(seeded.splice(0));
    await forgetIssues([move, late, addDaysIso(late, -7)]);
  });

  test('a porada moves to another day of its week and keeps its page', async ({
    page,
    hydrated,
    settled,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = mondayIn(weekOf('move', project));
    const tuesday = addDaysIso(day, 1);
    await signInAs(headmaster(project));
    await page.goto(`/porada/${day}`);
    await hydrated();
    const heading = page.getByRole('heading', {
      name: porada.meeting(formatTitleDate(parseIsoDate(day))),
    });
    await expect(heading).toBeVisible();
    const deadline = page.getByText(/^Uzávěrka: /);
    const before = await deadline.textContent();

    await page.getByRole('button', { name: porada.move.title }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByLabel(porada.move.day);
    await expect(field).toHaveValue(day);

    // Its own meeting date changes nothing, and the dialog says so.
    await field.fill(day);
    await expect(dialog.getByText(porada.move.refused.same)).toBeVisible();

    await field.fill(tuesday);
    await expect(dialog.getByText(/^Porada bude úterý .*, uzávěrka /)).toBeVisible();
    await expectAccessible();
    await dialog.getByRole('button', { name: porada.move.submit }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await settled();

    // The URL is the Monday's and stays; the meeting date and the deadline are the new day's.
    await expect(page).toHaveURL(new RegExp(`/porada/${day}$`));
    await expect(
      page.getByRole('heading', { name: porada.meeting(formatTitleDate(parseIsoDate(tuesday))) }),
    ).toBeVisible();
    await expect(deadline).not.toHaveText(before ?? '');
  });

  test('a porada that does not take place is dropped, and another is added in its week', async ({
    page,
    hydrated,
    settled,
    signInAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the calendar is shared: one project drops');
    const dropped = mondayIn(weekOf('drop', 'desktop'));
    const heir = addDaysIso(dropped, 7);
    const label = formatNumericDate(parseIsoDate(dropped));
    const setting = await readCalendarSetting();
    try {
      await signInAs(headmaster('desktop'));
      await page.goto('/klasicke');
      await hydrated();
      const strip = page.getByRole('heading', { level: 2, name: issues.strip.title });
      await expect(strip).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: label })).toBeVisible();

      await page.goto(`/porada/${dropped}`);
      await hydrated();
      await page.getByRole('button', { name: porada.drop.title }).click();
      let dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/^Porada .* se nebude konat/)).toBeVisible();

      // Nothing is dropped without the tick.
      await dialog.getByRole('button', { name: porada.drop.submit }).click();
      await settled();
      await expect(dialog.getByText(issues.strip.unconfirmed).first()).toBeVisible();
      await expect(dialog).toBeVisible();

      await dialog.getByLabel(porada.drop.confirm).check();
      await dialog.getByRole('button', { name: porada.drop.submit }).click();
      await expect(page).toHaveURL(new RegExp(`/porada/${heir}$`));
      await hydrated();
      await expect(
        page.getByRole('heading', { name: porada.meeting(formatTitleDate(parseIsoDate(heir))) }),
      ).toBeVisible();

      // The dropped porada exists nowhere: no page, no line in the strip, no entry in the archive.
      const gone = await page.goto(`/porada/${dropped}`);
      expect(gone?.status()).toBe(404);
      await page.goto('/klasicke');
      await hydrated();
      await expect(page.getByRole('heading', { level: 3, name: label })).toHaveCount(0);
      await page.goto('/porada/archiv');
      await hydrated();
      await expect(page.getByText(label)).toHaveCount(0);

      // The week it left empty takes a porada again: a Tuesday of it.
      const added = addDaysIso(dropped, 1);
      await page.goto('/klasicke');
      await hydrated();
      await page.getByRole('button', { name: issues.strip.add.title }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel(issues.strip.add.day).fill(added);
      await expect(dialog.getByText(/^Nová porada úterý .*, uzávěrka /)).toBeVisible();
      await dialog.getByRole('button', { name: issues.strip.add.submit }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(
        page.getByText(issues.strip.add.said(formatNumericDate(parseIsoDate(added)))),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 3, name: formatNumericDate(parseIsoDate(added)) }),
      ).toBeVisible();

      // Its page is the dropped Monday's, which the key never leaves.
      await page.goto(`/porada/${dropped}`);
      await hydrated();
      await expect(
        page.getByRole('heading', { name: porada.meeting(formatTitleDate(parseIsoDate(added))) }),
      ).toBeVisible();
    } finally {
      await forgetIssues([dropped, heir]);
      await restoreCalendarSetting(setting);
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
