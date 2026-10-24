/** „Žádost o přístup“ without JavaScript: the form says it cannot send, and does not. */
import { access, cs } from '@/ui/copy';

import { expect, test } from './fixtures';

test('without JavaScript the request form is disabled, explained and sends nothing', async ({
  newContext,
  page,
  context,
  signInAs,
}) => {
  // Signing in needs scripts (the mock IdP adds auth_time), so the session is carried over.
  await signInAs(/^Učitelka/);
  await expect(page).toHaveURL(/:\d+\/$/);
  const storageState = await context.storageState();

  const plain = await newContext({ javaScriptEnabled: false, storageState });
  const bare = await plain.newPage();
  const sent: string[] = [];
  bare.on('request', (request) => {
    if (request.method() !== 'GET') sent.push(request.url());
  });
  await bare.goto('/pristup');
  await expect(bare.getByRole('heading', { level: 2 })).toHaveText(access.open.title);
  const button = bare.getByRole('button', { name: access.open.send });
  await expect(button).toBeDisabled();
  // Playwright's text queries skip <noscript>, so read its content directly.
  expect(await bare.getByRole('main').locator('noscript').textContent()).toContain(
    cs.form.noscript,
  );

  // A disabled button takes no click; force it to prove that nothing is sent either way.
  await button.click({ force: true, timeout: 2000 }).catch(() => undefined);
  await bare.waitForTimeout(300);
  expect(sent).toEqual([]);
});
