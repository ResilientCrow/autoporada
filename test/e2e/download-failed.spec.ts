/**
 * A download that gives no file lands on the archive with its notice (ADR 0044). The link must be a
 * plain navigation: with a `download` attribute the browser would save the archive page it is
 * redirected to as a file and show nothing. Read-only apart from its own document, so it runs in
 * both projects, on a Monday of its own.
 */
import { porada } from '@/ui/copy';

import { personaOf } from './db';
import { expect, test } from './fixtures';
import { forgetDocument, mondayIn, seedDocument } from './porada-db';

const WEEK = { desktop: 40, mobile: 41 } as const;

test('a download that finds no document shows its notice on the archive', async ({
  page,
  hydrated,
  signInAs,
}, testInfo) => {
  const project = testInfo.project.name;
  const monday = mondayIn(WEEK[project as 'desktop' | 'mobile']);
  // A reviewer may read the archive; `/porada/<datum>` would send them on to the preview.
  await signInAs(new RegExp(`^Test – ${personaOf('revizor', project).subject}`));
  await seedDocument(monday);
  try {
    await page.goto('/porada/archiv');
    await hydrated();
    const link = page.locator(`a[href="/porada/${monday}/dokument/docx"]`);
    await expect(link).toBeVisible();
    // The document goes away between the page and the click, as it would for a stale tab.
    await forgetDocument(monday);
    await link.click();
    await expect(page).toHaveURL('/porada/archiv?chyba=not-found');
    await expect(page.getByText(porada.download['not-found'])).toBeVisible();
  } finally {
    await forgetDocument(monday);
  }
});
