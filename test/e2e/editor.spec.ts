/**
 * The interactions of the point editor that only a browser can show: focus after each row and
 * card operation, the opening sentence's question, a date typed key by key, the submit's error
 * summary, and a reviewer's own edit. Saving itself (conflicts, banners, flushes) is in
 * autosave.spec.ts.
 *
 * Authors are `ukladani-*` (shared with autosave.spec.ts, so every test clears its points by id);
 * the reviewer is `prohlizi-*` (shared with m8-screens.spec.ts, who owns no point here).
 */
import type { Page } from '@playwright/test';

import { errors, fieldIssues, form, people, points, problemActions, review } from '@/ui/copy';

import { forgetPoints, personaOf, readPoint, retitleBehindBack, seedPoint } from './db';
import {
  banners,
  countActions,
  DEBOUNCE_MS,
  expect,
  field,
  freezeClock,
  SAVED,
  signInElsewhere,
  test,
  type Fixtures,
} from './fixtures';

const author = (project: string) => personaOf('ukladani', project);
const signInRe = (persona: string, project: string) =>
  new RegExp(`^Test – ${personaOf(persona, project).subject}`);

/** A row's legend may carry „(nepovinné)“, so the name is a substring. */
const group = (page: Page, name: string) => page.getByRole('group', { name });

test.describe('the point editor', () => {
  let ids: string[] = [];
  test.beforeEach(() => {
    ids = [];
  });
  test.afterEach(() => forgetPoints(ids));

  async function open(
    page: Page,
    hydrated: Fixtures['hydrated'],
    signInAs: Fixtures['signInAs'],
    project: string,
    options: { type?: string } = {},
  ): Promise<string> {
    const id = await seedPoint(author(project).email, 'Bod k úpravám', 'draft', {
      typeName: options.type,
    });
    ids.push(id);
    await signInAs(signInRe('ukladani', project));
    await page.goto(`/body/${id}`);
    await hydrated();
    return id;
  }

  test('a date typed key by key keeps its year, and an end before the start is refused once, inline', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    const actions = countActions(page);
    const start = field(page, points.facts.eventDate);
    // Chromium reports every digit of the year: a control that fell back to the old date would undo them.
    if (testInfo.project.name === 'desktop') {
      // The order of the segments (month, day, year or day, month, year) follows the machine's
      // language, not the page's, so the digits are chosen to read the same in both: 12, 12, 2027.
      // The phone's date control has no segments to type into.
      await field(page, points.editor.title).focus();
      await page.keyboard.press('Tab');
      await expect(start).toBeFocused();
      await page.keyboard.type('12122027');
    } else {
      await start.fill('2027-12-12');
    }
    await expect(start).toHaveValue('2027-12-12');
    await page.clock.fastForward(DEBOUNCE_MS + 100);
    await expect(page.getByText(SAVED)).toBeVisible();
    expect((await readPoint(id)).eventDate).toBe('2027-12-12');

    const end = field(page, points.facts.endDate);
    await end.fill('2027-12-01');
    await page.clock.fastForward(DEBOUNCE_MS + 100);
    await expect(page.getByText(points.editor.endBeforeStart)).toBeVisible();
    // The refusal is final for that text: no banner, and the retry ladder never starts.
    const sent = actions.count();
    await page.clock.fastForward(100_000);
    expect(actions.count()).toBe(sent);
    await expect(banners(page)).toHaveCount(0);
    await expect(end).toHaveValue('2027-12-01');
  });

  test('rows: an added row takes focus at its name, a removed row hands focus on, the 12 cap is said, a restored row takes focus', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    // „Projektový den“ has two optional people rows, so every row operation is open to it.
    await open(page, hydrated, signInAs, testInfo.project.name, { type: 'Projektový den' });

    await page.getByRole('button', { name: points.bullets.addTextRow }).click();
    await expect(field(page, points.bullets.label)).toBeFocused();

    await page
      .getByRole('button', { name: points.bullets.removeLabel('Organizátoři'), exact: true })
      .click();
    // The next row took its place, and focus is in it.
    await expect(group(page, 'Účastníci').locator(':focus')).toHaveCount(1);
    await expect(group(page, 'Organizátoři')).toHaveCount(0);

    await page
      .getByRole('button', { name: points.bullets.restore('Organizátoři'), exact: true })
      .click();
    await expect(group(page, 'Organizátoři').locator(':focus')).toHaveCount(1);

    // Two type rows and the text row make three; nine more reach the cap of twelve.
    for (let n = 0; n < 9; n += 1) {
      await page.getByRole('button', { name: points.bullets.addTextRow }).click();
    }
    await expect(page.getByText(points.bullets.full(12))).toHaveCount(0);
    await page.getByRole('button', { name: points.bullets.addTextRow }).click();
    await expect(page.getByText(points.bullets.full(12))).toBeVisible();
  });

  test('a person pasted into one bullet lands in that bullet only, and saves', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    const participants = group(page, 'Účastníci');
    await participants.getByText(people.paste.summary).click();
    await participants.getByLabel(people.paste.label).fill('Petr Novák 3.B');
    await participants.getByRole('button', { name: people.paste.check }).click();
    await participants.getByRole('button', { name: people.paste.add(1) }).click();
    await expect(participants.getByText('Petr Novák')).toBeVisible();
    await expect(group(page, 'Organizátoři').getByText('Petr Novák')).toHaveCount(0);
    // A people change alone, with no pause and no blur yet, is a change like any other.
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 10_000 });
    const stored = (await readPoint(id)).bullets.find(({ key }) => key === 'participants');
    expect(stored?.people?.map(({ familyName }) => familyName)).toContain('Novák');
  });

  test('the opening sentence: „Vytvořit znovu“ asks, takes focus to the answer, and either answer returns focus to the box', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await open(page, hydrated, signInAs, testInfo.project.name);
    const opening = field(page, points.opening.label);
    await opening.fill('Moje vlastní věta.');
    await field(page, points.editor.title).fill('Jiný název semináře');
    await expect(page.getByText(points.opening.changed)).toBeVisible();

    await page.getByRole('button', { name: points.opening.recreate }).click();
    await expect(page.getByText(points.opening.confirm)).toBeVisible();
    await expect(page.getByRole('button', { name: points.opening.replace })).toBeFocused();
    await page.getByRole('button', { name: points.opening.replace }).click();
    await expect(opening).toBeFocused();
    await expect(opening).not.toHaveValue('Moje vlastní věta.');
    await expect(page.getByText(points.opening.confirm)).toHaveCount(0);

    // Keep: the sentence stays and the box has focus again.
    await opening.fill('Zase moje věta.');
    await field(page, points.editor.title).fill('Ještě jiný název');
    await page.getByRole('button', { name: points.opening.recreate }).click();
    await page.getByRole('button', { name: points.opening.keep }).click();
    await expect(opening).toBeFocused();
    await expect(opening).toHaveValue('Zase moje věta.');

    // Typing in the box closes the question.
    await field(page, points.editor.title).fill('A ještě jiný');
    await page.getByRole('button', { name: points.opening.recreate }).click();
    await expect(page.getByText(points.opening.confirm)).toBeVisible();
    await opening.pressSequentially('x');
    await expect(page.getByText(points.opening.confirm)).toHaveCount(0);
  });

  test('statements: focus after add, move and remove, „Jiná osoba…“ stays open across a move, a quote is stored bare', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    const first = points.statements.legend(1);
    const second = points.statements.legend(2);

    await page.getByRole('button', { name: points.statements.add }).click();
    await expect(group(page, second).getByLabel(points.statements.speaker)).toBeFocused();

    await group(page, second)
      .getByLabel(points.statements.speaker)
      .selectOption({ label: points.statements.other });
    const other = group(page, second).getByRole('combobox', { name: points.bullets.addPerson });
    await expect(other).toBeVisible();

    // Up: the card is first now, the people field is still open in it, and focus follows the button.
    await page.getByRole('button', { name: points.statements.upLabel(2), exact: true }).click();
    await expect(
      page.getByRole('button', { name: points.statements.upLabel(1), exact: true }),
    ).toBeFocused();
    await expect(
      group(page, first).getByRole('combobox', { name: points.bullets.addPerson }),
    ).toBeVisible();

    await page.getByRole('button', { name: points.statements.removeLabel(1), exact: true }).click();
    await expect(group(page, first).getByLabel(points.statements.speaker)).toBeFocused();
    await expect(group(page, second)).toHaveCount(0);

    await field(page, points.statements.quote).fill('„Čtení mě opravdu baví.“');
    await page.keyboard.press('Tab');
    await expect(page.getByText(SAVED)).toBeVisible();
    expect((await readPoint(id)).statements[0]?.quote).toBe('Čtení mě opravdu baví.');
  });

  test('a blur of „Citace“ without an edit sends no save', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    const actions = countActions(page);
    const quote = field(page, points.statements.quote);
    await quote.focus();
    await page.keyboard.press('Tab');
    await quote.focus();
    await page.keyboard.press('Shift+Tab');
    // The one real edit sends one call: the blurs before it sent none.
    await field(page, points.editor.title).fill('Po prázdných blurech');
    await page.keyboard.press('Tab');
    await expect(page.getByText(SAVED)).toBeVisible();
    await expect.poll(async () => (await readPoint(id)).title).toBe('Po prázdných blurech');
    expect(actions.count()).toBe(1);
  });

  test('a press of „Odeslat ke kontrole“ with problems shows the summary, focuses it and sends nothing; a link leads to its field', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await field(page, points.editor.title).fill('');
    await field(page, points.opening.label).fill('');
    await page.getByRole('button', { name: points.submit.button }).click();
    const heading = page.getByRole('heading', { name: form.summaryTitle });
    await expect(heading).toBeVisible();
    const summary = page.locator('div[tabindex="-1"]').filter({ has: heading });
    await expect(summary).toBeFocused();
    expect((await readPoint(id)).state).toBe('draft');
    // Two entries or more: their links are targets of their own (axe's target-size).
    await expect.poll(() => summary.getByRole('link').count()).toBeGreaterThan(1);
    await expectAccessible();

    await page
      .locator('div[tabindex="-1"]')
      .getByRole('link', { name: points.readiness.problem('title-required', {}) })
      .click();
    await expect(field(page, points.editor.title)).toBeFocused();
  });

  test('„Zrušit bod“ pressed while text is unsent saves it first and then withdraws', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await freezeClock(page);
    // The box first, then the text: focus stays in the title, so its blur has saved nothing, and the
    // clock stands, so no pause has either. Only the press itself can send the text.
    await page.getByLabel(points.transitions.withdraw.confirm).check();
    await field(page, points.editor.title).fill('Zrušeno s poslední změnou');
    await page
      .getByRole('button', { name: points.transitions.withdraw.button })
      .evaluate((button: HTMLElement) => button.click());
    await expect.poll(async () => (await readPoint(id)).state).toBe('withdrawn');
    expect((await readPoint(id)).title).toBe('Zrušeno s poslední změnou');
    await expect(banners(page)).toHaveCount(0);
  });

  test('„Stáhnout“ brings a submitted point back among the drafts', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await page.getByRole('button', { name: points.submit.button }).click();
    await expect.poll(async () => (await readPoint(id)).state).toBe('submitted');
    await page.getByRole('button', { name: points.transitions.retract.button }).click();
    await expect.poll(async () => (await readPoint(id)).state).toBe('draft');
    await expect(page.getByRole('button', { name: points.submit.button })).toBeVisible();
  });

  test('on a phone the keyboard never leaves a focused control behind the sticky bar', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, hydrated, signInAs, testInfo.project.name, { type: 'Projektový den' });
    // Problems, so that the list under the form has links to Tab onto.
    await field(page, points.editor.title).fill('');
    await field(page, points.opening.label).fill('');
    const controls = '#bod :is(input, select, textarea, button, a[href], summary):not([disabled])';
    const total = await page.locator(controls).count();
    expect(total).toBeGreaterThan(10);
    const covered: string[] = [];
    let reached = 0;
    let links = 0;
    // The bar sticks only while the list under the form is on screen: the last controls are the ones it can cover.
    for (let n = Math.max(1, total - 12); n < total; n += 1) {
      // Scroll so that control n lies in the strip the bar covers (its bottom edge 20 px above the
      // screen's), stand on the control before it without moving the page, and press Tab: the
      // browser alone decides whether to scroll, and it must not leave the control under the bar.
      const stop = await page.evaluate(
        ([selector, index]) => {
          const list = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (el) => el.getClientRects().length > 0,
          );
          const target = list[index];
          const before = list[index - 1];
          if (target === undefined || before === undefined) return null;
          window.scrollBy(0, target.getBoundingClientRect().bottom - (innerHeight - 20));
          before.focus({ preventScroll: true });
          return index;
        },
        [controls, n] as const,
      );
      if (stop === null) break;
      await page.keyboard.press('Tab');
      const landed = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === null || el === document.body || el.closest('.submit-bar') !== null) return null;
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          name: `${el.tagName.toLowerCase()}#${el.id}`,
          link: el.tagName === 'A',
          under: hit !== null && hit.closest('.submit-bar') !== null,
        };
      });
      if (landed === null) continue;
      reached += 1;
      if (landed.link) links += 1;
      if (landed.under) covered.push(landed.name);
    }
    expect(covered).toEqual([]);
    // Many stops were really tried, the links of the readiness list (the first thing under the form) among them.
    expect(reached).toBeGreaterThan(8);
    expect(links).toBeGreaterThan(1);
  });

  test('on a phone a readiness link focuses its field, and the reveal event brings the form back', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, hydrated, signInAs, testInfo.project.name);
    const title = field(page, points.editor.title);
    await title.fill('');
    await page.getByRole('link', { name: points.readiness.problem('title-required', {}) }).click();
    await expect(title).toBeFocused();

    // Only the form pane holds a field; the reveal event is what brings a hidden pane back.
    const toggle = page.getByRole('group', { name: points.layout.legend });
    await toggle.getByRole('radio', { name: points.layout.preview }).check();
    await expect(title).toBeHidden();
    await title.evaluate((el) => el.dispatchEvent(new CustomEvent('reveal', { bubbles: true })));
    await expect(toggle.getByRole('radio', { name: points.layout.form })).toBeChecked();
    await expect(title).toBeVisible();
  });
});

test.describe('the reviewer’s own edit', () => {
  let ids: string[] = [];
  test.beforeEach(() => {
    ids = [];
  });
  test.afterEach(() => forgetPoints(ids));

  test('„Upravit“ replaces the read view and the bar; „Uložit úpravy“ shows in the history with the original wording', async ({
    page,
    hydrated,
    signInAs,
    newContext,
  }, testInfo) => {
    const project = testInfo.project.name;
    const id = await seedPoint(author(project).email, 'Původní název', 'submitted');
    ids.push(id);
    await signInAs(signInRe('prohlizi', project));
    await page.goto(`/kontrola/${id}`);
    await hydrated();

    await page.getByRole('button', { name: review.edit.open }).click();
    await expect(page.getByRole('button', { name: review.decision.return })).toHaveCount(0);
    const editor = page.getByRole('region', { name: review.edit.label });
    // Nothing changed yet: saving says so and writes nothing.
    await editor.getByRole('button', { name: review.edit.save }).click();
    await expect(page.getByText(review.edit.unchanged)).toBeVisible();

    // That closed the editor, as does a saved edit: open it again.
    await page.getByRole('button', { name: review.edit.open }).click();
    // A blanked title shows its inline issue.
    await field(page, points.editor.title).fill('');
    await editor.getByRole('button', { name: review.edit.save }).click();
    await expect(page.getByText(fieldIssues.required).first()).toBeVisible();

    await field(page, points.editor.title).fill('Název po úpravě kontrolou');
    await editor.getByRole('button', { name: review.edit.save }).click();
    await expect(page.getByText(review.edit.saved)).toBeVisible();
    await expect(page.getByRole('button', { name: review.decision.return })).toBeVisible();
    const history = page.getByRole('region', { name: points.timeline.label });
    await expect(history).toContainText(points.timeline.edit([points.timeline.field('title')!]));
    await history.getByText(points.timeline.original).click();
    await expect(history).toContainText('Původní název');
    expect((await readPoint(id)).title).toBe('Název po úpravě kontrolou');

    // The author sees the same line in their own history.
    const authorPage = await signInElsewhere(newContext, signInRe('ukladani', project));
    await authorPage.goto(`/body/${id}`);
    await hydrated(authorPage);
    await expect(authorPage.getByRole('region', { name: points.timeline.label })).toContainText(
      points.timeline.edit([points.timeline.field('title')!]),
    );
  });

  test('the decision bar: the note opens with focus, „Zpět“ gives focus back, an empty note is refused, a phrase fills it', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const project = testInfo.project.name;
    const id = await seedPoint(author(project).email, 'Bod k rozhodnutí', 'submitted');
    ids.push(id);
    await signInAs(signInRe('prohlizi', project));
    await page.goto(`/kontrola/${id}`);
    await hydrated();

    const opener = page.getByRole('button', { name: review.decision.return });
    await opener.click();
    const note = page.getByLabel(review.decision.note);
    await expect(note).toBeFocused();
    await page.getByRole('button', { name: review.decision.back }).click();
    await expect(opener).toBeFocused();

    await opener.click();
    await page.getByRole('button', { name: review.decision.return }).click();
    await expect(page.getByText(review.decision.noteRequired).first()).toBeVisible();
    await page.getByRole('button', { name: review.decision.phrases[0], exact: true }).click();
    await expect(note).toHaveValue(review.decision.phrases[0]);
    await expect(
      page.getByText(review.decision.count(review.decision.phrases[0].length)),
    ).toBeVisible();
    expect((await readPoint(id)).state).toBe('submitted');
  });
  test('a point that changed meanwhile: the save is refused with the reload, which brings the new state', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const project = testInfo.project.name;
    const id = await seedPoint(author(project).email, 'Bod před změnou', 'submitted');
    ids.push(id);
    await signInAs(signInRe('prohlizi', project));
    await page.goto(`/kontrola/${id}`);
    await hydrated();
    await page.getByRole('button', { name: review.edit.open }).click();
    await field(page, points.editor.title).fill('Název kontroly');
    await retitleBehindBack(id, 'Změněno jinde');

    const editor = page.getByRole('region', { name: review.edit.label });
    await editor.getByRole('button', { name: review.edit.save }).click();
    await expect(editor.getByText(errors.conflict)).toBeVisible();
    await expect(banners(page)).toHaveCount(1);
    await editor.getByRole('link', { name: problemActions.reload }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Změněno jinde' })).toBeVisible();
    await expect(page.getByText(errors.conflict)).toHaveCount(0);
    // Nothing of the refused edit was stored.
    expect((await readPoint(id)).title).toBe('Změněno jinde');
  });

  test('beforeunload warns while the edit is unsaved, and not before or after', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const project = testInfo.project.name;
    const id = await seedPoint(author(project).email, 'Bod s úpravou', 'submitted');
    ids.push(id);
    await signInAs(signInRe('prohlizi', project));
    await page.goto(`/kontrola/${id}`);
    await hydrated();
    const warned: string[] = [];
    page.on('dialog', (dialog) => {
      warned.push(dialog.type());
      void dialog.accept();
    });
    await page.getByRole('button', { name: review.edit.open }).click();
    // Opened, nothing typed: no warning.
    await page.reload();
    await hydrated();
    expect(warned).toEqual([]);

    await page.getByRole('button', { name: review.edit.open }).click();
    await field(page, points.editor.title).fill('Rozepsaná úprava');
    await page.reload();
    await hydrated();
    expect(warned).toEqual(['beforeunload']);
    expect((await readPoint(id)).title).toBe('Bod s úpravou');
  });
});
