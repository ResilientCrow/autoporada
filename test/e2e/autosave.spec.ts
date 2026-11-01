/**
 * The autosave of the point editor in a real browser (ADR 0017, 0024): what the machine's unit
 * tests cannot show, the page events and the real server's answers. The debounce and the retry
 * ladder run on Playwright's clock; a save on blur needs none; a test of a flush freezes the clock,
 * so the debounce cannot stand in for it.
 *
 * One author per project; each test makes its own point and clears it by id, because
 * editor.spec.ts uses the same author at the same time.
 */
import type { Page } from '@playwright/test';

import { autosave, cs, points } from '@/ui/copy';

import { forgetPoints, personaOf, readPoint, seedPoint, withdrawBehindBack } from './db';
import {
  banners,
  countActions,
  DEBOUNCE_MS,
  expect,
  field,
  freezeClock,
  LADDER_MS,
  openNav,
  SAVED,
  showAllPersonas,
  test,
  type Fixtures,
} from './fixtures';

const author = (project: string) => personaOf('ukladani', project);
const signInRe = (project: string) => new RegExp(`^Test – ${author(project).subject}`);

const titleOf = (id: string) => async () => (await readPoint(id)).title;

test.describe('autosave in the point editor', () => {
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
    title = 'Seminář k ukládání',
  ): Promise<string> {
    const id = await seedPoint(author(project).email, title, 'draft');
    ids.push(id);
    await signInAs(signInRe(project));
    await page.goto(`/body/${id}`);
    await hydrated();
    return id;
  }

  /** A second page of the same author saves first, so this page's next save finds the point moved on. */
  async function overtaken(page: Page, hydrated: Fixtures['hydrated'], id: string): Promise<void> {
    const other = await page.context().newPage();
    await other.goto(`/body/${id}`);
    await hydrated(other);
    await field(other, points.editor.title).fill('Z druhého okna');
    await other.keyboard.press('Tab');
    await expect(other.getByText(SAVED)).toBeVisible();
  }

  test('a soft navigation flushes what was typed, although no pause or blur came', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await freezeClock(page);
    await field(page, points.editor.title).fill('Uloženo při odchodu');
    // A programmatic click moves no focus and the clock stands still: only the unmount can save.
    await openNav(page);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: cs.nav.overview })
      .evaluate((link: HTMLElement) => link.click());
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(titleOf(id)).toBe('Uloženo při odchodu');
  });

  test('a reload flushes what was typed (pagehide, and the page turning hidden), and beforeunload warns only while text is unsaved', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await freezeClock(page);
    const warned: string[] = [];
    page.on('dialog', (dialog) => {
      warned.push(dialog.type());
      void dialog.accept();
    });

    // Saved, then reloaded: nothing to warn about.
    await field(page, points.editor.title).fill('Nejdřív uložený');
    await page.keyboard.press('Tab');
    await expect(page.getByText(SAVED)).toBeVisible();
    await page.reload();
    await hydrated();
    await freezeClock(page);
    expect(warned).toEqual([]);

    // Typed and reloaded at once, the clock stopped: the page warns, and only the pagehide flush saves it.
    await field(page, points.editor.title).fill('Ještě neuložený');
    await page.reload();
    await hydrated();
    expect(warned).toEqual(['beforeunload']);
    await expect.poll(titleOf(id)).toBe('Ještě neuložený');
  });

  test('two pages of one author: the second is told, reloads the server’s values and saves again', async ({
    page,
    hydrated,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await overtaken(page, hydrated, id);

    await field(page, points.editor.title).fill('Z prvního okna');
    await page.keyboard.press('Tab');
    const alert = banners(page);
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText(autosave.conflict.text);
    await expect(page.getByText(autosave.unsaved)).toBeVisible();
    // A banner holds the editor: handing the point in would do nothing, so the button is off.
    const submit = page.getByRole('button', { name: points.submit.button });
    await expect(submit).toBeDisabled();
    // The text stays where it was typed, read-only until the author answers.
    await expect(field(page, points.editor.title)).toHaveValue('Z prvního okna');
    await expect(field(page, points.editor.title)).not.toBeEditable();
    await expectAccessible();

    await alert.getByRole('button', { name: autosave.conflict.reload }).click();
    await expect(banners(page)).toHaveCount(0);
    await expect(field(page, points.editor.title)).toHaveValue('Z druhého okna');
    await expect(field(page, points.editor.title)).toBeEditable();
    await expect(submit).toBeEnabled();

    await field(page, points.editor.title).fill('Znovu z prvního');
    await page.keyboard.press('Tab');
    await expect(page.getByText(SAVED)).toBeVisible();
    await expect.poll(titleOf(id)).toBe('Znovu z prvního');
  });

  test('„Ponechat moji verzi“ saves the page’s text over the newer one', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await overtaken(page, hydrated, id);

    await field(page, points.editor.title).fill('Moje verze');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: autosave.conflict.keepMine }).click();
    await expect(banners(page)).toHaveCount(0);
    await expect(page.getByText(SAVED)).toBeVisible();
    await expect.poll(titleOf(id)).toBe('Moje verze');
    // Focus is back on the field that was being edited, not lost with the banner.
    await expect(field(page, points.editor.title)).toBeFocused();
  });

  test('signed out: the text is kept, and „Uložit“ saves it after signing in again', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await page.context().clearCookies();
    await field(page, points.editor.title).fill('Napsáno po odhlášení');
    await page.keyboard.press('Tab');
    const alert = banners(page);
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText(autosave.signedOut.text);
    await expect(field(page, points.editor.title)).toHaveValue('Napsáno po odhlášení');

    // The banner's link opens the sign-in on a new tab: do the same in this context.
    const tab = await page.context().newPage();
    await tab.goto('/');
    await tab.getByRole('link', { name: cs.signIn.button }).click();
    await showAllPersonas(tab);
    await tab.getByRole('button', { name: signInRe(testInfo.project.name) }).click();
    await hydrated(tab);
    await tab.close();

    await alert.getByRole('button', { name: autosave.signedOut.save }).click();
    await expect(banners(page)).toHaveCount(0);
    await expect(page.getByText(SAVED)).toBeVisible();
    await expect.poll(titleOf(id)).toBe('Napsáno po odhlášení');
    // Focus is back on the field that was being edited, not lost with the banner.
    await expect(field(page, points.editor.title)).toBeFocused();
  });

  test('a point that moved on behind the page’s back shows the locked banner with a reload only, read-only', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await withdrawBehindBack(id);
    const title = field(page, points.editor.title);
    await title.fill('Text po zrušení');
    await page.keyboard.press('Tab');
    const alert = banners(page);
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText(autosave.locked.text);
    await expect(alert.getByRole('button')).toHaveText([autosave.locked.reload]);
    await expect(title).toHaveValue('Text po zrušení');
    await expect(title).not.toBeEditable();
  });

  test('a point removed behind the page’s back shows the gone banner and keeps the text and focus', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await forgetPoints([id]);
    const title = field(page, points.editor.title);
    await title.fill('Text bez bodu');
    await page.clock.fastForward(DEBOUNCE_MS + 100);
    const alert = banners(page);
    await expect(alert).toHaveCount(1);
    await expect(alert.getByRole('button', { name: autosave.gone.reload })).toBeVisible();
    await expect(title).toHaveValue('Text bez bodu');
    await expect(title).toBeFocused();
  });

  test('a save that keeps failing climbs the ladder to one banner, keeps the text and focus, and retries on request', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    let refuse = true;
    let tries = 0;
    await page.route(
      (url) => url.pathname === `/body/${id}`,
      async (route) => {
        const request = route.request();
        if (
          !refuse ||
          request.method() !== 'POST' ||
          request.headers()['next-action'] === undefined
        ) {
          return route.fallback();
        }
        tries += 1;
        return route.abort('connectionfailed');
      },
    );
    const title = field(page, points.editor.title);
    await title.fill('Při výpadku spojení');
    await page.clock.fastForward(DEBOUNCE_MS + 100);
    for (const [step, wait] of LADDER_MS.entries()) {
      await expect.poll(() => tries).toBe(step + 1);
      await expect(banners(page)).toHaveCount(0);
      await page.clock.fastForward(wait + 100);
    }
    await expect.poll(() => tries).toBe(LADDER_MS.length + 1);
    const alert = banners(page);
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText(`${autosave.failed.lead} ${autosave.failed.network}`);
    await expect(title).toHaveValue('Při výpadku spojení');
    await expect(title).toBeFocused();

    refuse = false;
    await alert.getByRole('button', { name: autosave.failed.retry }).click();
    await expect(banners(page)).toHaveCount(0);
    await expect.poll(titleOf(id)).toBe('Při výpadku spojení');
    await expect(title).toBeFocused();
  });

  // The machine's `warnOnUnload` (ADR 0017 item 5): every state that holds text the server lacks warns.
  test('beforeunload warns in the conflict state too', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await overtaken(page, hydrated, id);
    await field(page, points.editor.title).fill('Z prvního okna');
    await page.keyboard.press('Tab');
    await expect(banners(page)).toContainText(autosave.conflict.text);
    const warned: string[] = [];
    page.on('dialog', (dialog) => {
      warned.push(dialog.type());
      void dialog.accept();
    });
    await page.reload();
    expect(warned).toEqual(['beforeunload']);
  });

  test('beforeunload warns in the signed-out state too', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await open(page, hydrated, signInAs, testInfo.project.name);
    await page.context().clearCookies();
    await field(page, points.editor.title).fill('Napsáno po odhlášení');
    await page.keyboard.press('Tab');
    await expect(banners(page)).toContainText(autosave.signedOut.text);
    const warned: string[] = [];
    page.on('dialog', (dialog) => {
      warned.push(dialog.type());
      void dialog.accept();
    });
    await page.reload();
    expect(warned).toEqual(['beforeunload']);
  });

  test('„Zrušit bod“ that meets a conflict shows only the autosave banner and withdraws nothing', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    await page.clock.install();
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await freezeClock(page);
    await overtaken(page, hydrated, id);
    // The box first, then the text: focus stays in the title, so nothing but the press sends it.
    await page.getByLabel(points.transitions.withdraw.confirm).check();
    await field(page, points.editor.title).fill('Zrušeno po konfliktu');
    await page
      .getByRole('button', { name: points.transitions.withdraw.button })
      .evaluate((button: HTMLElement) => button.click());
    const alert = banners(page);
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText(autosave.conflict.text);
    // One notice in all: the withdraw form says nothing of its own, and the point is still a draft.
    await expect(page.locator('#bod-zrusit').getByRole('alert')).toHaveCount(0);
    const stored = await readPoint(id);
    expect(stored.state).toBe('draft');
    expect(stored.title).toBe('Z druhého okna');
  });

  test('the submit waits for what was typed and sends the version it landed on', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    await field(page, points.editor.title).fill('Odesláno s čerstvým názvem');
    // No blur and no pause: the press itself must find the text unsent, save it and then submit.
    await page
      .getByRole('button', { name: points.submit.button })
      .evaluate((button: HTMLElement) => button.click());
    await expect.poll(async () => (await readPoint(id)).state).toBe('submitted');
    expect((await readPoint(id)).title).toBe('Odesláno s čerstvým názvem');
    await expect(banners(page)).toHaveCount(0);
  });

  test('a blur of a field that was not edited sends no save', async ({
    page,
    hydrated,
    signInAs,
  }, testInfo) => {
    const id = await open(page, hydrated, signInAs, testInfo.project.name);
    const actions = countActions(page);
    const title = field(page, points.editor.title);
    await title.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    // The sentinel: the one real edit sends exactly one call, so the blurs before it sent none.
    await title.fill('Jediná změna');
    await page.keyboard.press('Tab');
    await expect(page.getByText(SAVED)).toBeVisible();
    await expect.poll(titleOf(id)).toBe('Jediná změna');
    expect(actions.count()).toBe(1);
  });
});
