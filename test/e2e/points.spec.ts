/** J1, the author: one „Seminář“ from the first press of „Začít“ to „Odeslat ke kontrole“. */
import type { Locator, Page } from '@playwright/test';

import { people, points } from '@/ui/copy';

import { forgetPointsOf, personaOf, pointIdsOf } from './db';
import { expect, field, test } from './fixtures';

const { chips, paste } = people;

/** How the paper prints the people set above: the edited organiser, the other one, and a pasted person. */
const PAPER_PEOPLE = /paní Jana Nováková.*pan Petr Svoboda/s;

/** The people bullet whose legend starts with `label`: each has a search box and a „Vložit seznam“ of its own. */
const bullet = (page: Page, label: string) =>
  page.getByRole('main').getByRole('group', { name: new RegExp(`^${label}`) });

const chipRow = (within: Locator, name: string) =>
  within.getByRole('listitem').filter({ hasText: name });

/** Types into the search box and takes the directory's answer, which comes after a pause. */
async function addFromDirectory(within: Locator, query: string, name: string): Promise<void> {
  const box = within.getByRole('combobox', { name: points.bullets.addPerson });
  // React Aria closes the list when the page scrolls under it: scroll first, then open and type.
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await box.click();
  await box.pressSequentially(query);
  await box.page().getByRole('listbox').getByRole('option', { name, exact: true }).click();
  await expect(chipRow(within, name)).toBeVisible();
}

/** The preview region; below the wide layout it takes the place of the form, so `look` runs with it showing. */
async function inPreview(
  page: Page,
  project: string,
  look: (preview: Locator) => Promise<void>,
): Promise<void> {
  const mobile = project === 'mobile';
  if (mobile) await page.getByRole('radio', { name: points.layout.preview }).check();
  await look(page.getByRole('region', { name: points.preview.label }));
  if (mobile) await page.getByRole('radio', { name: points.layout.form }).check();
}

test.describe('the author', () => {
  // One persona per project, and its points are cleared around each test: they take turns.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(({}, testInfo) =>
    forgetPointsOf(personaOf('autor', testInfo.project.name).email),
  );
  test.afterEach(({}, testInfo) => forgetPointsOf(personaOf('autor', testInfo.project.name).email));

  test('writes a seminar, sees it in the preview, finds it saved after a reload and hands it in', async ({
    page,
    hydrated,
    settled,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const { subject, email } = personaOf('autor', testInfo.project.name);
    await signInAs(new RegExp(`^Test – ${subject}`));
    await page.goto('/body/novy');
    await hydrated();
    await expectAccessible();

    // „Začít“ makes the draft and opens it.
    await page.getByRole('radio', { name: 'Seminář', exact: true }).check();
    await page.getByRole('button', { name: points.chooser.start }).click();
    await expect(page).toHaveURL(/\/body\/[0-9a-f-]{36}$/);
    await hydrated();
    expect(await pointIdsOf(email)).toHaveLength(1);

    const TITLE = 'Seminář o čtenářství';
    await field(page, points.facts.eventDate).fill('2026-01-12');
    await field(page, points.facts.endDate).fill('2026-01-13');
    await field(page, points.editor.title).fill(TITLE);
    await field(page, points.facts.timeFrom).fill('09:00');
    await field(page, points.facts.timeTo).fill('11:30');
    await page.getByRole('radio', { name: points.campus.radlice }).check();
    await field(page, points.facts.place).fill('v učebně S206');

    // Two from the school directory, then the same salutation for both and a different one for one.
    const organisers = bullet(page, 'Organizátoři');
    await addFromDirectory(organisers, 'Novák', 'Jana Nováková');
    await addFromDirectory(organisers, 'Svobod', 'Petr Svoboda');
    await organisers.getByRole('button', { name: chips.bulk.setLabel('pan'), exact: true }).click();
    const editor = page.getByRole('group', {
      name: chips.editorLabel('Jana Nováková'),
      exact: true,
    });
    await organisers.getByRole('button', { name: chips.editLabel('Jana Nováková') }).click();
    await editor.getByLabel(chips.editor.salutation).selectOption('pani');
    await expectAccessible();
    await editor.getByRole('button', { name: chips.editor.done }).click();
    await expect(editor).toHaveCount(0);

    // Three through „Vložit seznam“ of the participants' own bullet.
    const participants = bullet(page, 'Účastníci');
    await participants.locator('summary', { hasText: paste.summary }).click();
    await participants
      .getByLabel(paste.label, { exact: true })
      .fill('Marie Dlouhá 2.A\nOndřej Pech\nLenka Marešová 3.B');
    await participants.getByRole('button', { name: paste.check, exact: true }).click();
    await expect(participants.getByRole('table', { name: paste.caption })).toBeVisible();
    await expectAccessible();
    await participants
      .getByRole('button', { name: paste.bulk.setLabel('pan'), exact: true })
      .click();
    await participants.getByRole('button', { name: paste.add(3), exact: true }).click();
    for (const name of ['Marie Dlouhá', 'Ondřej Pech', 'Lenka Marešová']) {
      await expect(chipRow(participants, name)).toBeVisible();
    }

    // A statement by one of the participants.
    await page.getByRole('button', { name: points.statements.add }).click();
    const statement = page.getByRole('group', { name: points.statements.legend(1) });
    await field(statement, points.statements.speaker).selectOption({
      label: 'Ondřej Pech',
    });
    const speaker = await field(statement, points.statements.speaker).inputValue();
    await field(statement, points.statements.genitive).fill('Ondřeje Pecha');
    await field(statement, points.statements.quote).fill('Čtení mě baví.');
    await field(statement, points.statements.quote).blur();

    // The preview follows, with the salutations as the paper prints them.
    await inPreview(page, testInfo.project.name, async (preview) => {
      await expect(preview).toContainText(TITLE);
      await expect(preview).toContainText('Čtení mě baví.');
      await expect(preview).toContainText(PAPER_PEOPLE);
      await expectAccessible();
    });

    // Everything saved: the status line says so, and a reload shows it all again.
    await expect(page.getByText(/^Uloženo v/)).toBeVisible();
    await page.reload();
    await hydrated();
    await expect(field(page, points.editor.title)).toHaveValue(TITLE);
    await expect(field(page, points.facts.eventDate)).toHaveValue('2026-01-12');
    await expect(field(page, points.facts.endDate)).toHaveValue('2026-01-13');
    await expect(field(page, points.facts.timeFrom)).toHaveValue('09:00');
    await expect(field(page, points.facts.timeTo)).toHaveValue('11:30');
    await expect(field(page, points.facts.place)).toHaveValue('v učebně S206');
    await expect(page.getByRole('radio', { name: points.campus.radlice })).toBeChecked();
    for (const name of ['Jana Nováková', 'Petr Svoboda']) {
      await expect(chipRow(bullet(page, 'Organizátoři'), name)).toBeVisible();
    }
    for (const name of ['Marie Dlouhá', 'Ondřej Pech', 'Lenka Marešová']) {
      await expect(chipRow(bullet(page, 'Účastníci'), name)).toBeVisible();
    }
    const saved = page.getByRole('group', { name: points.statements.legend(1) });
    await expect(field(saved, points.statements.speaker)).toHaveValue(speaker);
    await expect(field(saved, points.statements.genitive)).toHaveValue('Ondřeje Pecha');
    await expect(field(saved, points.statements.quote)).toHaveValue('Čtení mě baví.');
    // The salutation of the edited person, and the paper's wording of all of them.
    await bullet(page, 'Organizátoři')
      .getByRole('button', { name: chips.editLabel('Jana Nováková') })
      .click();
    await expect(editor.getByLabel(chips.editor.salutation)).toHaveValue('pani');
    await editor.getByRole('button', { name: chips.editor.done }).click();
    await inPreview(page, testInfo.project.name, async (preview) => {
      await expect(preview).toContainText(PAPER_PEOPLE);
    });

    // Handed in: the point is no longer an editor, and the history says so.
    await page.getByRole('button', { name: points.submit.button }).click();
    await settled();
    await expect(page.getByText(points.state.submitted, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: points.timeline.label })).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: /^Odesláno ke kontrole / }),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: points.submit.button })).toHaveCount(0);
    await expectAccessible();
  });

  test('a press of „Začít“ repeated after a failed answer finds the draft the first one made', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const { subject, email } = personaOf('autor', testInfo.project.name);
    await signInAs(new RegExp(`^Test – ${subject}`));
    await page.goto('/body/novy');
    await hydrated();
    await page.getByRole('radio', { name: 'Seminář', exact: true }).check();

    // The first request reaches the server, which makes the draft; the browser never sees the answer.
    let failed = false;
    await page.route(/\/body\/novy$/, async (route) => {
      const request = route.request();
      if (failed || request.method() !== 'POST' || !('next-action' in request.headers())) {
        return route.continue();
      }
      failed = true;
      await route.fetch();
      return route.abort();
    });
    await page.getByRole('button', { name: points.chooser.start }).click();
    await expect.poll(() => pointIdsOf(email)).toHaveLength(1);
    expect(failed).toBe(true);
    await expect(page).toHaveURL(/\/body\/novy$/);

    // The retry carries the same clientRef, so the server returns that draft instead of making another.
    const [draft] = await pointIdsOf(email);
    await page.getByRole('button', { name: points.chooser.start }).click();
    await expect(page).toHaveURL(new RegExp(`/body/${draft}$`));
    expect(await pointIdsOf(email)).toEqual([draft]);
  });
});
