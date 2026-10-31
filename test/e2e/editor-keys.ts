/**
 * What SP-T (design §18) does to a rich-text editor, and what it must find afterwards. The page it
 * runs on is given: the item editor, annex 2 and the settings texts all share the field.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { expect } from './fixtures';

export const WORD_PASTE = readFileSync(
  fileURLToPath(new URL('./fixtures/word-paste.html', import.meta.url)),
  'utf8',
);

/** The field's editor once its chunk has mounted: ProseMirror's own contenteditable. */
export const editorIn = (page: Page, name: RegExp): Locator => page.getByRole('textbox', { name });

/** Waits until the static markup has been replaced by the live editor. */
export async function mounted(editor: Locator): Promise<void> {
  await expect(editor).toHaveClass(/ProseMirror/);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
}

/** Dispatches a paste of this HTML on the editor, as the browser does for Ctrl+V. */
export async function pasteHtml(editor: Locator, html: string): Promise<void> {
  await editor.evaluate((el, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'plain');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, html);
}

/** The editor's paragraphs as `[indent, text]`. */
export async function paragraphsOf(editor: Locator): Promise<[string, string][]> {
  return editor
    .locator('p')
    .evaluateAll((ps) =>
      ps.map((p): [string, string] => [p.getAttribute('data-indent') ?? '0', p.textContent ?? '']),
    );
}

/** Elements with a `style` attribute inside this subtree, and `<style>` elements without the page's nonce. */
export async function styleLeaks(page: Page, root: Locator): Promise<string[]> {
  const inside = await root.evaluate((el) =>
    [el, ...el.querySelectorAll('*')].filter((e) => e.hasAttribute('style')).map((e) => e.tagName),
  );
  const loose = await page.evaluate(() =>
    [...document.querySelectorAll('style')].filter((s) => s.nonce === '').map(() => 'style'),
  );
  return [...inside, ...loose];
}

/** Errors the page throws or logs that point at a broken mount or hydration. */
export function watchMountErrors(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('pageerror', (error) => seen.push(`${error.name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    if (/hydrat|NotFoundError|Minified React error|did not match/i.test(text)) seen.push(text);
  });
  return () => seen;
}
