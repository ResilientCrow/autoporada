/**
 * Branch arch-ui: the Arch UI at `/` on the real backend. An author signs in, writes a new akce
 * through its wizard and sends it; the headmaster approves it on „Ke kontrole“; the database holds
 * each step, and the author sees it approved. The CSP guard of the fixtures watches every page.
 * What it must keep from the classic app too: a teacher's state names only who their own view
 * mentions, a write is validated at the endpoint, and „Odhlásit všude“ means it.
 */
import type { Page } from '@playwright/test';

import { cs } from '@/ui/copy';

import { emailOf, isoInDays, signInAsRe } from './akce-steps';
import { expect, showAllPersonas, signInElsewhere, test } from './fixtures';
import { forgetFutureOf, readFuture } from './future-db';
import { withClient } from './db';

const headmaster = (project: string) => signInAsRe('rizeni', project);

/** The id and state of the author's akce of this title, once the client has written it. */
async function futureOf(
  email: string,
  title: string,
): Promise<{ id: string; state: string } | null> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string; state: string }>(
      `SELECT f.id, f.state FROM future_items f JOIN users u ON u.id = f.author_id
        WHERE u.email = $1 AND f.title = $2`,
      [email, title],
    );
    return rows[0] ?? null;
  });
}

interface ArchState {
  readonly userId: string;
  readonly users: readonly {
    id: string;
    email: string;
    role: string;
    status: string;
    isStudent: boolean;
  }[];
  readonly futures: readonly { id: string; trail: readonly { who: string; what: string }[] }[];
  readonly issues: readonly { monday: string; status: string }[];
}

const stateOf = (page: Page) =>
  page.evaluate(
    async () => (await (await fetch('/api/arch/state', { cache: 'no-store' })).json()) as ArchState,
  );

const run = (page: Page, name: string, input: unknown) =>
  page.evaluate(
    async ([n, i]) => {
      const r = await fetch('/api/arch/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: n, input: i }),
      });
      return {
        status: r.status,
        body: (await r.json()) as { ok: boolean; error?: { code: string } },
      };
    },
    [name, input] as const,
  );

async function sendAkce(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Nová akce' }).click();
  await page.getByRole('textbox', { name: 'Název' }).fill(title);
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByLabel('Den', { exact: true }).fill(isoInDays(11));
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('button', { name: 'Pokračovat' }).click();
  }
  await page.getByRole('button', { name: 'Odeslat vedení' }).click();
  await expect(page.getByRole('heading', { name: 'Hotovo, je to u vedení' })).toBeVisible();
}

const idOfTitle = (email: string, title: string) =>
  withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT f.id FROM future_items f JOIN users u ON u.id = f.author_id
        WHERE u.email = $1 AND f.title = $2 AND f.state = 'submitted'`,
      [email, title],
    );
    return rows[0]?.id ?? null;
  });

test.describe('the Arch UI', () => {
  // One author per project, whose akce are cleared around each test: the tests take turns.
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(({}, testInfo) => forgetFutureOf(emailOf('archa', testInfo.project.name)));
  test.afterEach(({}, testInfo) => forgetFutureOf(emailOf('archa', testInfo.project.name)));

  test('an author sends a new akce through the wizard, and the headmaster approves it', async ({
    page,
    signInAs,
    newContext,
  }, testInfo) => {
    const project = testInfo.project.name;
    const email = emailOf('archa', project);
    const title = `Exkurze Arch ${project}`;

    await signInAs(signInAsRe('archa', project));
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();

    await page.getByRole('button', { name: 'Nová akce' }).click();
    await expect(page.getByRole('heading', { name: 'Jak se akce jmenuje?' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Název' }).fill(title);
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    await expect(page.getByRole('heading', { name: 'Kdy to bude?' })).toBeVisible();
    await page.getByLabel('Den', { exact: true }).fill(isoInDays(10));
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('heading', { name: 'Kde to bude?' })).toBeVisible();
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('heading', { name: 'Kdo to má na starosti?' })).toBeVisible();
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(
      page.getByRole('heading', { name: 'Takhle to vyjde. Můžeme to poslat?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Odeslat vedení' }).click();
    await expect(page.getByRole('heading', { name: 'Hotovo, je to u vedení' })).toBeVisible();

    // The draft and the submit reached the server, not only the page's store.
    await expect.poll(async () => (await futureOf(email, title))?.state).toBe('submitted');
    const id = (await futureOf(email, title))!.id;

    const head = await signInElsewhere(newContext, headmaster(project));
    await head.goto(`/#/kontrola/${id}`);
    await expect(head.getByText(title).first()).toBeVisible();
    await head.getByRole('button', { name: 'Schválit', exact: true }).click();
    await expect.poll(async () => (await readFuture(id)).state).toBe('approved');

    // A fresh load reads the state back from the server.
    await page.goto(`/#/akce/${id}`);
    await page.reload();
    await expect(page.getByText('Schváleno').first()).toBeVisible();
  });

  test('a signed-in teacher reaching an unknown address is told so', async ({
    page,
    signInAs,
  }, testInfo) => {
    await signInAs(signInAsRe('archa', testInfo.project.name));
    await page.goto('/#/tato-adresa-neexistuje');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toHaveCount(0);
  });

  test('a teacher sees no directory and an author no name of the vedení', async ({
    page,
    signInAs,
    newContext,
  }, testInfo) => {
    const project = testInfo.project.name;
    const title = `Audit Arch ${project}`;
    await signInAs(signInAsRe('archa', project));
    await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();
    await sendAkce(page, title);
    await expect.poll(() => idOfTitle(emailOf('archa', project), title)).not.toBeNull();
    const id = (await idOfTitle(emailOf('archa', project), title))!;

    const head = await signInElsewhere(newContext, signInAsRe('rizeni', project));
    await head.goto(`/#/kontrola/${id}`);
    await head.getByRole('button', { name: /^Vrátit s poznámkou/ }).click();
    await head.getByRole('textbox').last().fill('Doplňte prosím místo.');
    await head.getByRole('button', { name: 'Vrátit autorovi', exact: true }).click();
    await expect.poll(async () => (await readFuture(id)).state).toBe('returned');

    const state = await stateOf(page);
    const me = state.users.find((u) => u.id === state.userId)!;
    expect(me.email).toBe(emailOf('archa', project));
    for (const other of state.users.filter((u) => u.id !== state.userId)) {
      expect(other).toMatchObject({
        email: '',
        role: 'submitter',
        status: 'active',
        isStudent: false,
      });
    }
    expect(state.users.length).toBeLessThan(10);
    const trail = state.futures.find((f) => f.id === id)!.trail;
    expect(trail.map((t) => t.who)).toContain('vedeni');
    const reviewerIds = new Set(state.users.map((u) => u.id));
    for (const { who } of trail) expect([...reviewerIds, 'system']).toContain(who);
  });

  test('the annexes endpoint takes only what the snapshot can print', async ({
    page,
    signInAs,
    newContext,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'shared settings and issues');
    const project = testInfo.project.name;
    await signInAs(signInAsRe('archa', project));
    await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();
    expect((await run(page, 'arch.annexes', { monday: '2026-11-16', annexes: [] })).status).toBe(
      403,
    );

    const head = await signInElsewhere(newContext, signInAsRe('rizeni', project));
    await head.goto('/#/porada');
    await expect(head.getByRole('heading', { level: 1 })).toBeVisible();
    const open = (await stateOf(head)).issues.find((i) => i.status === 'open')!;
    const generated = (await stateOf(head)).issues.find((i) => i.status === 'generated');
    const good = [
      { id: 'a1', title: 'Příloha', parts: [{ id: 'p1', kind: 'table', rows: [['a', 'b']] }] },
    ];
    expect((await run(head, 'arch.annexes', { monday: open.monday, annexes: good })).status).toBe(
      200,
    );
    const bad = (part: unknown) => [{ id: 'a', title: 'X', parts: [part] }];
    for (const annexes of [
      [null],
      bad({ id: 'p', kind: 'image', src: 'https://evil.example/x.png', w: 10, h: 10, alt: '' }),
      bad({ id: 'p', kind: 'image', src: 'data:image/png;base64,AAAA', w: 99999, h: 10, alt: '' }),
      bad({ id: 'p', kind: 'nothing' }),
    ]) {
      const refused = await run(head, 'arch.annexes', { monday: open.monday, annexes });
      expect(refused.status).toBe(400);
    }
    expect((await run(head, 'arch.annexes', { monday: '2026-13-45', annexes: [] })).status).toBe(
      400,
    );
    if (generated) {
      const late = await run(head, 'arch.annexes', { monday: generated.monday, annexes: [] });
      expect(late.status).toBe(409);
    }
    expect((await run(head, 'arch.annexes', { monday: open.monday, annexes: [] })).status).toBe(
      200,
    );
  });

  test('another origin cannot run anything', async ({ request }) => {
    const response = await request.post('/api/arch/run', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: { name: 'points.create', input: {} },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });

  test('the deadline saves a morning hour', async ({ page, signInAs }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'shared settings and issues');
    await signInAs(signInAsRe('rizeni', testInfo.project.name));
    await page.goto('/#/nastaveni');
    const hour = page.getByLabel('V kolik hodin');
    const before = await hour.inputValue();
    await hour.selectOption('08:00');
    await page.getByRole('button', { name: 'Uložit', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('V kolik hodin')).toHaveValue('08:00');
    await page.getByLabel('V kolik hodin').selectOption(before);
    await page.getByRole('button', { name: 'Uložit', exact: true }).click();
    await page.reload();
    await expect(page.getByLabel('V kolik hodin')).toHaveValue(before);
  });

  test('a mail link survives the sign-in', async ({ page }, testInfo) => {
    await page.goto('/#/kontrola');
    await page.getByRole('link', { name: /školním účtem/ }).click();
    await showAllPersonas(page);
    await page.getByRole('button', { name: signInAsRe('rizeni', testInfo.project.name) }).click();
    await expect(page).toHaveURL(/#\/kontrola$/);
  });

  test('„Odhlásit všude“ ends the other sessions too', async ({
    page,
    signInAs,
    newContext,
  }, testInfo) => {
    const project = testInfo.project.name;
    await signInAs(signInAsRe('archa', project));
    await expect(page.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();
    const other = await signInElsewhere(newContext, signInAsRe('archa', project));
    await other.goto('/');
    await expect(other.getByRole('heading', { level: 1, name: 'Dobrý den.' })).toBeVisible();

    await page.goto('/#/ucet');
    await page.getByRole('button', { name: 'Odhlásit všude' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Odhlásit všude' }).click();
    await expect(page.getByRole('link', { name: /školním účtem/ })).toBeVisible();

    await other.reload();
    await expect(other.getByRole('link', { name: /školním účtem/ })).toBeVisible();
  });

  test('after a sign-out the next person chooses the account', async ({
    page,
    signInAs,
  }, testInfo) => {
    await signInAs(signInAsRe('archa', testInfo.project.name));
    await page.goto('/#/ucet');
    await page.getByRole('button', { name: 'Odhlásit se', exact: true }).click();
    await expect(page).toHaveURL(/\/\?odhlaseno=1/);
    await expect(page.getByRole('status')).toHaveText(cs.signIn.loggedOut.here);
    await expect(page.getByRole('link', { name: cs.signIn.button })).toHaveAttribute(
      'href',
      /account=select/,
    );
  });

  test('a refused sign-in says why on the Arch screen', async ({ page }) => {
    await page.goto('/?chyba=not-member');
    await expect(page.getByRole('alert')).toHaveText(cs.signIn.errors['not-member']);
    await expect(page.getByRole('link', { name: cs.signIn.switchAccount })).toBeVisible();
    await page.goto('/?chyba=%3Cscript%3E');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
