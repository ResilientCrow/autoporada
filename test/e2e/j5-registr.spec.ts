/**
 * J5: the headmaster keeps the registry of students and the settings. A list of the test's own is
 * made, filled by hand and by the paste of the document's wording, and emptied by „Nový školní
 * rok“ with only that list ticked; the settings page shows the deadline's effect and the rich-text
 * annex 1 intro. The deadline rule is global and is only read, never saved. The annex 1 text is
 * global too: one project saves it (and puts the old row back), the other types and leaves.
 *
 * The students are made up. A list is deleted with its students afterwards.
 */
import { registry, settings } from '@/ui/copy';

import { personaOf, withClient } from './db';
import { editorIn, mounted } from './editor-keys';
import { expect, test } from './fixtures';

const headmaster = (project: string) =>
  new RegExp(`^Test – ${personaOf('rizeni', project).subject}`);

const SETTINGS_KEY = 'texts.annex1';
const PASTE = 'Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B)';

async function forgetList(title: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      'DELETE FROM registry_entries WHERE list_id IN (SELECT id FROM registry_lists WHERE title = $1)',
      [title],
    );
    await client.query('DELETE FROM registry_lists WHERE title = $1', [title]);
  });
}

test.describe('J5: the registry', () => {
  test.afterEach(async ({}, testInfo) => {
    await forgetList(`Seznam J5 ${testInfo.project.name}`);
  });

  test('lists, entries, the paste and a new school year', async ({
    page,
    hydrated,
    settled,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const title = `Seznam J5 ${project}`;
    await signInAs(headmaster(project));

    await test.step('the lists with their counts, and a new list', async () => {
      await page.goto('/registr');
      await hydrated();
      await expect(page.getByRole('heading', { level: 1, name: registry.title })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Talentovaní studenti' })).toBeVisible();
      await expect(page.getByText(/, z\u00a0toho /).first()).toBeVisible();

      await page
        .locator('#novy-seznam')
        .getByLabel(registry.lists.fields.title.label, { exact: true })
        .fill(title);
      await page
        .locator('#novy-seznam')
        .getByLabel(registry.lists.fields.docLabel.label)
        .fill(`${title} v dokumentu`);
      await page.getByRole('button', { name: registry.lists.create.save }).click();
      await expect(page.getByText(registry.said.created)).toBeVisible();
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expectAccessible();
    });

    await test.step('an empty list takes a student by hand, marks it new and lets it go', async () => {
      await page
        .getByRole('heading', { name: title })
        .locator('xpath=ancestor::*[.//a[normalize-space()="' + registry.lists.open + '"]][1]')
        .getByRole('link', { name: registry.lists.open })
        .click();
      await hydrated();
      await expect(page.getByText(registry.entries.empty)).toBeVisible();

      const add = page.locator('#pridat-studenta, form').filter({
        has: page.getByRole('button', { name: registry.entries.add.save }),
      });
      await add.getByLabel(registry.entries.fields.givenName.label).fill('Karel');
      await add.getByLabel(registry.entries.fields.familyName.label).fill('Testovací');
      await add.getByLabel(registry.entries.fields.classCode.label).fill('3.C');
      await page.getByRole('button', { name: registry.entries.add.save }).click();
      await expect(page.getByText(registry.said.added)).toBeVisible();
      const row = page.getByRole('listitem').filter({ hasText: 'Testovací' });
      await expect(row).toContainText(registry.new);
      await expectAccessible();

      await row.getByRole('button', { name: new RegExp(`^${registry.entries.remove}`) }).click();
      await expect(page.getByText(registry.said.removed)).toBeVisible();
      await expect(page.getByText(registry.entries.empty)).toBeVisible();
    });

    await test.step('the paste of the document wording is checked first, then added', async () => {
      await page.getByRole('link', { name: registry.entries.paste }).click();
      await hydrated();
      await page.getByLabel(registry.paste.text.label).fill(PASTE);
      await page.getByRole('button', { name: registry.paste.check }).click();
      const table = page.getByRole('table', { name: registry.paste.preview.caption });
      await expect(table).toBeVisible();
      const rows = table.locator('tbody tr');
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(0)).toContainText('1.A');
      await expect(rows.nth(1)).toContainText('2.B');
      await expect(rows.nth(2)).toContainText('2.B');
      await expectAccessible();

      await page.getByRole('button', { name: registry.paste.preview.add(3) }).click();
      await expect(page.getByText(registry.paste.added(3))).toBeVisible();
      await page.getByRole('link', { name: registry.paste.back }).click();
      await hydrated();
      await expect(page.getByRole('listitem').filter({ hasText: 'Nováková' })).toHaveCount(3);
    });

    await test.step('a new school year empties only the ticked list', async () => {
      await page.goto('/registr/novy-skolni-rok');
      await hydrated();
      const others = page.getByRole('group', { name: registry.newYear.lists.label });
      for (const box of await others.getByRole('checkbox').all()) {
        const label =
          (await box.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent)) ?? '';
        if (!label.startsWith(title)) await box.uncheck();
      }
      await expect(page.getByText(registry.newYear.count(3))).toBeVisible();
      await expectAccessible();

      // Unconfirmed, nothing happens.
      await page.getByRole('button', { name: registry.newYear.submit }).click();
      await settled();
      await expect(page.getByText(registry.newYear.issues.confirmed).first()).toBeVisible();

      await page.getByLabel(registry.newYear.confirm).check();
      await page.getByRole('button', { name: registry.newYear.submit }).click();
      await expect(page.getByText(registry.newYear.done(0, 3))).toBeVisible();
      // The form starts afresh with every list ticked; the emptied one now says it holds no student.
      await expect(page.getByLabel(registry.newYear.list(title, 0))).toBeVisible();
    });
  });
});

/** The stored annex 1 text, so that a test which saves can put it back. */
async function annexRow(): Promise<{ value: unknown } | null> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ value: unknown }>(
      'SELECT value FROM settings WHERE key = $1',
      [SETTINGS_KEY],
    );
    return rows[0] ?? null;
  });
}

async function putAnnexBack(before: { value: unknown } | null): Promise<void> {
  await withClient(async (client) => {
    if (before === null) {
      await client.query('DELETE FROM settings WHERE key = $1', [SETTINGS_KEY]);
    } else {
      await client.query(
        'UPDATE settings SET value = $2::jsonb, version = version + 1 WHERE key = $1',
        [SETTINGS_KEY, JSON.stringify(before.value)],
      );
    }
  });
}

test.describe('J5: the settings', () => {
  test('the deadline effect line and the rich-text annex 1 intro', async ({
    page,
    hydrated,
    settled,
    signInAs,
    expectAccessible,
  }, testInfo) => {
    const project = testInfo.project.name;
    const before = project === 'desktop' ? await annexRow() : null;
    try {
      await signInAs(headmaster(project));
      await page.goto('/nastaveni');
      await hydrated();
      await expect(page.getByRole('heading', { level: 1, name: settings.title })).toBeVisible();

      // The rule in force: Saturday 20.00 before a Monday porada. Its effect is said only once the
      // choice differs from it.
      const effect = page.getByText(
        /^Uzávěrka porady .* zůstává sobota 20\.00\. Nové pravidlo platí od porady /,
      );
      await expect(page.getByText(settings.deadline.example('sobota', '20:00'))).toBeVisible();
      await expect(effect).toHaveCount(0);

      // Choosing another rule changes the example and shows the effect at once; nothing is saved.
      await page.getByLabel(settings.deadline.days.label).selectOption('1');
      await expect(page.getByText(settings.deadline.example('sobota', '20:00'))).toHaveCount(0);
      await expect(effect).toBeVisible();
      await page.reload();
      await hydrated();
      await expect(page.getByText(settings.deadline.example('sobota', '20:00'))).toBeVisible();
      await expect(effect).toHaveCount(0);

      // The annex 1 intro is a rich text: the server draws it, then the editor mounts on it.
      const editor = editorIn(page, new RegExp(`^${settings.annex1.intro.label}`));
      await mounted(editor);
      await expectAccessible();
      const text = `Úvod přílohy J5 ${project}`;
      await editor.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.press('Enter');
      await page.keyboard.type(text);
      await expect(editor).toContainText(text);

      if (project === 'desktop') {
        await page.locator('#priloha-1').getByRole('button', { name: settings.save }).click();
        await expect(page.getByText(settings.said.changed)).toBeVisible();
        await page.reload();
        await hydrated();
        await expect(page.getByText(text)).toHaveCount(1);
        await settled();
      } else {
        // The mobile project only types: a reload forgets what was typed.
        await page.reload();
        await hydrated();
        await expect(page.getByText(text)).toHaveCount(0);
      }
    } finally {
      if (project === 'desktop') await putAnnexBack(before);
    }
  });
});
