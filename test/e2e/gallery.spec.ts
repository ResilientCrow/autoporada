import type { Locator, Page } from '@playwright/test';

import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

/** The seven of the colour manual; Tailwind's preflight adds the transparent #0000. */
const ALLOWED_HEX = new Set([
  '#22232a',
  '#000e19',
  '#00233f',
  '#0062b3',
  '#cce8ff',
  '#f7fbff',
  '#f5b800',
  '#0000',
]);

test('the gallery loads, hydrates and passes axe', async ({ page, hydrated, expectAccessible }) => {
  await page.goto('/vzornik');
  await hydrated();
  await expectAccessible();
});

test('React Aria styles its pressables with the page nonce, and a press breaks no policy', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const style = page.locator('head > style#react-aria-pressable-style');
  await expect(style).toHaveCount(1);
  const metaNonce = await page
    .locator('meta[name="csp-nonce"]')
    .evaluate((m) => (m as HTMLMetaElement).nonce);
  expect(metaNonce).not.toBe('');
  expect(await style.evaluate((s) => (s as HTMLStyleElement).nonce)).toBe(metaNonce);
  const button = page.getByRole('button', { name: cs.gallery.buttons.primary });
  expect(await button.evaluate((b) => getComputedStyle(b).touchAction)).toBe('manipulation');
  await button.click();
});

test('the built stylesheet holds only the manual, and Czech letters come from the web font', async ({
  page,
  request,
}) => {
  await page.goto('/vzornik');
  const hrefs = await page
    .locator('link[rel=stylesheet]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  for (const href of hrefs) {
    const css = await (await request.get(href)).text();
    const hexes = (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase());
    expect(hexes.filter((h) => !ALLOWED_HEX.has(h))).toEqual([]);
    expect(css).not.toContain('data:');
    const urls = [...css.matchAll(/url\(\s*["']?([^"')\s]+)/g)].map((m) => m[1]!);
    expect(urls.filter((u) => new URL(u, href).origin !== origin)).toEqual([]);
  }
  const faces = await page.evaluate(
    async () => (await document.fonts.load('16px "Mona Sans Variable"', 'ŘŠČ')).length,
  );
  expect(faces).toBeGreaterThan(0);
});

const { live } = cs.gallery.forms;
/** The live form's own status node; the search boxes add status regions of their own. */
const formStatus = (page: Page) =>
  page.getByRole('region', { name: cs.gallery.forms.title }).getByRole('status');
const summaryOf = (page: Page) =>
  page.locator('form#demo-live [tabindex="-1"]').filter({ has: page.getByRole('alert') });

test('a failed submit puts the summary in focus and prefixes the title, and its link leads to the field', async ({
  page,
  hydrated,
  settled,
  expectAccessible,
  attachScreenshot,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const title = await page.title();
  const form = page.locator('form#demo-live');
  const summary = summaryOf(page);
  const focused = () => page.evaluate(() => document.activeElement?.id ?? '');
  const submit = form.getByRole('button', { name: cs.gallery.forms.submit });

  // Nothing is focused or prefixed on load.
  await expect(summary).toHaveCount(0);
  expect(title.startsWith(cs.form.errorPrefix)).toBe(false);

  await submit.click();
  await settled();
  await expect(summary).toBeFocused();
  await expect(page).toHaveTitle(`${cs.form.errorPrefix} ${title}`);
  await expectAccessible();
  await attachScreenshot('the gallery live demo with errors');

  await form.getByRole('link', { name: new RegExp(`^${live.name}:`) }).click();
  const name = form.getByLabel(live.name);
  await expect(name).toBeFocused();
  await expect(form.getByText(live.name, { exact: true }).first()).toBeInViewport();
  expect(await focused()).toBe('demo-live-name');

  await name.fill('Eva');
  await form.getByLabel(live.reason).fill('x'.repeat(41));
  await submit.click();
  await settled();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText(live.reasonTooLong);

  await form.getByLabel(live.reason).fill('Stačí to.');
  await submit.click();
  await settled();
  await expect(formStatus(page)).toHaveText(live.sent);
  await expect(summary).toHaveCount(0);
  await expect(page).toHaveTitle(title);
  await expectAccessible();
});

test('success fills the same status node, and a second success is a fresh notice', async ({
  page,
  hydrated,
  settled,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const form = page.locator('form#demo-live');
  const status = formStatus(page);
  await expect(status).toBeEmpty();
  const node = await status.elementHandle();
  await form.getByLabel(live.name).fill('Eva');
  await form.getByLabel(live.reason).fill('Stačí to.');

  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  await expect(status).toHaveText(live.sent);
  expect(await status.elementHandle().then((h) => h?.evaluate((el, n) => el === n, node))).toBe(
    true,
  );
  const first = await status.locator('> div').elementHandle();

  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  const second = await status.locator('> div').elementHandle();
  expect(await first?.evaluate((el, n) => el === n, second)).toBe(false);
});

test('a network failure shows its problem, focused', async ({ page, hydrated, settled }) => {
  await page.goto('/vzornik');
  await hydrated();
  const form = page.locator('form#demo-live');
  await form.getByLabel(live.name).fill(live.networkTrigger);
  await form.getByLabel(live.reason).fill('Stačí to.');
  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  const problem = summaryOf(page);
  await expect(problem).toBeFocused();
  await expect(problem).toContainText(cs.errors.network);
  await expect(page).toHaveTitle(/^(?!Chyba:)/);
});

test('an unavailable answer shows the problem with the request id', async ({
  page,
  hydrated,
  settled,
  expectAccessible,
}) => {
  await page.goto('/vzornik?stav=nedostupne');
  await hydrated();
  const form = page.locator('form#demo-live');
  await form.getByLabel(live.name).fill('Eva');
  await form.getByLabel(live.reason).fill('Stačí to.');
  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  const problem = summaryOf(page);
  await expect(problem).toBeFocused();
  await expect(problem).toContainText(`${cs.app.errorCode} abcdef12-3456`);
  await expectAccessible();
});

const { people } = cs.gallery;
const { search } = cs.people;

/** The two search boxes of the gallery: against the invented directory, and with the directory off. */
const liveBox = (page: Page) =>
  page.getByRole('combobox', { name: people.live.label, exact: true });
const offBox = (page: Page) => page.getByRole('combobox', { name: people.off.label, exact: true });
/**
 * Scroll first, to the middle of the screen: React Aria closes the list when the page scrolls under
 * it, as when focus brings the box into view or an option at the screen edge is scrolled to.
 */
const openBox = async (box: Locator) => {
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await box.click();
};
const options = (page: Page) => page.getByRole('listbox').getByRole('option');
const addedMessage = (name: string, total: string) =>
  `Přidáno: ${name}. Celkem: ${total}.`.replace(/(\d) /, '$1\u00A0');

test('the search box lists recents, then the directory, then the manual option, and the keys walk all three', async ({
  page,
  hydrated,
  expectAccessible,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);

  // An empty box on focus lists the eight newest recents and nothing to add by hand.
  await openBox(box);
  const list = page.getByRole('listbox');
  await expect(list.getByRole('group', { name: search.recents })).toBeVisible();
  await expect(options(page)).toHaveCount(8);
  await expect(list.getByRole('option', { name: /Ivana Malá/ })).toHaveCount(0);

  // Three characters add the directory group; Jana is a recent and a hit, and is listed once.
  await box.pressSequentially('nov');
  await expect(list.getByRole('group', { name: search.directory })).toBeVisible();
  const texts = [
    'Jana Nováková',
    'Tomáš Nováček (3.B)',
    'Petr Novák',
    'Eva Novotná',
    'Tomáš Novotný',
    search.manual('nov'),
  ];
  await expect(options(page)).toHaveText(texts);

  // The arrow keys walk recents, directory and the manual option, one option at a time.
  for (const text of texts) {
    await page.keyboard.press('ArrowDown');
    await expect(options(page).filter({ hasText: text, visible: true }).first()).toHaveAttribute(
      'data-focused',
      'true',
    );
  }
  await page.keyboard.press('ArrowUp');
  await expect(options(page).nth(4)).toHaveAttribute('data-focused', 'true');

  // Enter adds the focused hit, empties the box, keeps focus in it and says so.
  await page.keyboard.press('Enter');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  // The announcement is in the accessibility tree, also while the list is open: the open list
  // hides the rest of the page from assistive technology, but not its live regions.
  const added = page
    .getByRole('status')
    .filter({ hasText: addedMessage('Tomáš Novotný', '1 osoba') });
  await expect(added).toHaveCount(1);
  await box.pressSequentially('k');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(added).toHaveCount(1);
  await box.fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('list', { name: people.added }).first()).toContainText(
    'Tomáš Novotný',
  );
  // axe on the closed box: while a React Aria list is open it hides the rest of the page
  // (aria-hidden), which axe reports as aria-hidden-focus, page-has-heading-one and region.
  await expectAccessible();
});

test('the last option adds the typed name by hand, with Enter or from the list', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);

  // From the list: the arrow up from the box lands on the last option.
  await openBox(box);
  await box.pressSequentially('Karel Dvořák');
  await expect(options(page).last()).toHaveText(search.manual('Karel Dvořák'));
  await page.keyboard.press('ArrowUp');
  await expect(options(page).last()).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByText(addedMessage('Karel Dvořák', '1 osoba'))).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');

  // With Enter alone: nothing in the list is focused, and the typed name still goes in.
  await box.pressSequentially('Zuzana Kubíčková');
  await page.keyboard.press('Enter');
  await expect(page.getByText(addedMessage('Zuzana Kubíčková', '2 osoby'))).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
});

test('an older answer never replaces a newer one, even one that was aborted and still arrives', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  await openBox(box);

  // „nov“ is the slow query: its answer takes 1.2 s and ignores the abort.
  await box.pressSequentially('nov');
  await page.waitForTimeout(450); // past the debounce: the slow request is in flight
  await box.pressSequentially('a');
  await expect(options(page).filter({ hasText: 'Petr Novák' })).toHaveCount(1);
  await expect(options(page).filter({ hasText: 'Eva Novotná' })).toHaveCount(0);

  // The slow answer is due about 1.2 s after it left; give it time to arrive and be dropped.
  await page.waitForTimeout(1500);
  await expect(options(page).filter({ hasText: 'Eva Novotná' })).toHaveCount(0);
  await expect(options(page).filter({ hasText: 'Petr Novák' })).toHaveCount(1);
});

test('notices stay beside the box as status text, and the box still adds by hand', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  // Through the accessibility tree, with the list open: a notice that arrives while the reader
  // types is announced, so the open list must not hide it.
  const notice = (text: string) => page.getByRole('status').filter({ hasText: text });
  await expect(notice(search.notice.off)).toHaveCount(1); // the off box, on load
  for (const [trigger, text] of [
    [people.triggers.down, search.notice.down],
    [people.triggers.rateLimited, search.notice.rateLimited],
    [people.triggers.signedOut, search.notice.signedOut],
  ] as const) {
    await box.fill('');
    await box.pressSequentially(trigger);
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(notice(text)).toHaveCount(1);
    // Never a listbox empty state: the manual option is still there to add the name.
    await expect(options(page).last()).toHaveText(search.manual(trigger));
  }

  // With the directory off the recents still work and the directory group never shows up.
  const off = offBox(page);
  await page.keyboard.press('Escape'); // the open list hides the other box from the page
  await openBox(off);
  await off.pressSequentially('nov');
  await expect(options(page).first()).toHaveText('Jana Nováková');
  await page.waitForTimeout(600);
  await expect(page.getByRole('group', { name: search.directory })).toHaveCount(0);
});

test('hits of an earlier text are never listed for another one', async ({ page, hydrated }) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  await openBox(box);

  await box.pressSequentially('nov');
  await options(page).filter({ hasText: 'Tomáš Novotný' }).click();
  await expect(box).toHaveValue('');

  // At once, inside the debounce: the answer for „nov“ is still the last one the box has.
  await box.pressSequentially('dvo');
  await expect(options(page).last()).toHaveText(search.manual('dvo'));
  // One look, no retries: a stale hit may not show even for the length of the debounce.
  expect(await options(page).filter({ hasText: /Nov/ }).count()).toBe(0);
  await expect(page.getByRole('group', { name: search.directory })).toBeVisible();
  await expect(options(page).filter({ hasText: 'Karel Dvořák' })).toHaveCount(1);
  await expect(options(page).filter({ hasText: /Nov/ })).toHaveCount(0);
});

test('after a rate limit the box waits out Retry-After before it asks again', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  await openBox(box);

  // The stub answers „rychle“ with 429 and Retry-After: 3.
  await box.pressSequentially(people.triggers.rateLimited);
  await expect(page.getByRole('status').filter({ hasText: search.notice.rateLimited })).toHaveCount(
    1,
  );

  await box.fill('');
  await box.pressSequentially('dvo');
  const directory = page.getByRole('group', { name: search.directory });
  await page.waitForTimeout(1500); // far past the 300 ms debounce, well inside the 3 s
  await expect(directory).toHaveCount(0);
  await expect(directory).toBeVisible({ timeout: 5_000 });
});

const { chips } = cs.people;

/** The demo with people in it: Jana (paní), Petr (no salutation), Karel (a class of last year); room for one more. */
const chipBox = (page: Page) =>
  page.getByRole('combobox', { name: people.chips.label, exact: true });
/**
 * The list and its rows are found by CSS, not by role: while the box's own list is open React Aria
 * hides the rest of the page from assistive technology, and a role query then finds nothing, which
 * would let a "no such chip" check pass for the wrong reason. Buttons are found by role, so the
 * list is closed first (closeList).
 */
const chipList = (page: Page) => page.locator(`ul[aria-label="${people.chips.list}"]`);
const chipRows = (page: Page) => chipList(page).locator('> li');
const chipRow = (page: Page, name: string) => chipRows(page).filter({ hasText: name });
const rowButton = (page: Page, kind: 'edit' | 'remove', name: string) =>
  page.getByRole('button', {
    name: kind === 'edit' ? chips.editLabel(name) : chips.removeLabel(name),
    exact: true,
  });
const editorOf = (page: Page, name: string) =>
  page.getByRole('group', { name: chips.editorLabel(name), exact: true });
/** The one open editor: its name follows the name being edited, so it is found by place, not by name. */
const openEditor = (page: Page) => chipList(page).getByRole('group');
const said = (page: Page, message: string) => page.getByRole('status').filter({ hasText: message });
/** The demo's own form, which records a send in `data-sent`. */
const chipForm = (page: Page) => page.locator('form').filter({ has: chipBox(page) });

/**
 * Focus in the box opens the recents list. It hides the chips and the bulk row from assistive
 * technology, so close it before a role query looks for them. Waits briefly for it to open, and
 * goes on if it does not. Escape closes the list; it never empties a typed text here because the
 * box is empty whenever this is called.
 */
async function closeList(page: Page) {
  const list = page.getByRole('listbox');
  await list.waitFor({ state: 'visible', timeout: 1_000 }).then(
    () => page.keyboard.press('Escape'),
    () => undefined,
  );
  await expect(list).toHaveCount(0);
}

test('the chips are a list of people, each flagged for what is left to check', async ({
  page,
  hydrated,
  expectAccessible,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  await expect(chipRows(page)).toHaveCount(3);
  await expect(chipRow(page, 'Petr Svoboda')).toContainText(chips.flag.salutation);
  await expect(chipRow(page, 'Karel Dvořák')).toContainText(chips.flag.class);
  await expect(chipRow(page, 'Jana Nováková')).not.toContainText(chips.flag.salutation);
  await expect(chipRow(page, 'Jana Nováková')).not.toContainText(chips.flag.class);
  // Every target is at least 44 px, whatever the screen.
  for (const button of await chipList(page).getByRole('button').all()) {
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await expectAccessible();
});

test('Hotovo closes the editor and puts focus back on that chip’s Upravit; Enter is Hotovo, not a send', async ({
  page,
  hydrated,
  expectAccessible,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const edit = rowButton(page, 'edit', 'Petr Svoboda');
  await edit.click();
  const editor = openEditor(page);
  await expect(editorOf(page, 'Petr Svoboda')).toBeVisible();
  await expect(edit).toHaveAttribute('aria-expanded', 'true');
  await expectAccessible();

  // One editor at a time: opening Karel's closes Petr's.
  await rowButton(page, 'edit', 'Karel Dvořák').click();
  await expect(editor).toHaveCount(1);
  await expect(editorOf(page, 'Petr Svoboda')).toHaveCount(0);
  await expect(editorOf(page, 'Karel Dvořák')).toBeVisible();

  await edit.click();
  await editor.getByLabel(chips.editor.salutation).selectOption('pan');
  // The demo sits in a form with a send button, so an Enter that was let through would send it.
  const form = chipForm(page);
  await expect(form).not.toHaveAttribute('data-sent', 'true');
  await editor.getByLabel(chips.editor.titlesBefore).fill('Ing.');
  await editor.getByLabel(chips.editor.titlesBefore).press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(chipRow(page, 'Petr Svoboda')).toContainText('Ing. Petr Svoboda');
  await expect(chipRow(page, 'Petr Svoboda')).not.toContainText(chips.flag.salutation);
  await expect(form).not.toHaveAttribute('data-sent', 'true');

  // The same form does send when its own button is pressed, so the check above can fail.
  await form.getByRole('button', { name: people.chips.send }).click();
  await expect(form).toHaveAttribute('data-sent', 'true');
});

test('an empty given name or surname keeps the editor open, also when it is closed or another is opened', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const petr = rowButton(page, 'edit', 'Petr Svoboda');
  await petr.click();
  const editor = openEditor(page);
  await editor.getByLabel(chips.editor.familyName).fill('');
  await editor.getByRole('button', { name: chips.editor.done }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText(cs.fieldIssues.required);

  // Neither its own Upravit nor another chip's closes it. The chip's name follows the emptied
  // surname, so its Upravit is found by place and its editor goes by the given name alone.
  await chipList(page).getByRole('button', { expanded: true }).click();
  await expect(editor).toBeVisible();
  await rowButton(page, 'edit', 'Karel Dvořák').click();
  await expect(editorOf(page, 'Petr')).toBeVisible();
  await expect(editorOf(page, 'Karel Dvořák')).toHaveCount(0);
  await expect(editor).toContainText(cs.fieldIssues.required);

  // Once it is fixed, switching closes Petr's and opens Karel's.
  await editor.getByLabel(chips.editor.familyName).fill('Svobodová');
  await rowButton(page, 'edit', 'Karel Dvořák').click();
  await expect(editorOf(page, 'Petr Svobodová')).toHaveCount(0);
  await expect(editorOf(page, 'Karel Dvořák')).toBeVisible();
  await expect(chipRow(page, 'Petr Svobodová')).toHaveCount(1);
});

test('closing or switching an editor trims its fields as Hotovo does', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const karel = rowButton(page, 'edit', 'Karel Dvořák');
  await karel.click();
  const editor = openEditor(page);
  await editor.getByLabel(chips.editor.givenName).fill('  Karel  ');
  // Closing by its own Upravit.
  await karel.click();
  await expect(editor).toHaveCount(0);
  await karel.click();
  await expect(editor.getByLabel(chips.editor.givenName)).toHaveValue('Karel');

  // Switching to another chip.
  await editor.getByLabel(chips.editor.familyName).fill(' Dvořák ');
  await rowButton(page, 'edit', 'Petr Svoboda').click();
  await karel.click();
  await expect(editor.getByLabel(chips.editor.familyName)).toHaveValue('Dvořák');
});

test('a class is written the way lists do; one the author changed is current, one left alone stays flagged', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const karel = rowButton(page, 'edit', 'Karel Dvořák');

  // Opened and closed with the class untouched: still last year's, still flagged.
  await karel.click();
  const editor = openEditor(page);
  await editor.getByRole('button', { name: chips.editor.done }).click();
  await expect(chipRow(page, 'Karel Dvořák')).toContainText(chips.flag.class);

  // Changed and left by Tab: written out, and current.
  await karel.click();
  const klass = editor.getByLabel(chips.editor.affiliation);
  await klass.fill('2c');
  await klass.blur();
  await expect(klass).toHaveValue('2.C');
  await expect(chipRow(page, 'Karel Dvořák')).not.toContainText(chips.flag.class);
  await editor.getByRole('button', { name: chips.editor.done }).click();

  // Changed and finished with Enter in the field itself: written out the same way, no stray blur undoes it.
  const petr = rowButton(page, 'edit', 'Petr Svoboda');
  await petr.click();
  await editor.getByLabel(chips.editor.affiliation).fill(' 3b ');
  await editor.getByLabel(chips.editor.affiliation).press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(petr).toBeFocused();
  await expect(chipRow(page, 'Petr Svoboda')).toContainText('(3.B)');
  await expect(chipRow(page, 'Petr Svoboda')).not.toContainText(chips.flag.class);
  await petr.click();
  await expect(editor.getByLabel(chips.editor.affiliation)).toHaveValue('3.B');
  await expect(chipRow(page, 'Karel Dvořák')).toContainText('(2.C)');
});

test('„Třída platí“ clears the flag of an old class, and an emptied class takes its flag with it', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  await rowButton(page, 'edit', 'Karel Dvořák').click();
  const editor = openEditor(page);
  await editor.getByRole('button', { name: chips.editor.classValid }).click();
  await expect(chipRow(page, 'Karel Dvořák')).not.toContainText(chips.flag.class);
  await expect(editor.getByLabel(chips.editor.affiliation)).toHaveValue('3.B');

  await editor.getByLabel(chips.editor.affiliation).fill('');
  await editor.getByRole('button', { name: chips.editor.done }).click();
  await expect(editor).toHaveCount(0);
  await expect(chipRow(page, 'Karel Dvořák')).not.toContainText('3.B');
  await expect(chipRow(page, 'Karel Dvořák')).not.toContainText(chips.flag.class);
});

test('removing a chip moves focus to the next one, or to the box when there is none, and says so', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();

  // The middle one: the next chip's Odebrat.
  await rowButton(page, 'remove', 'Petr Svoboda').click();
  await expect(rowButton(page, 'remove', 'Karel Dvořák')).toBeFocused();
  await expect(said(page, chips.removed('Petr Svoboda', 2))).toHaveCount(1);

  // The last of several has no next chip: the box takes focus, and its list opens over the chips.
  await rowButton(page, 'remove', 'Karel Dvořák').click();
  await expect(chipBox(page)).toBeFocused();
  await expect(said(page, chips.removed('Karel Dvořák', 1))).toHaveCount(1);
  await expect(chipRows(page)).toHaveCount(1);
  await closeList(page);

  // The only one: the box again, and no empty list left behind.
  await rowButton(page, 'remove', 'Jana Nováková').click();
  await expect(chipBox(page)).toBeFocused();
  await expect(said(page, chips.removed('Jana Nováková', 0))).toHaveCount(1);
  await closeList(page);
  await expect(chipList(page)).toHaveCount(0);
});

test('moving a chip says its new place and keeps focus on the button that moved', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  await rowButton(page, 'edit', 'Petr Svoboda').click();
  const editor = openEditor(page);
  const names = chipList(page).locator('> li > div:first-child > span:first-child');
  const down = editor.getByRole('button', { name: chips.editor.down });
  const up = editor.getByRole('button', { name: chips.editor.up });

  await down.click();
  await expect(said(page, chips.moved('Petr Svoboda', 3, 3))).toHaveCount(1);
  await expect(names).toHaveText(['Jana Nováková', 'Mgr. Karel Dvořák', 'Petr Svoboda']);
  await expect(down).toBeFocused();

  await up.click();
  await expect(said(page, chips.moved('Petr Svoboda', 2, 3))).toHaveCount(1);
  await expect(names).toHaveText(['Jana Nováková', 'Petr Svoboda', 'Mgr. Karel Dvořák']);
  await expect(up).toBeFocused();

  // At an end nothing moves, but the place is said again, with a message that was not there before.
  await rowButton(page, 'edit', 'Karel Dvořák').click();
  await editor.getByRole('button', { name: chips.editor.down }).click();
  await expect(said(page, chips.moved('Karel Dvořák', 3, 3))).toHaveCount(1);
  await expect(names).toHaveText(['Jana Nováková', 'Petr Svoboda', 'Mgr. Karel Dvořák']);
  await expect(editor.getByRole('button', { name: chips.editor.down })).toBeFocused();

  await rowButton(page, 'edit', 'Jana Nováková').click();
  await editor.getByRole('button', { name: chips.editor.up }).click();
  await expect(said(page, chips.moved('Jana Nováková', 1, 3))).toHaveCount(1);
  await expect(names).toHaveText(['Jana Nováková', 'Petr Svoboda', 'Mgr. Karel Dvořák']);
  await expect(editor.getByRole('button', { name: chips.editor.up })).toBeFocused();
});

test('an add is announced once and offers the bulk salutation, which says what it set and leaves the chips in view', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = chipBox(page);
  const bulk = page.getByRole('group', { name: chips.bulk.label });
  await expect(bulk).toHaveCount(0); // people that were already there are not offered it

  await box.pressSequentially('Zuzana Kubíčková');
  await page.keyboard.press('Enter');
  await expect(said(page, search.added('Zuzana Kubíčková', 4))).toHaveCount(1);
  await expect(box).toBeFocused();
  await expect(chipRows(page)).toHaveCount(4);
  // Focus in the box reopens the recents list, which hides the chips and the bulk row from
  // assistive technology; close it before looking for them by role.
  await closeList(page);
  await expect(chipRow(page, 'Zuzana Kubíčková')).toContainText(chips.flag.salutation);

  // The bulk setter fills the empty salutations only: Jana stays paní. Focus goes to the first
  // chip it set, not to the box, whose list would open over them.
  await expect(bulk).toBeVisible();
  await bulk.getByRole('button', { name: 'slečna' }).click();
  await expect(said(page, chips.bulk.done(2))).toHaveCount(1);
  await expect(bulk).toHaveCount(0);
  await expect(rowButton(page, 'edit', 'Petr Svoboda')).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(chipList(page).getByText(chips.flag.salutation)).toHaveCount(0);
  await rowButton(page, 'edit', 'Jana Nováková').click();
  await expect(openEditor(page).getByLabel(chips.editor.salutation)).toHaveValue('pani');
  await openEditor(page).getByRole('button', { name: chips.editor.done }).click();
});

test('an add past the cap is refused with a notice, never as an add', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = chipBox(page);
  // The cap is four here: the fourth fits, the fifth is refused and stays typed.
  await box.pressSequentially('Zuzana Kubíčková');
  await page.keyboard.press('Enter');
  await expect(chipRows(page)).toHaveCount(4);
  await box.pressSequentially('Alena Malá');
  await page.keyboard.press('Enter');
  await expect(said(page, chips.full(4))).toHaveCount(1);
  await expect(page.getByText('Přidáno: Alena Malá')).toHaveCount(0);
  await expect(chipRow(page, 'Alena Malá')).toHaveCount(0);
  await expect(chipRows(page)).toHaveCount(4);
  await expect(box).toHaveValue('Alena Malá');
  await expect(box).toBeFocused();
});

const { paste } = cs.people;

/** „Vložit seznam“ of the demo `n` (0 live, 1 directory off, 2 with people in it). */
const pasteOf = (page: Page, n: number) => page.locator('details').nth(n);
const previewRows = (details: Locator) => details.getByRole('table').locator('tbody > tr');
/** Opens the paste, types the sample, and reads it. */
async function checkSample(details: Locator) {
  await details.locator('summary').click();
  await details.getByLabel(paste.label, { exact: true }).fill(people.paste.sample.join('\n'));
  await details.getByRole('button', { name: paste.check, exact: true }).click();
  await expect(details.getByRole('table', { name: paste.caption })).toBeVisible();
}

test('a pasted list is read into a preview: doubts start unchecked, a bad line is listed', async ({
  page,
  hydrated,
  expectAccessible,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const details = pasteOf(page, 0);
  // The demo shows the sample it is tested with, so a visitor can try the same.
  await expect(page.getByText(people.paste.hint)).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: people.paste.sample[0] })).toContainText(
    people.paste.sample.join('\n'),
  );
  await checkSample(details);

  await expect(previewRows(details)).toHaveCount(4);
  // Read once, said once: the counts of the people and of the lines that are none.
  await expect(said(page, paste.read(4, 1))).toHaveCount(1);
  const doubtful = previewRows(details).filter({ hasText: 'Zdislav Hruška' });
  await expect(doubtful.getByRole('checkbox')).not.toBeChecked();
  await expect(doubtful).toContainText(paste.doubt);
  const certain = previewRows(details).filter({ hasText: 'Lenka Marešová (3.B)' });
  await expect(certain.getByRole('checkbox')).toBeChecked();
  await expect(certain).not.toContainText(paste.doubt);
  // A recent person settles the order: „Hlaváček Radslav“ is read the other way and starts checked.
  const known = previewRows(details).filter({ hasText: 'Radslav Hlaváček' });
  await expect(known.getByRole('checkbox')).toBeChecked();
  await expect(known).not.toContainText(paste.doubt);
  await expect(details.getByRole('button', { name: paste.add(3), exact: true })).toBeEnabled();
  await expect(details.getByRole('listitem').filter({ hasText: 'Marie' })).toContainText(
    `${paste.rejected.line(4)} ${paste.rejected.reason['no-surname']}`,
  );
  await expectAccessible();

  // The swap puts the surname first and takes the doubt away.
  await doubtful.getByRole('button', { name: paste.swap }).click();
  await expect(previewRows(details).filter({ hasText: 'Hruška Zdislav' })).not.toContainText(
    paste.doubt,
  );
  await expect(details.getByRole('button', { name: paste.add(3), exact: true })).toBeVisible();
});

test('„Přidat vybrané“ adds the checked people, focuses the first new chip and says it once', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const details = pasteOf(page, 0);
  await checkSample(details);
  const chipsOf = page.locator(`ul[aria-label="${people.added}"]`);

  // The bulk setter fills the rows still at none; one row keeps its own choice.
  await previewRows(details)
    .filter({ hasText: 'Ondřej Pech' })
    .getByRole('combobox')
    .selectOption('slecna');
  await details.getByRole('button', { name: paste.bulk.setLabel('pan'), exact: true }).click();
  await expect(
    previewRows(details).filter({ hasText: 'Ondřej Pech' }).getByRole('combobox'),
  ).toHaveValue('slecna');
  await expect(
    previewRows(details).filter({ hasText: 'Lenka Marešová' }).getByRole('combobox'),
  ).toHaveValue('pan');

  // Checking the doubtful row leaves its order a guess: that is the one that needs a look.
  await previewRows(details).filter({ hasText: 'Zdislav Hruška' }).getByRole('checkbox').check();
  await details.getByRole('button', { name: paste.add(4), exact: true }).click();

  await expect(chipsOf.locator('> li')).toHaveCount(4);
  await expect(
    chipsOf.getByRole('button', { name: chips.editLabel('Lenka Marešová'), exact: true }),
  ).toBeFocused();
  await expect(said(page, paste.added(4, 1))).toHaveCount(1);
  // A pasted class is the author's own: dated this year, so not flagged.
  await expect(chipsOf.locator('> li').first()).toContainText('(3.B)');
  await expect(chipsOf).not.toContainText(chips.flag.class);
  await expect(chipsOf).not.toContainText(chips.flag.salutation);
  // The added rows left the preview; the rejected line is still listed, and is all the text holds.
  await expect(details.getByRole('table')).toHaveCount(0);
  await expect(details.getByRole('listitem').filter({ hasText: 'Marie' })).toHaveCount(1);
  await expect(details.getByLabel(paste.label, { exact: true })).toHaveValue('Marie');
});

test('after an add the text holds only what is left, so a second check never brings the added back', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const details = pasteOf(page, 0);
  const text = details.getByLabel(paste.label, { exact: true });
  await checkSample(details);
  const chipsOf = page.locator(`ul[aria-label="${people.added}"]`);

  // Zdislav (a guess) stays unchecked, so he stays; so does the line that is no person.
  await details.getByRole('button', { name: paste.add(3), exact: true }).click();
  await expect(chipsOf.locator('> li')).toHaveCount(3);
  await expect(text).toHaveValue('Zdislav Hruška\nMarie');
  await expect(previewRows(details)).toHaveCount(1);
  await expect(details.getByText(paste.rejected.line(2))).toBeVisible();

  // Fix the bad line and read again: the two lines are there, the three added are not.
  await text.fill('Zdislav Hruška\nMarie Nováková');
  await details.getByRole('button', { name: paste.check, exact: true }).click();
  await expect(said(page, paste.read(2, 0))).toHaveCount(1);
  await expect(previewRows(details)).toHaveCount(2);
  await expect(previewRows(details).filter({ hasText: 'Lenka' })).toHaveCount(0);
  await expect(previewRows(details).filter({ hasText: 'Ondřej' })).toHaveCount(0);
  await expect(previewRows(details).filter({ hasText: 'Radslav' })).toHaveCount(0);

  // Adding the whole preview empties the text and the preview.
  await previewRows(details).filter({ hasText: 'Zdislav' }).getByRole('checkbox').check();
  await details.getByRole('button', { name: paste.add(2), exact: true }).click();
  await expect(chipsOf.locator('> li')).toHaveCount(5);
  await expect(text).toHaveValue('');
  await expect(details.getByRole('table')).toHaveCount(0);
});

test('a text with nobody in it is said, and a text past the limit is read whole entries only', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const details = pasteOf(page, 0);
  const text = details.getByLabel(paste.label, { exact: true });
  const check = details.getByRole('button', { name: paste.check, exact: true });
  await details.locator('summary').click();

  await text.fill('  \n  ');
  await check.click();
  await expect(details.getByText(paste.nothing)).toBeVisible();
  await expect(said(page, paste.nothing)).toHaveCount(1);

  // The names are far from the line start, so a cut at 4000 characters falls inside one.
  // Typed in (insertText), not filled: a fill would skip the textarea's own length limit.
  const long = Array.from({ length: 50 }, () => `${' '.repeat(73)}Jana Nováková`).join('\n');
  await text.fill('');
  await text.focus();
  await page.keyboard.insertText(long);
  await expect(text).toHaveValue(long);
  await check.click();
  await expect(details.getByText(paste.truncated)).toBeVisible();
  const rows = previewRows(details);
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) await expect(row).toContainText('Jana Nováková');
  await expect(details.getByText(paste.rejected.title)).toHaveCount(0);
  await expect(said(page, paste.truncated)).toHaveCount(1);
});

test('a paste past the cap adds what fits, keeps the rest in the preview and says so', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const details = pasteOf(page, 2);
  await checkSample(details);
  const form = chipForm(page);

  // Enter in the text, a checkbox or a select never sends the demo's form.
  await details.getByLabel(paste.label, { exact: true }).press('Enter');
  await previewRows(details).first().getByRole('checkbox').press('Enter');
  await previewRows(details).first().getByRole('combobox').press('Enter');
  await expect(details.getByLabel(paste.label, { exact: true })).toHaveValue(
    `${people.paste.sample.join('\n')}\n`,
  );
  await expect(form).not.toHaveAttribute('data-sent', 'true');

  // Three are checked (the doubtful one is not), one place is left: Lenka fits; the rest stay.
  await details.getByRole('button', { name: paste.add(3), exact: true }).click();
  await expect(chipRows(page)).toHaveCount(4);
  await expect(said(page, `${paste.added(1, 1)} ${paste.leftOut(2)}`)).toHaveCount(1);
  await expect(previewRows(details)).toHaveCount(3);
  await expect(details.getByRole('button', { name: paste.add(2), exact: true })).toBeVisible();
  await expect(chipRow(page, 'Lenka Marešová')).toHaveCount(1);
  await expect(previewRows(details).filter({ hasText: 'Lenka' })).toHaveCount(0);

  // The field is full now: nothing fits, the notice is said, and nothing is lost.
  await details.getByRole('button', { name: paste.add(2), exact: true }).click();
  await expect(said(page, chips.full(4))).toHaveCount(1);
  await expect(chipRows(page)).toHaveCount(4);
  await expect(previewRows(details)).toHaveCount(3);
  await expect(form).not.toHaveAttribute('data-sent', 'true');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('a form cannot send: its submit is disabled and Enter sends nothing', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') posts.push(request.url());
    });
    await page.goto('/vzornik');
    const form = page.locator('form#demo-plain');
    await expect(form.getByRole('button', { name: cs.gallery.forms.submit })).toBeDisabled();
    const url = page.url();
    await form.locator('input[name="name"]').press('Enter');
    await page.waitForTimeout(300);
    expect(posts).toEqual([]);
    expect(page.url()).toBe(url);
  });
});
