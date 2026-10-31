/**
 * M10: the headmaster generates a porada from its preview, downloads the DOCX at once and the PDF
 * once the worker has converted it, and finds both in the archive. Generating publishes every
 * approved point it prints, so this file runs in a project of its own after the others (see
 * playwright.config.ts) and leaves its rows: each run has a database of its own.
 */
import { readFile } from 'node:fs/promises';

import type { Download, Page } from '@playwright/test';

import { porada } from '@/ui/copy';

import { personaOf } from './db';
import { expect, test } from './fixtures';
import { mondayIn } from './porada-db';

const DAY = mondayIn(14);
const PDF_WITHIN_MS = 30_000;

const bytesOf = async (download: Download) => readFile(await download.path());

/** Clicks a download link and returns the file the browser saved. */
async function download(page: Page, name: string): Promise<Download> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name }).first().click(),
  ]);
  return file;
}

test('the headmaster generates the porada and downloads its DOCX and PDF', async ({
  page,
  hydrated,
  settled,
  signInAs,
  expectAccessible,
}) => {
  await signInAs(new RegExp(`^Test – ${personaOf('rizeni', 'desktop').subject}`));
  await page.goto(`/porada/${DAY}/nahled`);
  await hydrated();
  await expect(page.getByRole('heading', { name: porada.generate.title })).toBeVisible();

  await page.getByRole('checkbox', { name: porada.generate.confirm }).check();
  await page.getByRole('button', { name: porada.generate.submit }).click();
  await settled();
  await expect(
    page.getByRole('heading', { name: porada.document.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: porada.generate.submit })).toHaveCount(0);
  await expectAccessible();

  const docx = await download(page, porada.document.docx);
  expect(docx.suggestedFilename()).toMatch(/^porada-\d{4}-\d{2}-\d{2}\.docx$/);
  expect((await bytesOf(docx)).subarray(0, 2).toString('latin1')).toBe('PK');

  // The worker converts the DOCX in the background: the page says so until it is done.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('link', { name: porada.document.pdf })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: PDF_WITHIN_MS });
  const pdf = await download(page, porada.document.pdf);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await bytesOf(pdf)).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  await page.goto('/porada/archiv');
  await expect(page.getByRole('heading', { name: porada.archive.title })).toBeVisible();
  await expect(page.getByRole('link', { name: porada.document.pdf })).toHaveCount(1);
  await expectAccessible();
});
