/**
 * A download that gives no file lands on the Arch archive with its notice (ADR 0044) and the notice
 * takes `chyba` off the address. The link must be a plain navigation: with a `download` attribute
 * the browser would save the page it is redirected to as a file and show nothing. Read-only apart
 * from its own document, so it runs in both projects, on a Monday of its own.
 */
import { downloadFailed } from '@/ui/copy/download';

import { personaOf } from './db';
import { expect, test } from './fixtures';
import { forgetDocument, mondayIn, seedDocument } from './porada-db';

const WEEK = { desktop: 40, mobile: 41 } as const;

test('a download that finds no document shows its notice on the archive', async ({
  page,
  signInAs,
}, testInfo) => {
  const project = testInfo.project.name;
  const monday = mondayIn(WEEK[project as 'desktop' | 'mobile']);
  // A reviewer may read the archive.
  await signInAs(new RegExp(`^Test – ${personaOf('revizor', project).subject}`));
  await seedDocument(monday);
  try {
    await page.goto('/#/archiv');
    const link = page.locator(`a[href="/porada/${monday}/dokument/docx"]`);
    await expect(link).toBeVisible();
    // The document goes away between the page and the click, as it would for a stale tab.
    await forgetDocument(monday);
    await link.click();
    await expect(page.getByText(downloadFailed['not-found'])).toBeVisible();
    // Said once: the address no longer carries the reason, so a reload stays quiet.
    await expect(page).toHaveURL(/:\d+\/#\/archiv$/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Archiv porad' })).toBeVisible();
    await expect(page.getByText(downloadFailed['not-found'])).toHaveCount(0);
  } finally {
    await forgetDocument(monday);
  }
});
