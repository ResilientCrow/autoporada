/**
 * m9-screens: every screen M9 adds, in both projects: axe, the reflow, the focus rings and the skip
 * link (`checkScreen`), the CSP listener (an automatic fixture of every test, so a violation fails
 * the test it happens in), and no `style` attribute in the server's HTML or under `<main>`.
 * The journeys are in j4-porada, j5-registr and j6-presun and are not repeated here.
 *
 * The headmaster is `rizeni-*`. The porada screens work on a Monday of their own, which one added
 * item makes real; it is forgotten afterwards.
 */
import type { Page } from '@playwright/test';

import { porada, registry } from '@/ui/copy';

import { personaOf } from './db';
import { expect, test } from './fixtures';
import { forgetIssues, mondayIn } from './porada-db';

const WEEK = { desktop: 6, mobile: 7 } as const;
const headmaster = (project: string) =>
  new RegExp(`^Test – ${personaOf('rizeni', project).subject}`);

/** No `style` attribute below `<main>` (the route announcer outside it may get one through the CSSOM). */
async function expectNoStyleAttributes(page: Page): Promise<void> {
  expect(await page.locator('main [style]').count()).toBe(0);
}

test.describe('the porada, registry and settings screens', () => {
  test.afterEach(async ({}, testInfo) => {
    await forgetIssues([mondayIn(WEEK[testInfo.project.name as 'desktop' | 'mobile'])]);
  });

  test('every porada screen, with an item of the outline', async ({
    page,
    hydrated,
    settled,
    signInAs,
    checkScreen,
    expectAccessible,
    attachScreenshot,
    expectNoReflow,
    expectSkipLink,
  }, testInfo) => {
    const project = testInfo.project.name;
    const day = mondayIn(WEEK[project as 'desktop' | 'mobile']);
    const title = `Bod obrazovek ${project}`;
    // Two kinds of control stop the Tab walk of `checkScreen` short: an editor takes Tab for the
    // levels (Esc lets go of it; its keys are SP-T's, in j4-porada), and desktop Chromium's date
    // input has a tab stop per segment, which the walk reads as a stop it has seen. These screens
    // get the rest of the check.
    const partialScreen = async (name: string) => {
      await expectAccessible();
      await attachScreenshot(name);
      await expectNoReflow();
      await expectSkipLink();
    };
    await signInAs(headmaster(project));

    // The outline comes first: its add form is what makes the item the editor screen needs.
    await page.goto(`/porada/${day}/pokyny`);
    await hydrated();
    await page
      .getByRole('region', { name: porada.outline.sections.pokyny })
      .locator('summary')
      .click();
    const add = page.locator('form#pridat-pokyny');
    await add.getByLabel(porada.outline.add.name).fill(title);
    await add.getByRole('radio', { name: porada.outline.persistence.once }).check();
    await add.getByRole('button', { name: porada.outline.add.submit }).click();
    await settled();
    await expect(page.getByText(porada.outline.said.added)).toBeVisible();
    // The screen is checked as a visitor finds it: freshly loaded, focus at the top.
    await page.goto(`/porada/${day}/pokyny`);
    await hydrated();
    await expectNoStyleAttributes(page);
    await checkScreen('the outline of Pokyny a hospodaření');

    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('link', { name: porada.outline.edit })
      .click();
    await expect(page).toHaveURL(new RegExp(`/porada/${day}/pokyny/[0-9a-f-]{36}$`));
    await page.reload();
    await hydrated();
    await expectNoStyleAttributes(page);
    await partialScreen('the item editor');

    for (const [path, name, editor] of [
      ['', 'the porada page'],
      ['/presunout', 'the move form', true],
      ['/udaje', 'Údaje'],
      ['/pokyny/nova?cast=pokyny', 'the new item form', true],
      ['/priloha-2', 'Příloha 2', true],
      ['/nahled', 'the preview'],
    ] as readonly (readonly [string, string, boolean?])[]) {
      await page.goto(`/porada/${day}${path}`);
      await hydrated();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoStyleAttributes(page);
      if (editor === true) await partialScreen(name);
      else await checkScreen(name);
    }
  });

  test('the registry screens and the settings', async ({
    page,
    hydrated,
    signInAs,
    checkScreen,
  }, testInfo) => {
    await signInAs(headmaster(testInfo.project.name));

    await page.goto('/registr');
    await hydrated();
    await expect(page.getByRole('heading', { level: 1, name: registry.title })).toBeVisible();
    await expectNoStyleAttributes(page);
    await checkScreen('the lists of the registry');
    const list = (await page
      .getByRole('link', { name: registry.lists.open })
      .first()
      .getAttribute('href'))!;

    for (const [path, name] of [
      [list, 'the students of a list'],
      [`${list}/vlozit`, 'the paste of a list'],
      ['/registr/novy-skolni-rok', 'a new school year'],
      ['/nastaveni', 'the settings'],
    ] as const) {
      await page.goto(path);
      await hydrated();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoStyleAttributes(page);
      await checkScreen(name);
    }
  });
});
