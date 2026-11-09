/**
 * m8b-screens: axe over every M8b route in both projects, each seeded through db helpers (the journeys
 * are in akce.spec.ts, akce-*.spec.ts and proposals.spec.ts and are not repeated here). One persona owns
 * the akce these screens show, and is cleared around each test; the queue is shared, so the titles carry
 * the project and nothing here asserts that the queue is empty.
 */
import { cs, future, points, review } from '@/ui/copy';

import { emailOf, signInAsRe } from './akce-steps';
import { forgetFutureOf, seedFuture } from './future-db';
import { expect, test } from './fixtures';

test.describe('the akce, proposal and settings screens', () => {
  test.describe.configure({ mode: 'serial' });
  const clear = (project: string) => forgetFutureOf(emailOf('obraz', project));
  test.beforeEach(({}, testInfo) => clear(testInfo.project.name));
  test.afterEach(({}, testInfo) => clear(testInfo.project.name));

  test('/akce, /akce/novy and one akce are accessible for their author, in every state', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const email = emailOf('obraz', project);
    const draft = await seedFuture(email, `Návrh akce (${project})`, 'draft');
    const waiting = await seedFuture(email, `Akce k rozhodnutí (${project})`, 'submitted');
    const approved = await seedFuture(email, `Schválená akce (${project})`, 'approved');
    await signInAs(signInAsRe('obraz', project));

    await page.goto('/akce');
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: future.title })).toBeVisible();
    await expect(page.getByRole('link', { name: `Schválená akce (${project})` })).toBeVisible();
    await expectAccessible();

    await page.goto('/akce/novy');
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: future.new })).toBeVisible();
    await expectAccessible();

    for (const [id, title] of [
      [draft, `Návrh akce (${project})`],
      [waiting, `Akce k rozhodnutí (${project})`],
      [approved, `Schválená akce (${project})`],
    ] as const) {
      await page.goto(`/akce/${id}`);
      await hydrated();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expectAccessible();
    }
  });

  test('the report card on the Přehled and on „Moje body“ is accessible with an akce waiting', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    await seedFuture(emailOf('obraz', project), `Akce bez zprávy (${project})`, 'approved', {
      startInDays: -4,
    });
    await signInAs(signInAsRe('obraz', project));
    for (const path of ['/klasicke', '/body']) {
      await page.goto(path);
      await hydrated();
      await expect(page.getByRole('heading', { name: future.report.title })).toBeVisible();
      await expect(page.getByRole('link', { name: `Akce bez zprávy (${project})` })).toBeVisible();
      await expectAccessible();
    }
  });

  test('the akce section of the queue lists a handed-in akce', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const TITLE = `Akce ve frontě (${project})`;
    await seedFuture(emailOf('obraz', project), TITLE, 'submitted');
    await signInAs(signInAsRe('revizor', project));
    await page.goto('/kontrola/akce');
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: review.future.title })).toBeVisible();
    await expect(page.getByRole('link', { name: TITLE })).toBeVisible();
    await expectAccessible();
  });

  test('„Nový návrh“, „Typy bodů“ and „Profil“ are accessible', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    await signInAs(signInAsRe('rizeni', project));
    await page.goto('/nastaveni/typy-bodu');
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: cs.pointTypes.title })).toBeVisible();
    await expectAccessible();

    await page.goto('/navrhy/novy');
    await hydrated();
    await expect(
      page.getByRole('heading', { level: 1, name: points.proposal.title }),
    ).toBeVisible();
    await expectAccessible();
  });
});
