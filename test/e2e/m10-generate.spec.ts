/**
 * M10 on the Arch UI: the headmaster generates a porada from its preview, downloads the DOCX at
 * once and the PDF once the worker has converted it, and finds both in the archive. A porada waits
 * until every earlier one is generated or dropped (ADR 0040, 0054). Arch previews only the working
 * porada (the first open one whose meeting is today or later), so the test sets this week's meeting
 * date itself: first a day ago, when next week's porada is the working one and is held, then today.
 * Generating publishes every approved point it prints, so this file runs in a project of its own
 * after the others (see playwright.config.ts) and leaves its rows: each run has a database of its own.
 */
import { readFile } from 'node:fs/promises';

import type { Download, Page } from '@playwright/test';

import { personaOf } from './db';
import { expect, test } from './fixtures';
import { addDaysIso, hasDocument, mondayIn, pragueToday, setMeetingDate } from './porada-db';

const DAY = mondayIn(0);
const PDF_WITHIN_MS = 30_000;

const bytesOf = async (download: Download) => readFile(await download.path());

/** Clicks a download link and returns the file the browser saved. */
async function download(page: Page, name: string): Promise<Download> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name, exact: true }).click(),
  ]);
  return file;
}

test('the headmaster generates the porada and downloads its DOCX and PDF', async ({
  page,
  signInAs,
}) => {
  await signInAs(new RegExp(`^Test – ${personaOf('rizeni', 'desktop').subject}`));
  await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();

  // This week's meeting is past, so next week's porada is the one Arch previews, and it is held.
  await setMeetingDate(DAY, addDaysIso(pragueToday(), -1));
  await page.goto('/#/porada/nahled');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Náhled porady' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Nejdřív je potřeba uzavřít poradu/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vygenerovat a zveřejnit' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // This week's meeting is today: its porada comes first and nothing holds it.
  await setMeetingDate(DAY, pragueToday());
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Náhled porady' })).toBeVisible();
  await expect(page.getByText(/^Nejdřív je potřeba uzavřít poradu/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Vygenerovat a zveřejnit' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Reports nobody handed in may wait for a check first; the headmaster goes on regardless.
  const anyway = dialog.getByRole('button', { name: 'Vygenerovat i tak' });
  if ((await anyway.count()) > 0) await anyway.click();
  await expect(dialog.getByRole('heading', { name: 'Vygenerovat dokument?' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: /^Rozumím, poradu pak nelze změnit/ }).check();
  await dialog.getByRole('button', { name: 'Vygenerovat a zveřejnit' }).click();

  await expect(page).toHaveURL(new RegExp(`#/hotovo/${DAY}$`));
  await expect(page.getByRole('heading', { level: 1, name: /^Hotovo\./ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vygenerovat a zveřejnit' })).toHaveCount(0);
  // Arch shows the result at once; the link answers once the server has stored the document.
  await expect.poll(() => hasDocument(DAY)).toBe(true);

  const docx = await download(page, 'Stáhnout DOCX');
  expect(docx.suggestedFilename()).toMatch(/^porada-\d{4}-\d{2}-\d{2}\.docx$/);
  expect((await bytesOf(docx)).subarray(0, 2).toString('latin1')).toBe('PK');

  // The worker converts the DOCX in the background: the page says so until it is done.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('link', { name: 'Stáhnout PDF' })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: PDF_WITHIN_MS });
  const pdf = await download(page, 'Stáhnout PDF');
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await bytesOf(pdf)).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // Next week's porada is no longer held by this one.
  await page.goto('/#/porada/nahled');
  await expect(page.getByRole('heading', { level: 1, name: 'Náhled porady' })).toBeVisible();
  await expect(page.getByText(/^Nejdřív je potřeba uzavřít poradu/)).toHaveCount(0);

  await page.goto('/#/archiv');
  await expect(page.getByRole('heading', { level: 1, name: 'Archiv porad' })).toBeVisible();
  const book = page.locator('.bk').filter({ has: page.locator(`a[href="#/archiv/${DAY}"]`) });
  await expect(book.locator(`a[href="/porada/${DAY}/dokument/docx"]`)).toHaveCount(1);
  await expect(book.getByRole('link', { name: 'PDF', exact: true })).toHaveCount(1);
});
