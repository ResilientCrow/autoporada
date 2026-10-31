/**
 * m8-screens: axe over every M8a route and listed state in both projects, seeded through db helpers
 * (J1 and J2 in points.spec.ts and review.spec.ts walk the happy paths and are not repeated here),
 * and the headmaster's strip of meetings, which server rendering cannot pin.
 *
 * The queue is shared by every reviewer of the run and J2 fills it meanwhile, so "Ve frontě už nic
 * nečeká." cannot be asserted here (no test controls every submitted point); queue.test.tsx has it.
 */
import { formatDayMonth } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { issues, points, review } from '@/ui/copy';

import {
  earliestMondayOf,
  forgetPointsOf,
  personaOf,
  reopenMeeting,
  SEED_NOTE,
  seedDrafts,
  seedPoint,
  type SeedState,
} from './db';
import { expect, field, openNav, signInElsewhere, test } from './fixtures';
import { standingLines } from './standing';

const dayMonth = (iso: string) => formatDayMonth(parseIsoDate(iso));

const people = (project: string) => ({
  author: personaOf('ukazky', project),
  reviewer: personaOf('prohlizi', project),
});

/** One point per state, and what its page shows: the editor or the read view, and the line of its history. */
const STATE_PAGES = [
  ['draft', true, null],
  ['returned', true, points.timeline.returned(SEED_NOTE)],
  ['submitted', false, /^Odesláno ke kontrole /],
  ['approved', false, points.timeline.approve],
  ['rejected', false, points.timeline.reject(SEED_NOTE)],
  ['withdrawn', false, points.timeline.withdraw],
  ['published', false, points.timeline.publish],
] as const satisfies readonly (readonly [SeedState, boolean, string | RegExp | null])[];

test.describe('the author’s and the reviewer’s screens', () => {
  // One author and one reviewer per project, cleared around each test: the tests take turns.
  test.describe.configure({ mode: 'serial' });

  const clear = async (project: string) => {
    const { author, reviewer } = people(project);
    await forgetPointsOf(author.email);
    await forgetPointsOf(reviewer.email);
  };
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('„Moje body“ is empty, then lists a point in each state in its group, the closed ones folded', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author } = people(testInfo.project.name);
    await signInAs(new RegExp(`^Test – ${author.subject}`));
    await page.goto('/body');
    await hydrated();
    await expect(page.getByText(points.mine.empty)).toBeVisible();
    await expectAccessible();

    const ids = new Map<SeedState, string>();
    for (const [state] of STATE_PAGES) {
      ids.set(state, await seedPoint(author.email, `Bod ${state}`, state));
    }
    await page.goto('/body');
    const { group } = points.mine;
    const headings = page.getByRole('main').getByRole('heading', { level: 2 });
    await expect(headings).toHaveText([
      group.returned,
      group.draft,
      group.submitted,
      group.approved,
      group.closed,
    ]);
    // The return note is under its point; an approved one names the porada it goes to.
    await expect(page.getByText(SEED_NOTE)).toBeVisible();
    const monday = await earliestMondayOf(ids.get('approved')!);
    await expect(page.getByText(points.mine.placement(dayMonth(monday)))).toBeVisible();
    // Rejected and cancelled points are folded away until the group is opened.
    const closed = page.locator('details').filter({ has: page.getByText(group.closed) });
    await expect(closed).not.toHaveAttribute('open');
    await expect(page.getByRole('link', { name: 'Bod rejected' })).toBeHidden();
    await expectAccessible();
    await closed.locator('summary').click();
    await expect(page.getByRole('link', { name: 'Bod rejected' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bod withdrawn' })).toBeVisible();
    await expectAccessible();
  });

  test('„Starší body“ continues the list past one page', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author } = people(testInfo.project.name);
    await seedDrafts(author.email, 201);
    await signInAs(new RegExp(`^Test – ${author.subject}`));
    await page.goto('/body');
    await hydrated();
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(200);
    await expectAccessible();
    await page.getByRole('link', { name: points.mine.older }).click();
    await expect(page).toHaveURL(/\/body\?pred=/);
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('link', { name: points.mine.older })).toHaveCount(0);
    // A page after a cursor is not an empty list.
    await expect(page.getByText(points.mine.empty)).toHaveCount(0);
    await expectAccessible();
  });

  for (const [state, editing, line] of STATE_PAGES) {
    test(`a ${state} point opens as ${editing ? 'the editor' : 'the read view'}`, async ({
      page,
      hydrated,
      signInAs,
      expectAccessible,
    }, testInfo) => {
      const { author } = people(testInfo.project.name);
      const TITLE = `Seminář ${state}`;
      const id = await seedPoint(author.email, TITLE, state);
      await signInAs(new RegExp(`^Test – ${author.subject}`));
      await page.goto(`/body/${id}`);
      await hydrated();
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
      await expect(page.getByText(points.state[state], { exact: true }).first()).toBeVisible();
      const submit = page.getByRole('button', { name: points.submit.button });
      await expect(submit).toHaveCount(editing ? 1 : 0);
      await expect(page.getByRole('heading', { name: points.read.label })).toHaveCount(
        editing ? 0 : 1,
      );
      const history = page.getByRole('region', { name: points.timeline.label });
      if (line === null) await expect(history).toHaveCount(0);
      else await expect(history.getByRole('listitem').first()).toHaveText(line);
      // „Stáhnout“ is for a submitted point only; „Zrušit bod“ is for every open one, drafts,
      // returned and submitted points (what each does is in editor.spec.ts).
      await expect(
        page.getByRole('button', { name: points.transitions.retract.button }),
      ).toHaveCount(state === 'submitted' ? 1 : 0);
      await expect(
        page.getByRole('button', { name: points.transitions.withdraw.button }),
      ).toHaveCount(editing || state === 'submitted' ? 1 : 0);
      await expectAccessible();
    });
  }

  test('the editor lists what is missing and each problem leads to its field', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author } = people(testInfo.project.name);
    const id = await seedPoint(author.email, 'Seminář k doplnění', 'draft');
    await signInAs(new RegExp(`^Test – ${author.subject}`));
    await page.goto(`/body/${id}`);
    await hydrated();
    await expect(page.getByText(points.readiness.ok)).toBeVisible();
    await field(page, points.editor.title).fill('');
    const problem = points.readiness.problem('title-required', {});
    await expect(page.getByRole('link', { name: problem })).toBeVisible();
    await expectAccessible();
    await page.getByRole('link', { name: problem }).click();
    await expect(field(page, points.editor.title)).toBeFocused();
  });

  test('on a wide screen the preview sticks and scrolls inside itself', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author } = people(testInfo.project.name);
    const id = await seedPoint(author.email, 'Seminář s dlouhým textem', 'draft');
    await page.setViewportSize({ width: 1280, height: 720 });
    await signInAs(new RegExp(`^Test – ${author.subject}`));
    await page.goto(`/body/${id}`);
    await hydrated();
    // Longer than the screen, so the pane has something to scroll.
    const body = Array.from({ length: 60 }, (_, n) => `Odstavec ${n + 1}.`).join('\n');
    await field(page, points.editor.body).fill(body);
    const preview = page.getByRole('region', { name: points.preview.label });
    await expect(preview).toContainText('Odstavec 60.');
    // No layout switch at this width.
    await expect(page.getByRole('group', { name: points.layout.legend })).toBeHidden();

    // Halfway down the form the pane has not left: it holds the top offset (1rem) and fits the screen.
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(async () => (await preview.boundingBox())?.y).toBe(16);
    const box = await preview.boundingBox();
    expect(box?.height).toBe(720 - 32);
    const scrolled = await preview.evaluate((el) => {
      el.scrollTop = 300;
      return { top: el.scrollTop, scrollable: el.scrollHeight > el.clientHeight };
    });
    expect(scrolled.scrollable).toBe(true);
    expect(scrolled.top).toBeGreaterThan(0);
    await expectAccessible();
  });

  test('on a phone the form and the preview take turns', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author } = people(testInfo.project.name);
    const id = await seedPoint(author.email, 'Seminář na telefonu', 'draft');
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(new RegExp(`^Test – ${author.subject}`));
    await page.goto(`/body/${id}`);
    await hydrated();
    const preview = page.getByRole('region', { name: points.preview.label });
    const toggle = page.getByRole('group', { name: points.layout.legend });
    await expect(toggle.getByRole('radio', { name: points.layout.form })).toBeChecked();
    await expect(preview).toBeHidden();
    await expect(field(page, points.editor.title)).toBeVisible();

    await toggle.getByRole('radio', { name: points.layout.preview }).check();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Seminář na telefonu');
    await expect(field(page, points.editor.title)).toBeHidden();
    // The scrolling pane is a stop of its own, so the keyboard can reach it (axe checks the region).
    await expectAccessible();

    await toggle.getByRole('radio', { name: points.layout.form }).check();
    await expect(field(page, points.editor.title)).toBeVisible();
    await expect(preview).toBeHidden();
  });

  test('the Přehled shows the author’s points and the reviewer’s queue, and only the reviewer is offered „Kontrola“', async ({
    page,
    hydrated,
    signInAs,
    newContext,
    expectAccessible,
  }, testInfo) => {
    const { author, reviewer } = people(testInfo.project.name);
    await seedPoint(author.email, 'Bod k odeslání', 'submitted');
    await seedPoint(author.email, 'Bod k úpravě', 'returned');
    await seedPoint(author.email, 'Bod v práci', 'draft');
    await signInAs(new RegExp(`^Test – ${author.subject}`));
    await page.goto('/');
    await hydrated();
    const card = page.getByRole('main').getByRole('heading', { name: points.mine.title });
    await expect(card).toBeVisible();
    for (const group of ['returned', 'draft', 'submitted'] as const) {
      await expect(page.getByText(points.mine.line(group, 1))).toBeVisible();
    }
    // Read after the page: the line is as of the page's load, on the same clock.
    const line = standingLines(new Date());
    await expect(page.getByText(line.before).or(page.getByText(line.closed))).toBeVisible();
    await openNav(page);
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByRole('link', { name: points.mine.title })).toBeVisible();
    await expect(navigation.getByRole('link', { name: review.title })).toHaveCount(0);
    await expectAccessible();
    // The queue is not theirs to see.
    expect((await page.goto('/kontrola'))?.status()).toBe(404);

    const other = await signInElsewhere(newContext, new RegExp(`^Test – ${reviewer.subject}`));
    await hydrated(other);
    await expect(other.getByRole('link', { name: /^Ke kontrole: \d+$/ })).toBeVisible();
    await openNav(other);
    await expect(
      other.getByRole('navigation').getByRole('link', { name: review.title }),
    ).toBeVisible();
    await expectAccessible(other);
  });

  // The same author seeds the queue, so these take their turn in the same serial run.
  test('the queue groups handed-in points by porada and kind, apart from the approved ones', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author, reviewer } = people(testInfo.project.name);
    // The queue is shared by both projects: their titles differ.
    const name = testInfo.project.name;
    const waiting = await seedPoint(author.email, `Bod ve frontě ${name}`, 'submitted');
    await seedPoint(author.email, `Bod čekající ${name}`, 'submitted');
    // Handed in again after a return: the reviewer is told.
    await seedPoint(author.email, `Bod znovu odeslaný ${name}`, 'resubmitted');
    const approved = await seedPoint(author.email, `Bod schválený ${name}`, 'approved');
    await signInAs(new RegExp(`^Test – ${reviewer.subject}`));
    await page.goto('/kontrola');
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: review.title })).toBeVisible();

    // Both seeded points wait for the porada of their Monday, under the part of the document they belong to.
    const porada = review.porada(dayMonth(await earliestMondayOf(waiting)));
    const section = page
      .getByRole('main')
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: porada }) });
    await expect(
      section.getByRole('heading', { level: 3, name: review.kind.report }),
    ).toBeVisible();
    await expect(section.getByRole('link', { name: `Bod ve frontě ${name}` })).toBeVisible();
    await expect(section.getByText(/^Seminář · Odesláno \d+\.\s\d+\.$/).first()).toBeVisible();
    const row = (title: string) =>
      section.getByRole('listitem').filter({ has: page.getByRole('link', { name: title }) });
    await expect(row(`Bod znovu odeslaný ${name}`)).toContainText(review.returnedBefore);
    await expect(row(`Bod ve frontě ${name}`)).not.toContainText(review.returnedBefore);
    // An approved point is decided: it waits for its porada in a section of its own.
    const done = page
      .getByRole('main')
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: review.approved }) });
    await expect(done.getByRole('link', { name: `Bod schválený ${name}` })).toBeVisible();
    const mine = done
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: `Bod schválený ${name}` }) });
    await expect(
      mine.getByText(points.mine.placement(dayMonth(await earliestMondayOf(approved)))),
    ).toBeVisible();
    await expect(section.getByRole('link', { name: `Bod schválený ${name}` })).toHaveCount(0);
    await expectAccessible();
  });

  test('the review screen: a reviewer edits in place of the read view, and an approved point can still be returned', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { author, reviewer } = people(testInfo.project.name);
    const submitted = await seedPoint(author.email, 'Bod k úpravě kontrolou', 'submitted');
    const approved = await seedPoint(author.email, 'Bod po schválení', 'approved');
    await signInAs(new RegExp(`^Test – ${reviewer.subject}`));

    await page.goto(`/kontrola/${submitted}`);
    await hydrated();
    await expect(page.getByRole('heading', { name: points.read.label })).toBeVisible();
    await page.getByRole('button', { name: review.edit.open }).click();
    await expect(page.getByRole('region', { name: review.edit.label })).toBeVisible();
    // The decision bar makes room for the editor and the read view goes.
    await expect(page.getByRole('button', { name: review.decision.approveNext })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: points.read.label })).toHaveCount(0);
    await expectAccessible();
    await page.getByRole('button', { name: review.edit.cancel }).click();
    await expect(page.getByRole('heading', { name: points.read.label })).toBeVisible();

    await page.goto(`/kontrola/${approved}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Bod po schválení' })).toBeVisible();
    await expect(page.getByText(points.state.approved, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: review.decision.return })).toBeVisible();
    await expect(page.getByRole('button', { name: review.decision.approveNext })).toHaveCount(0);
    await expectAccessible();
  });
});

/**
 * The headmaster’s „Nejbližší porady“. Skipping a Monday moves every point placed on it and the
 * issues table is shared by the whole run: each project skips a Monday of its own, far enough
 * ahead that no seeded point is placed on it (they sit on the Monday two weeks out), and a failed
 * test reopens it.
 */
test.describe('the meeting strip', () => {
  test.describe.configure({ mode: 'serial' });

  /** Where in the strip each project works: the fourth Monday, and the third. */
  const SLOT = { desktop: 3, mobile: 2 } as const;
  const mondays: string[] = [];
  test.afterEach(async () => {
    for (const monday of mondays.splice(0)) await reopenMeeting(monday);
  });

  test('skips a meeting and brings it back, and a Monday past its deadline is refused', async ({
    page,
    hydrated,
    settled,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    await signInAs(/^Test – zastupce/);
    await page.goto('/');
    await hydrated();
    const heading = page.locator('h3[id^="porada-"]').nth(SLOT[testInfo.project.name as 'desktop']);
    const monday = (await heading.getAttribute('id'))!
      .replace(/^porada-/, '')
      .replace(/-monday$/, '');
    mondays.push(monday);
    const label = (await heading.textContent())!;
    const meeting = page.getByRole('group', { name: label });
    const stripHeading = page.getByRole('heading', { level: 2, name: issues.strip.title });
    await expectAccessible();

    // An unticked box is refused where it stands; the meeting stays as it was.
    await meeting.getByRole('button', { name: issues.strip.skip.submit }).click();
    await settled();
    await expect(meeting.getByText(issues.strip.unconfirmed).first()).toBeVisible();

    // Skip: the status flips, the strip says so and takes focus; the box is unticked again.
    await meeting.getByLabel(issues.strip.skip.confirm).check();
    await meeting.getByRole('button', { name: issues.strip.skip.submit }).click();
    await expect(page.getByText(issues.strip.said.skip(label))).toBeVisible();
    await expect(stripHeading).toBeFocused();
    await expect(meeting.getByRole('button', { name: issues.strip.unskip.submit })).toBeVisible();
    await expect(meeting.getByLabel(issues.strip.unskip.confirm)).not.toBeChecked();
    await expectAccessible();

    // Unskip the same Monday: the row has a version now, and the write carries it.
    await meeting.getByLabel(issues.strip.unskip.confirm).check();
    await meeting.getByRole('button', { name: issues.strip.unskip.submit }).click();
    await expect(page.getByText(issues.strip.said.unskip(label))).toBeVisible();
    await expect(stripHeading).toBeFocused();
    await expect(meeting.getByRole('button', { name: issues.strip.skip.submit })).toBeVisible();
    await expect(meeting.getByLabel(issues.strip.skip.confirm)).not.toBeChecked();
    await settled();

    // A page left open past a deadline: the server refuses the Monday and the form says to reload.
    await page.route(
      (url) => url.pathname === '/',
      async (route) => {
        const request = route.request();
        const body = request.postData();
        if (request.method() !== 'POST' || body === null || !body.includes(monday)) {
          return route.fallback();
        }
        return route.continue({ postData: body.replaceAll(monday, '2020-01-06') });
      },
    );
    await meeting.getByLabel(issues.strip.skip.confirm).check();
    await meeting.getByRole('button', { name: issues.strip.skip.submit }).click();
    await expect(meeting.getByText(issues.strip.stale).first()).toBeVisible();
    await expect(page.getByText(issues.strip.said.skip(label))).toHaveCount(0);
    await expectAccessible();
  });
});
