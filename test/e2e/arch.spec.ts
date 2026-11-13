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
import { forgetPointsOf, readPoint, seedPoint, withClient } from './db';

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
  readonly futures: readonly {
    id: string;
    note: string | null;
    parts: readonly string[] | null;
    trail: readonly { who: string; what: string }[];
  }[];
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

/** The wizard's forward button: „Přeskočit“ on an optional step left empty, else „Pokračovat“. */
const onward = (page: Page) => page.getByRole('button', { name: /^(Pokračovat|Přeskočit)$/ });

async function sendAkce(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Nová akce' }).click();
  await page.getByRole('textbox', { name: 'Název' }).fill(title);
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByLabel('Den', { exact: true }).fill(isoInDays(11));
  // Kdy, then Kde, Kdo and Poznámka, which are optional and left empty.
  for (let step = 0; step < 4; step += 1) {
    await onward(page).click();
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
  const forget = async (project: string) => {
    await forgetFutureOf(emailOf('archa', project));
    await forgetPointsOf(emailOf('archa', project));
  };
  test.beforeEach(({}, testInfo) => forget(testInfo.project.name));
  test.afterEach(({}, testInfo) => forget(testInfo.project.name));

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
    await expect(page.getByRole('button', { name: 'Přeskočit' })).toBeVisible();
    await page.getByRole('button', { name: 'Přeskočit' }).click();
    await expect(
      page.getByRole('heading', { name: 'Kdo to organizuje a kdo se zúčastní?' }),
    ).toBeVisible();
    // Names with no role are not enough: the step asks which it is.
    await page.getByLabel('Jména organizátorů').fill('paní zástupkyně Jana Nováková');
    await expect(page.getByText('Vyberte, jestli organizuje, nebo koordinuje.')).toBeVisible();
    await page.getByRole('radio', { name: 'Organizuje' }).click();
    await page.getByLabel(/^Účastníci/).fill('účast slečna Tereza Malá (3.B)');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(
      page.getByRole('heading', { name: 'Chcete k tomu ještě něco připsat?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Přeskočit' }).click();
    await expect(
      page.getByRole('heading', { name: 'Takhle to vyjde. Můžeme to poslat?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Odeslat vedení' }).click();
    await expect(page.getByRole('heading', { name: 'Hotovo, je to u vedení' })).toBeVisible();

    // The draft and the submit reached the server, not only the page's store.
    await expect.poll(async () => (await futureOf(email, title))?.state).toBe('submitted');
    const typed = await withClient((c) =>
      c.query<{ organizer: string; organizer_role: string; participants: string }>(
        `SELECT organizer, organizer_role, participants FROM future_items WHERE title = $1`,
        [title],
      ),
    );
    expect(typed.rows[0]).toEqual({
      organizer: 'paní zástupkyně Jana Nováková',
      organizer_role: 'organizes',
      participants: 'účast slečna Tereza Malá (3.B)',
    });
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
    await head.getByRole('button', { name: 'Vrátit k úpravě', exact: true }).click();
    await head.getByRole('checkbox', { name: 'Místo' }).check();
    await head.getByRole('textbox').last().fill('Doplňte prosím místo.');
    await head.getByRole('button', { name: 'Vrátit autorovi', exact: true }).click();
    await expect.poll(async () => (await readFuture(id)).state).toBe('returned');

    await page.goto(`/#/akce/${id}`);
    await page.reload();
    await expect(page.getByText('Upravte: Místo')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Opravit a poslat znovu' })).toHaveAttribute(
      'href',
      `#/nova-akce/${id}/kde`,
    );

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
    const returned = state.futures.find((f) => f.id === id)!;
    expect(returned).toMatchObject({ note: 'Doplňte prosím místo.', parts: ['place'] });
    const trail = returned.trail;
    expect(trail.map((t) => t.who)).toContain('vedeni');
    const reviewerIds = new Set(state.users.map((u) => u.id));
    for (const { who } of trail) expect([...reviewerIds, 'system']).toContain(who);
  });

  test('a returned report opens only the parts the vedení named', async ({
    page,
    signInAs,
    newContext,
  }, testInfo) => {
    const project = testInfo.project.name;
    const id = await seedPoint(emailOf('archa', project), `Vrácená zpráva ${project}`, 'submitted');

    const head = await signInElsewhere(newContext, signInAsRe('rizeni', project));
    await head.goto(`/#/kontrola/${id}`);
    await head.getByRole('button', { name: 'Vrátit k úpravě', exact: true }).click();
    await head.getByRole('checkbox', { name: 'Název a\u00a0datum' }).check();
    await head.getByRole('checkbox', { name: 'Seznam účastníků' }).check();
    await head.getByRole('button', { name: 'Vrátit autorovi', exact: true }).click();
    await expect.poll(async () => (await readPoint(id)).state).toBe('returned');

    await signInAs(signInAsRe('archa', project));
    await page.goto(`/#/oprava/${id}`);
    await expect(page.getByText('Upravte: Název a\u00a0datum, Seznam účastníků')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Název' })).toBeVisible();
    await expect(page.getByLabel('Kdy')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Odebrat: .*Ondřej Pech$/ })).toBeVisible();
    // The organisers are the akce's own; the text and the statements were not named.
    await expect(page.getByRole('button', { name: /^Odebrat: .*Jana Nováková$/ })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Text zprávy' })).toHaveCount(0);
    await expect(page.getByText('Vyjádření', { exact: true })).toHaveCount(0);
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

  test('the headmaster adds to any list straight into the porada', async ({
    page,
    signInAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'shared issues');
    const email = emailOf('rizeni', testInfo.project.name);
    await forgetFutureOf(email);
    await signInAs(headmaster(testInfo.project.name));

    // The headmaster's akce goes through the same steps and needs no second person to approve it.
    await page.goto('/#/pridat');
    await page.getByRole('button', { name: /Přidat akci, podle data/ }).click();
    await page.getByRole('textbox', { name: 'Název' }).fill('Den otevřených dveří');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await page.getByLabel('Den', { exact: true }).fill(isoInDays(50));
    await onward(page).click();
    await onward(page).click();
    // Anyone can be named, as free text.
    await page.getByRole('radio', { name: 'Koordinuje' }).click();
    await page.getByLabel('Jména organizátorů').fill('Tereza Malá (3.B)');
    await onward(page).click();
    await onward(page).click();
    await page.getByRole('button', { name: 'Zařadit do porady' }).click();
    await expect
      .poll(async () => (await futureOf(email, 'Den otevřených dveří'))?.state)
      .toBe('approved');

    // A partner's words, kept after a reload.
    await page.goto('/#/pridat');
    await page.getByRole('link', { name: /Přidat ohlas/ }).click();
    await page.getByRole('button', { name: 'Přidat ohlas' }).click();
    await page.getByLabel(/Kdo ho napsal/).fill('pana Jana Nováka');
    await page.getByLabel(/Text ohlasu/).fill('Děkujeme za spolupráci.');
    await page.getByRole('button', { name: 'Uložit', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.goto('/#/pridat');
    await page.reload();
    await page.getByRole('link', { name: /Přidat ohlas, teď 1/ }).click();
    await expect(page.getByLabel(/Kdo ho napsal/)).toHaveValue('pana Jana Nováka');
    await page.getByRole('button', { name: 'Odebrat ohlas' }).click();
    await page.getByRole('button', { name: 'Uložit', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // A new list of students, and its line in the bod o uvolnění renamed.
    const list = `Němčina ${Date.now()}`;
    await page.goto('/#/seznamy');
    await page.getByRole('button', { name: 'Nový seznam' }).click();
    await page.getByLabel(/^Název/).fill(list);
    await page.getByLabel(/Text v dokumentu/).fill('seznam studentů uvolněných z Němčiny');
    await page.getByRole('button', { name: 'Vytvořit seznam' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await page.getByRole('link', { name: new RegExp(list) }).click();
    // A typo in a name is put right without the student counting as new again.
    await page.getByLabel(/Vložit seznam/).fill('Jana Překlepová (1.A)');
    await page.getByRole('button', { name: 'Zkontrolovat seznam' }).click();
    await page.getByRole('button', { name: 'Přidat 1 studenta' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Opravit: Jana Překlepová' }).click();
    await page.getByLabel('Příjmení').fill('Opravená');
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/arch/run') && !!r.request().postData()?.includes('saveEntry'),
    );
    await page.getByRole('button', { name: 'Uložit opravu' }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Opravit: Jana Opravená' })).toBeVisible();
    await page.getByText('Přejmenovat seznam').click();
    await page.getByLabel(/^Název/).fill(`${list} B`);
    await page.getByRole('button', { name: 'Uložit název' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.goto('/#/seznamy');
    await page.reload();
    await expect(page.getByRole('link', { name: new RegExp(`${list} B`) })).toBeVisible();

    // The same akce on another day keeps everything but the date.
    const again = (await futureOf(email, 'Den otevřených dveří'))!;
    await page.goto(`/#/akce/${again.id}`);
    await page.getByRole('button', { name: 'Stejné na jiný den' }).click();
    await page.getByLabel('Den', { exact: true }).fill(isoInDays(57));
    for (let i = 0; i < 4; i += 1) await onward(page).click();
    await page.getByRole('button', { name: 'Zařadit do porady' }).click();
    await expect
      .poll(async () =>
        withClient(async (c) => {
          const { rows } = await c.query(
            `SELECT 1 FROM future_items WHERE title = 'Den otevřených dveří' AND state = 'approved'`,
          );
          return rows.length;
        }),
      )
      .toBe(2);
    await forgetFutureOf(email);
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
