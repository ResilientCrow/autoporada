/**
 * J4: the headmaster prepares a porada: the page and its steps, Pokyny a hospodaření (add, move,
 * edit in the item editor, remove), Údaje, Příloha 2, and the full preview with the preflight. SP-T
 * (TipTap under the nonce CSP, design §18) is the second test: the keys, the mount and the leaks.
 *
 * The issues table is shared by the whole run: each project prepares a Monday of its own, far
 * enough ahead that no seeded point is placed on it, and forgets it afterwards. The author of the
 * waiting point is `ctenar-*`, who writes nothing else.
 */
import type { Locator, Page } from '@playwright/test';

import { porada, richtext } from '@/ui/copy';

import { forgetPointsOf, personaOf } from './db';
import {
  editorIn,
  mounted,
  paragraphsOf,
  pasteHtml,
  styleLeaks,
  watchMountErrors,
  WORD_PASTE,
} from './editor-keys';
import { expect, test } from './fixtures';
import { addDaysIso, forgetIssues, mondayIn, seedHandedIn } from './porada-db';

/** The week of each test and project, counted from this week: no two tests share a Monday. */
const WEEK = {
  journey: { desktop: 8, mobile: 9 },
  keys: { desktop: 10, mobile: 11 },
  mount: { desktop: 12, mobile: 13 },
} as const;
const BODY = /^Text bodu/;

const monday = (test: keyof typeof WEEK, project: string) =>
  mondayIn(WEEK[test][project as 'desktop' | 'mobile']);
const headmaster = (project: string) =>
  new RegExp(`^Test – ${personaOf('rizeni', project).subject}`);

/** The titles of the items on the outline page, in order. */
const titlesOf = (page: Page) => page.locator('span[id^="bod-"]').allTextContents();

test.describe('J4: the headmaster prepares a porada', () => {
  test.afterEach(async ({}, testInfo) => {
    await forgetPointsOf(personaOf('ctenar', testInfo.project.name).email);
    await forgetIssues([monday('journey', testInfo.project.name)]);
  });

  test('the steps, the outline, the item editor, Údaje, Příloha 2 and the preview', async ({
    page,
    hydrated,
    settled,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = monday('journey', project);
    const title = `Bod J4 ${project}`;
    const waiting = `Čekající bod J4 ${project}`;
    await seedHandedIn(personaOf('ctenar', project).email, waiting, 'submitted', {
      monday: day,
      eventDate: addDaysIso(day, -1),
      submittedAt: `${addDaysIso(day, -2)}T10:00:00Z`,
    });
    await signInAs(headmaster(project));

    await test.step('the porada page names the meeting and links the four steps', async () => {
      await page.goto(`/porada/${day}`);
      await hydrated();
      await expect(
        page.getByRole('heading', { name: new RegExp(`^${porada.meeting('')}`) }),
      ).toBeVisible();
      // The counts are cumulative: the other project's waiting point may be here too.
      await expect(page.getByText(/^Ke kontrole: [1-9]/)).toBeVisible();
      const steps = page
        .getByRole('region', { name: porada.steps.title })
        .or(page.getByRole('heading', { name: porada.steps.title }).locator('..'));
      for (const label of Object.values(porada.steps).slice(1)) {
        await expect(steps.getByRole('link', { name: label })).toBeVisible();
      }
      await expect(page.getByRole('button', { name: porada.generate.button })).toBeDisabled();
      await expect(page.getByText(porada.generate.later)).toBeVisible();
      await expectAccessible();
      await page.getByRole('link', { name: porada.steps.outline }).click();
      await expect(page).toHaveURL(new RegExp(`/porada/${day}/pokyny$`));
    });

    await test.step('adds an item at the end of Pokyny, moves it up', async () => {
      await hydrated();
      const before = await titlesOf(page);
      const add = page.locator('form#pridat-pokyny');
      await page
        .getByRole('region', { name: porada.outline.sections.pokyny })
        .locator('summary')
        .click();
      await add.getByLabel(porada.outline.add.name).fill(title);
      await add.getByRole('radio', { name: porada.outline.persistence.once }).check();
      await add.getByRole('button', { name: porada.outline.add.submit }).click();
      await settled();
      await expect(page.getByText(porada.outline.said.added)).toBeVisible();
      await expect.poll(() => titlesOf(page)).toContain(title);
      const added = await titlesOf(page);
      expect(added.length).toBe(before.length + 1);
      const at = added.indexOf(title);

      const row = page.getByRole('listitem').filter({ hasText: title });
      await expect(row.getByText(porada.outline.chip.once)).toBeVisible();
      await row
        .getByRole('group', { name: porada.outline.move.label(title) })
        .getByRole('button', { name: porada.outline.move.up })
        .click();
      await settled();
      await expect(page.getByText(porada.outline.said.moved)).toBeVisible();
      await expect.poll(async () => (await titlesOf(page)).indexOf(title)).toBe(at - 1);
      await expectAccessible();
    });

    await test.step('edits it in the item editor: text, levels, a Word paste, Uložit', async () => {
      const errors = watchMountErrors(page);
      await page
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('link', { name: porada.outline.edit })
        .click();
      await expect(page).toHaveURL(new RegExp(`/porada/${day}/pokyny/[0-9a-f-]{36}$`));
      await hydrated();
      const editor = editorIn(page, BODY);
      await mounted(editor);
      await editor.click();
      await page.keyboard.type('První odstavec');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Vnořený odstavec');
      // A paste joins the paragraph the caret is in: start a fresh one at level 0.
      await page.keyboard.press('Enter');
      await page.keyboard.press('Shift+Tab');
      await pasteHtml(editor, WORD_PASTE);
      // The paste lands as paragraphs of the levels Word gave them, with no style or image left.
      const pasted = (await paragraphsOf(editor)).slice(2);
      expect(pasted).toEqual([
        ['0', 'Wordový pokyn'],
        ['2', 'Vnořená kurzíva a obyčejný text'],
        ['0', 'Odstavec s barvou'],
      ]);
      await expect(editor.locator('img, style, script')).toHaveCount(0);
      expect(await styleLeaks(page, editor)).toEqual([]);

      const preview = page.getByRole('region', { name: porada.outline.editor.previewLabel });
      await expect(preview.getByText('Wordový pokyn')).toBeVisible();
      await page.getByRole('button', { name: porada.outline.editor.save }).click();
      await settled();
      await expect(page.getByText(porada.outline.editor.saved)).toBeVisible();
      expect(errors()).toEqual([]);

      // The saved text comes back from the server as markup, then in the live editor, once.
      await page.reload();
      await hydrated();
      const again = editorIn(page, BODY);
      await mounted(again);
      await expect(again.getByText('Vnořený odstavec')).toHaveCount(1);
      await expect(page.locator('.rt-static')).toHaveCount(0);
      await expectAccessible();
      await page.getByRole('link', { name: porada.outline.editor.back }).click();
      await expect(page).toHaveURL(new RegExp(`/porada/${day}/pokyny$`));
    });

    await test.step('Údaje: Přítomni and Hosté are saved and come back', async () => {
      await page.goto(`/porada/${day}/udaje`);
      await hydrated();
      await expect(page.getByText(porada.details.carried)).toBeVisible();
      await page.getByLabel(new RegExp(`^${porada.details.present}`)).fill('Ředitel, zástupci');
      await page.getByLabel(new RegExp(`^${porada.details.guests}`)).fill('Host z magistrátu');
      await page.getByRole('button', { name: porada.details.save }).click();
      await settled();
      await expect(page.getByText(porada.details.saved)).toBeVisible();
      await page.reload();
      await hydrated();
      await expect(page.getByLabel(new RegExp(`^${porada.details.present}`))).toHaveValue(
        'Ředitel, zástupci',
      );
      await expect(page.getByText(porada.details.carried)).toHaveCount(0);
      await expectAccessible();
    });

    await test.step('Příloha 2: typed, saved, then „Odebrat přílohu“ remounts an empty field', async () => {
      const errors = watchMountErrors(page);
      await page.goto(`/porada/${day}/priloha-2`);
      await hydrated();
      const editor = editorIn(page, /^Text přílohy/);
      await mounted(editor);
      await editor.click();
      await page.keyboard.type('Text přílohy J4');
      await page.getByRole('button', { name: porada.annex2.save, exact: true }).click();
      await settled();
      await expect(page.getByText(porada.annex2.saved)).toBeVisible();

      await page.getByRole('button', { name: porada.annex2.remove }).click();
      await settled();
      await expect(page.getByText(porada.annex2.removed)).toBeVisible();
      await expect(page.getByText(porada.annex2.none)).toBeVisible();
      const fresh = editorIn(page, /^Text přílohy/);
      await mounted(fresh);
      await expect(fresh.getByText('Text přílohy J4')).toHaveCount(0);
      await expect(page.locator('.rt-box .ProseMirror')).toHaveCount(1);
      // The new editor works: it takes text and the counter follows.
      await fresh.click();
      await page.keyboard.type('Nový text');
      await expect(fresh).toContainText('Nový text');
      await expect(page.getByText(/Využito \d+\s% místa pro text\./)).toBeVisible();
      expect(errors()).toEqual([]);
      expect(await styleLeaks(page, fresh)).toEqual([]);
      await expectAccessible();
      // Leave it empty again, so the preview is of a porada without the annex.
      await page.getByRole('button', { name: porada.annex2.remove }).click();
      await settled();
      await expect(page.getByText(porada.annex2.none)).toBeVisible();
    });

    await test.step('the full preview lists the waiting point and prints the item', async () => {
      await page.goto(`/porada/${day}/nahled`);
      await hydrated();
      const flight = page.getByRole('region', { name: porada.preflight.title });
      await expect(flight.getByText(porada.preflight.level.warn)).toBeVisible();
      await expect(flight.getByText(porada.preflight.code['points-waiting'])).toBeVisible();
      await expect(flight.getByRole('link', { name: waiting })).toBeVisible();
      const paper = page.getByRole('region', { name: porada.preview.paper });
      await expect(paper.getByText(title)).toBeVisible();
      await expect(paper.getByText('Vnořený odstavec')).toBeVisible();
      await expect(paper.getByText('Ředitel, zástupci')).toBeVisible();
      await expectAccessible();
    });

    await test.step('removes the item; the outline and the preview forget it', async () => {
      await page.goto(`/porada/${day}/pokyny`);
      await hydrated();
      await page
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: porada.outline.remove })
        .click();
      await settled();
      await expect(page.getByText(porada.outline.said.removed)).toBeVisible();
      await expect.poll(() => titlesOf(page)).not.toContain(title);
      await page.goto(`/porada/${day}/nahled`);
      await expect(page.getByRole('region', { name: porada.preview.paper })).not.toContainText(
        title,
      );
    });
  });
});

/** Types a word, selects it and leaves it selected. */
async function typeAndSelect(page: Page, editor: Locator, text: string): Promise<void> {
  await editor.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Shift+Home');
}

test.describe('SP-T: the rich-text editor under the nonce CSP', () => {
  test.afterEach(async ({}, testInfo) => {
    await forgetIssues([
      monday('keys', testInfo.project.name),
      monday('mount', testInfo.project.name),
    ]);
  });

  test('keys, copy, drag and paste raise no violation and leave no style behind', async ({
    page,
    context,
    hydrated,
    signInAs,
    cspViolations,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = monday('keys', project);
    const errors = watchMountErrors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInAs(headmaster(project));

    // (3) The server's markup is there before any script runs, once.
    await page.goto(`/porada/${day}/priloha-2`);
    await hydrated();
    const editor = editorIn(page, /^Text přílohy/);
    await mounted(editor);
    await expect(page.locator('.rt-static')).toHaveCount(0);
    await expect(page.locator('.rt-box .ProseMirror')).toHaveCount(1);
    await expect(page.getByText(richtext.help)).toBeVisible();

    // Typing, Tab and Shift+Tab, with the level announced for a screen reader.
    await editor.click();
    await page.keyboard.type('Alfa');
    await expect(editor).toContainText('Alfa');
    await page.keyboard.press('Tab');
    expect(await paragraphsOf(editor)).toEqual([['1', 'Alfa']]);
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: richtext.level(1) }),
    ).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    expect(await paragraphsOf(editor)).toEqual([['0', 'Alfa']]);
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: richtext.paragraph }),
    ).toBeVisible();

    // Esc, then Tab, leaves the field instead of indenting.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(editor).not.toBeFocused();
    expect(await paragraphsOf(editor)).toEqual([['0', 'Alfa']]);

    // Bold and italic, by key and by the toolbar's state.
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('tučně');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+i');
    await page.keyboard.type(' kurzívou');
    await expect(editor.locator('strong')).toHaveText('tučně');
    await expect(editor.locator('em')).toHaveText(' kurzívou');
    await expect(page.getByRole('button', { name: richtext.toolbar.italic })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Control+i');

    // Undo and redo.
    await page.keyboard.press('Control+z');
    await expect(editor).not.toContainText('kurzívou');
    await page.keyboard.press('Control+Shift+z');
    await expect(editor).toContainText('kurzívou');

    // Copy: the clipboard gets the text, through the editor's own serializer.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Alfa');

    // Drag of selected text within the editor.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await typeAndSelect(page, editor, 'Přesun');
    const from = await editor.getByText('Přesun').boundingBox();
    const to = await editor.getByText('Alfa').boundingBox();
    expect(from && to).toBeTruthy();
    await page.mouse.move(from!.x + 6, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + 4, to!.y + to!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(editor).toContainText('Přesun');

    // Paste of Word's HTML: mso styles, a <style> block and an <img> become plain paragraphs.
    await pasteHtml(editor, WORD_PASTE);
    await expect(editor).toContainText('Wordový pokyn');
    await expect(editor.locator('img, style, script')).toHaveCount(0);

    // (2) No style attribute in the editor, no <style> without the nonce; (1) no violation.
    expect(await styleLeaks(page, editor)).toEqual([]);
    expect(await styleLeaks(page, page.locator('main'))).toEqual([]);
    expect(cspViolations).toEqual([]);
    expect(errors()).toEqual([]);
    await expectAccessible();
  });

  test('the item editor shows the stored text from the server, then the live editor, once', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = monday('mount', project);
    const errors = watchMountErrors(page);
    await signInAs(headmaster(project));
    await page.goto(`/porada/${day}/pokyny/nova?cast=pokyny`);
    await hydrated();
    const editor = editorIn(page, BODY);
    await mounted(editor);
    await page.getByLabel(porada.outline.editor.name).fill(`SSR ${project}`);
    await editor.click();
    await page.keyboard.type('Uložený text');
    await page.getByRole('button', { name: porada.outline.editor.add }).click();
    await expect(page).toHaveURL(new RegExp(`/porada/${day}/pokyny$`));
    await hydrated();
    await page
      .getByRole('listitem')
      .filter({ hasText: `SSR ${project}` })
      .getByRole('link', { name: porada.outline.edit })
      .click();
    await expect(page).toHaveURL(/pokyny\/[0-9a-f-]{36}$/);
    const url = page.url();

    // The server's own answer (cookies of this context) carries the text, outside any editor.
    const html = await (await page.request.get(url)).text();
    expect(html).toContain('Uložený text');
    expect(html).not.toContain('contenteditable');
    expect(html).not.toContain('style="');

    await page.goto(url);
    await hydrated();
    const live = editorIn(page, BODY);
    await mounted(live);
    await expect(live.getByText('Uložený text')).toHaveCount(1);
    await expect(page.locator('.rt-static')).toHaveCount(0);

    // Re-renders around the editor (counter, toolbar, hidden input) leave its DOM alone.
    await live.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' a další');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('!');
    await expect(live.getByText('Uložený text')).toHaveCount(1);
    await expect(page.locator('.rt-box .ProseMirror')).toHaveCount(1);
    await expect(page.locator('input[name="body"]')).toHaveValue(/Uložený text a další/);
    expect(errors()).toEqual([]);
    // Leave without saving: nothing is stored, and the guard has nothing to ask.
    await page.evaluate(() => (window.onbeforeunload = null));
  });
});
