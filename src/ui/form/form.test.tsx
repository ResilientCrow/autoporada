import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FAILURE_CAUSES } from '@/contracts';
import { cs } from '@/ui/copy';
import { BulletList } from '@/ui/kit';

import { cspMarkupProblems } from '../../../test/support/markup';

import {
  CheckboxField,
  ErrorSummary,
  FieldGroup,
  Form,
  FormActions,
  FormProblem,
  LiveStatus,
  NoScriptNotice,
  SearchForm,
  SelectField,
  StepUpNotice,
  SubmitButton,
  TextField,
  type FormSpec,
  type FormState,
  type Problem,
} from './index';
import { retryAfterText } from './settle';

const nav = vi.hoisted(() => ({ search: '' }));
const reveal = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('./reveal-and-focus', () => ({
  revealAndFocus: (element: unknown) => reveal.calls.push(element),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/uzivatele/u 1',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const NOTE = 'Pomůže nám to.';
const OWN_LABEL = 'Vlastní';
const OWN = 'Zadejte název vlastními slovy.';
const spec: FormSpec = {
  title: { label: 'Název', required: true, messages: { required: OWN } },
  note: { label: 'Poznámka' },
};
const noop = () => undefined;

function idle(issues: FormState['issues'], problem: Problem | null = null): FormState {
  return { issues, problem, attempt: 0, submitting: null, onSubmit: noop };
}

function render(issues: FormState['issues'] = null): string {
  return renderToStaticMarkup(
    <Form id="f" spec={spec} state={idle(issues)}>
      <TextField name="title" />
      <TextField name="note" description={NOTE} multiline />
    </Form>,
  );
}

describe('Form and TextField', () => {
  const html = render();

  it('is a POST form without browser validation or an action', () => {
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(html).toContain('noValidate=""');
    expect(html).not.toMatch(/<form [^>]*action=/);
  });

  it("points the label's for at the input id", () => {
    expect(html).toMatch(/<label [^>]*for="f-title"/);
    expect(html).toMatch(/<input [^>]*id="f-title"/);
  });

  it('marks only optional fields', () => {
    expect(html).toContain(`Poznámka ${cs.form.optional}`);
    expect(html).not.toContain(`Název ${cs.form.optional}`);
  });

  it('wires the description with aria-describedby', () => {
    const id = /<span [^>]*id="([^"]+)"[^>]*slot="description"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toMatch(new RegExp(`<textarea [^>]*aria-describedby="[^"]*${id}`));
  });

  it('shows no error when there are no issues', () => {
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain(cs.form.errorPrefix);
  });

  it('names an error with its own message and a hidden prefix', () => {
    const bad = render({ title: 'required', note: 'too-long' });
    expect(bad.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(bad).toContain(OWN);
    expect(bad).toContain(cs.fieldIssues['too-long']);
    expect(bad).toContain(cs.form.errorPrefix);
  });

  it('throws for a name the spec does not declare', () => {
    expect(() =>
      renderToStaticMarkup(
        <Form id="f" spec={spec} state={idle(null)}>
          <TextField name="typo" />
        </Form>,
      ),
    ).toThrow(/typo/);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(cspMarkupProblems(render({ title: 'required' }))).toEqual([]);
  });

  describe('leading message', () => {
    const lead = (issues: FormState['issues'], problem: Problem | null) =>
      renderToStaticMarkup(
        <Form id="f" spec={spec} state={idle(issues, problem)}>
          <TextField name="title" />
        </Form>,
      );

    it('shows a problem alone when there are no issues', () => {
      const out = lead(null, { code: 'network' });
      expect(out).toContain(cs.errors.network);
      expect(out).not.toContain(cs.form.summaryTitle);
      expect(out).toMatch(/<form [^>]*><div tabindex="-1"><div role="alert"/);
    });

    it('lets issues win over a problem', () => {
      const out = lead({ title: 'required' }, { code: 'network' });
      expect(out).toContain(cs.form.summaryTitle);
      expect(out).not.toContain(cs.errors.network);
    });

    it('shows a problem when the issues are empty', () => {
      expect(lead({}, { code: 'busy' })).toContain(cs.errors.busy);
    });

    it('shows neither when idle', () => {
      expect(lead(null, null)).not.toContain('role="alert"');
    });
  });

  describe('error summary', () => {
    const bad = render({ note: 'too-long', title: 'required', 'other.0': 'invalid' });

    it('is absent without issues', () => {
      expect(html).not.toContain('role="alert"');
      expect(render({})).not.toContain('role="alert"');
    });

    it('leads the form: focusable container, nested alert, title, then links in spec order', () => {
      expect(bad).toMatch(/<form [^>]*><div tabindex="-1"[^>]*><div role="alert"/);
      expect(bad).toMatch(new RegExp(`<h2 [^>]*>.*${cs.form.summaryTitle}</h2>`));
      const items = [...bad.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
      expect(items).toEqual([
        `<a href="#f-title" class="inline-block w-fit py-1">Název: ${OWN}</a>`,
        `<a href="#f-note" class="inline-block w-fit py-1">Poznámka: ${cs.fieldIssues['too-long']}</a>`,
        cs.fieldIssues.invalid,
      ]);
    });

    it('renders markup the CSP accepts', () => {
      expect(cspMarkupProblems(bad)).toEqual([]);
    });
  });
});

describe('SelectField and CheckboxField', () => {
  const HINT = 'Určuje, co uvidíte.';
  const OPTIONS = [
    { value: 'a', label: 'Alfa' },
    { value: 'b', label: 'Beta' },
  ];
  const controlSpec: FormSpec = {
    kind: { label: 'Druh', required: true, messages: { invalid: OWN } },
    agree: { label: 'Souhlas' },
  };

  function renderControls(
    issues: FormState['issues'] = null,
    described = false,
    checked = false,
  ): string {
    return renderToStaticMarkup(
      <Form id="c" spec={controlSpec} state={idle(issues)}>
        <SelectField
          name="kind"
          options={OPTIONS}
          defaultValue="b"
          description={described ? HINT : undefined}
        />
        <CheckboxField
          name="agree"
          description={described ? HINT : undefined}
          defaultChecked={checked}
        />
      </Form>,
    );
  }

  describe('clean', () => {
    const html = renderControls();

    it('puts the ids on the native elements and points the labels at them', () => {
      expect(html).toMatch(/<select [^>]*id="c-kind"/);
      expect(html).toMatch(/<input [^>]*id="c-agree"[^>]*type="checkbox"/);
      expect(html).toMatch(/<label [^>]*for="c-kind"/);
      expect(html).toMatch(/<label [^>]*for="c-agree"/);
    });

    it('uses aria-required, not required, and no invalid or describedby', () => {
      expect(html).toMatch(/<select [^>]*aria-required="true"/);
      expect(html).not.toMatch(/<(select|input) [^>]*\srequired/);
      expect(html).not.toContain('aria-invalid=');
      expect(html).not.toContain('aria-describedby');
      expect(html).not.toContain(cs.form.errorPrefix);
    });

    it('marks the optional checkbox only, with the label from the spec', () => {
      expect(html).toContain(`Souhlas ${cs.form.optional}`);
      expect(html).not.toContain(`Druh ${cs.form.optional}`);
    });

    it('leaves out the optional marker for a box that is optional by nature', () => {
      const out = renderToStaticMarkup(
        <Form id="c" spec={controlSpec} state={idle(null)}>
          <CheckboxField name="agree" optionalMark={false} />
        </Form>,
      );
      expect(out).toContain('Souhlas');
      expect(out).not.toContain(cs.form.optional);
    });

    it('shows a message of the page’s own under a box and marks it invalid', () => {
      const out = renderToStaticMarkup(
        <Form id="c" spec={controlSpec} state={idle(null)}>
          <CheckboxField name="agree" issue="Už nejde zrušit." />
        </Form>,
      );
      expect(out).toContain('Už nejde zrušit.');
      expect(out).toMatch(/<input [^>]*aria-invalid="true"/);
      expect(out).toMatch(/<input [^>]*aria-describedby="c-agree-error"/);
    });

    it('selects the default value and has no placeholder option', () => {
      expect(html).toContain('<option value="b" selected="">Beta</option>');
      expect(html.match(/<option /g)).toHaveLength(2);
    });

    it('is unchecked by default and checked on request', () => {
      expect(html).not.toContain('checked=""');
      expect(renderControls(null, false, true)).toMatch(/<input [^>]*checked=""/);
    });

    it('is disabled while an editor waits on its banner', () => {
      const out = renderToStaticMarkup(
        <Form id="c" spec={controlSpec} state={idle(null)}>
          <CheckboxField name="agree" disabled />
        </Form>,
      );
      expect(out).toMatch(/<input [^>]*disabled=""/);
      expect(html).not.toMatch(/<input [^>]*disabled/);
    });

    it('takes an explicit checkbox label and falls back to the first option', () => {
      const out = renderToStaticMarkup(
        <Form id="c" spec={controlSpec} state={idle(null)}>
          <SelectField name="kind" options={OPTIONS} />
          <CheckboxField name="kind" label={OWN_LABEL} />
        </Form>,
      );
      expect(out).toContain('<option value="a" selected="">Alfa</option>');
      expect(out).toContain(OWN_LABEL);
    });

    it('throws for a name the spec does not declare', () => {
      for (const field of [
        <SelectField key="s" name="typo" options={OPTIONS} />,
        <CheckboxField key="c" name="typo" />,
      ]) {
        expect(() =>
          renderToStaticMarkup(
            <Form id="c" spec={controlSpec} state={idle(null)}>
              {field}
            </Form>,
          ),
        ).toThrow(/typo/);
      }
    });
  });

  describe('described', () => {
    const html = renderControls(null, true);

    it('lists the description id in aria-describedby', () => {
      expect(html).toMatch(/<select [^>]*aria-describedby="c-kind-description"/);
      expect(html).toMatch(/<input [^>]*aria-describedby="c-agree-description"/);
      expect(html).toMatch(/<span id="c-kind-description" class="text-sm">/);
    });
  });

  describe('invalid', () => {
    const html = renderControls({ kind: 'invalid', agree: 'required' }, true);

    it('sets aria-invalid, shows the message with a hidden prefix, and lists both ids', () => {
      expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
      expect(html).toContain(OWN);
      expect(html).toContain(cs.fieldIssues.required);
      expect(html).toMatch(/<select [^>]*aria-describedby="c-kind-description c-kind-error"/);
      expect(html).toMatch(/<input [^>]*aria-describedby="c-agree-description c-agree-error"/);
      expect(html).toMatch(/<div id="c-kind-error"[^>]*>.*<span class="sr-only">Chyba: <\/span>/);
    });

    it('orders label, description, error, then the select', () => {
      const at = (needle: string) => html.indexOf(needle);
      expect(at('for="c-kind"')).toBeLessThan(at('id="c-kind-description"'));
      expect(at('id="c-kind-description"')).toBeLessThan(at('id="c-kind-error"'));
      expect(at('id="c-kind-error"')).toBeLessThan(at('<select'));
    });

    it('links the summary entries to the controls', () => {
      expect(html).toContain(`<a href="#c-kind" class="inline-block w-fit py-1">Druh: ${OWN}</a>`);
      expect(html).toContain('<a href="#c-agree" class="inline-block w-fit py-1">');
      expect(html).toMatch(/<select [^>]*id="c-kind"/);
    });

    it('renders markup the CSP accepts in every state', () => {
      expect(cspMarkupProblems(html)).toEqual([]);
      expect(cspMarkupProblems(renderControls())).toEqual([]);
      expect(cspMarkupProblems(renderControls(null, true, true))).toEqual([]);
    });
  });
});

describe('SelectField with an issue of its own', () => {
  const OPTIONS = [
    { value: 'a', label: 'Alfa' },
    { value: 'b', label: 'Beta' },
  ];
  const spec: FormSpec = { kind: { label: 'Druh' } };
  const MESSAGE = 'Tuto volbu nelze uložit.';
  const render = (issue?: string, issues: FormState['issues'] = null) =>
    renderToStaticMarkup(
      <Form id="c" spec={spec} state={idle(issues)}>
        <SelectField name="kind" options={OPTIONS} description="Nápověda." issue={issue} />
      </Form>,
    );

  it('shows the message and ties it to the select, after the description', () => {
    const html = render(MESSAGE);
    expect(html).toMatch(/<select [^>]*aria-invalid="true"/);
    expect(html).toMatch(/<select [^>]*aria-describedby="c-kind-description c-kind-error"/);
    expect(html).toMatch(new RegExp(`<div id="c-kind-error"[^>]*>.*${MESSAGE}`));
    expect(html).toContain(`<span class="sr-only">${cs.form.errorPrefix} </span>`);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('is clean without it', () => {
    const html = render();
    expect(html).not.toContain('aria-invalid=');
    expect(html).not.toContain('c-kind-error');
  });

  it('shows its own message in place of the form issue for the same field', () => {
    const html = render(MESSAGE, { kind: 'required' });
    expect(html).toMatch(new RegExp(`<div id="c-kind-error"[^>]*>.*${MESSAGE}.*</div>`));
    expect(html).not.toMatch(
      new RegExp(`<div id="c-kind-error"[^>]*>(?:(?!</div>).)*${cs.fieldIssues.required}`),
    );
    expect(html.match(/id="c-kind-error"/g)).toHaveLength(1);
  });
});

describe('FormProblem', () => {
  const PATH = encodeURIComponent('/uzivatele/u 1');
  const problems: readonly [Problem, string][] = [
    [{ code: 'invalid-input' }, cs.errors['invalid-input']],
    [{ code: 'unauthenticated' }, cs.errors.unauthenticated],
    [{ code: 'step-up-required' }, cs.errors['step-up-required']],
    [{ code: 'forbidden' }, cs.errors.forbidden],
    [{ code: 'not-found' }, cs.errors['not-found']],
    [{ code: 'conflict' }, cs.errors.conflict],
    [{ code: 'busy' }, cs.errors.busy],
    [{ code: 'rule', rule: 'last-headmaster' }, cs.rules['last-headmaster']],
    [
      { code: 'rate-limited', retryAfterSeconds: 720 },
      `${cs.errors['rate-limited']} ${cs.problemActions.retry} ${retryAfterText(720)}.`,
    ],
    [
      { code: 'unavailable', cause: 'database-down' },
      `${cs.errors.unavailable} ${cs.failures['database-down']}`,
    ],
    [{ code: 'network' }, cs.errors.network],
  ];
  const html = (problem: Problem) => renderToStaticMarkup(<FormProblem problem={problem} />);

  it.each(problems)('says what happened for %j', (problem, text) => {
    const out = html(problem);
    expect(out).toMatch(/^<div tabindex="-1"><div role="alert"/);
    expect(out).toContain(text);
    expect(out).not.toContain('style=');
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it.each(FAILURE_CAUSES)('unavailable by %s: names the cause, with no code', (cause) => {
    const out = html({ code: 'unavailable', cause });
    expect(out).toContain(`${cs.errors.unavailable} ${cs.failures[cause]}`);
    expect(out).not.toContain('Kód chyby');
    expect(out).not.toContain(cs.app.technical);
  });

  it('unavailable: a development detail goes on a second, monospace line', () => {
    const out = html({
      code: 'unavailable',
      cause: 'database-down',
      detail: 'DatabaseFailure 08000',
    });
    expect(out).toMatch(
      new RegExp(`<p class="[^"]*font-mono[^"]*">${cs.app.technical} DatabaseFailure 08000</p>`),
    );
    expect(out).not.toContain('style=');
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('unavailable: a form that only reads does not say the changes were not saved', () => {
    const out = renderToStaticMarkup(
      <FormProblem problem={{ code: 'unavailable', cause: 'timeout' }} readOnly />,
    );
    expect(out).toContain(cs.failures.timeout);
    expect(out).not.toContain(cs.errors.unavailable);
  });

  it.each([
    ['unauthenticated', '/auth/login', cs.problemActions.signIn],
    ['step-up-required', '/auth/step-up', cs.problemActions.stepUp],
  ] as const)('%s: a sign-in link in a new tab, plus the return hint', (code, path, label) => {
    const out = html({ code });
    expect(out).toContain(
      `<a href="${path}?returnTo=${PATH}" target="_blank" rel="noopener">${label}</a>`,
    );
    expect(out).toContain(cs.problemActions.returnHint);
  });

  it.each(['conflict', 'not-found'] as const)('%s: a link back to the page', (code) => {
    const out = html({ code });
    expect(out).toMatch(
      new RegExp(`<a href="/uzivatele/u(?: |%20)1"[^>]*>${cs.problemActions.reload}</a>`),
    );
    expect(out).not.toContain(cs.problemActions.returnHint);
  });

  describe('on a page with a query string', () => {
    const SEARCH = 'hledat=Eva+Nov%C3%A1k&skupina=ucitele';
    const PATH_ONLY = encodeURIComponent('/uzivatele/u 1');
    beforeEach(() => {
      nav.search = SEARCH;
    });
    afterEach(() => {
      nav.search = '';
    });

    // The search names people: a sign-in URL would put it in Caddy's log and the sign-in row.
    it.each(['/auth/login', '/auth/step-up'])(
      '%s returns to the path, never the search',
      (path) => {
        const code = path === '/auth/login' ? 'unauthenticated' : 'step-up-required';
        const out = html({ code });
        expect(out).toContain(`<a href="${path}?returnTo=${PATH_ONLY}"`);
        expect(out).not.toContain('hledat');
      },
    );

    it('reloads the same query', () => {
      expect(html({ code: 'conflict' })).toMatch(
        /<a href="\/uzivatele\/u(?: |%20)1\?hledat=Eva\+Nov%C3%A1k&amp;skupina=ucitele"/,
      );
    });
  });

  it.each(['forbidden', 'busy', 'network'] as const)('%s: no action', (code) => {
    expect(html({ code })).not.toContain('<a ');
  });
});

describe('SubmitButton, LiveStatus and NoScriptNotice', () => {
  const buttons = renderToStaticMarkup(
    <Form id="f" spec={spec} state={idle(null)}>
      <SubmitButton>{cs.gallery.forms.submit}</SubmitButton>
      <SubmitButton name="decision" value="no" variant="secondary">
        {cs.gallery.buttons.secondary}
      </SubmitButton>
    </Form>,
  );

  it('renders every submit button disabled in the server HTML', () => {
    const tags = buttons.match(/<button [^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toContain('type="submit"');
      expect(tag).toContain('disabled=""');
      expect(tag).not.toContain(' data-pending=');
    }
    expect(buttons).toMatch(
      /<button [^>]*name="decision"[^>]*value="no"|value="no"[^>]*name="decision"/,
    );
  });

  it('renders the live region empty, and with a notice that is not itself live', () => {
    expect(renderToStaticMarkup(<LiveStatus message="" count={0} />)).toBe(
      '<div role="status"></div>',
    );
    const full = renderToStaticMarkup(<LiveStatus message="Hotovo." count={2} />);
    expect(full).toMatch(/^<div role="status"><div [^>]*>.*Hotovo\./);
    expect(full.match(/role=/g)).toHaveLength(1);
  });

  it('renders the no-script notice', () => {
    const out = renderToStaticMarkup(<NoScriptNotice />);
    expect(out).toMatch(/^<noscript>.*<\/noscript>$/);
    expect(out).toContain(cs.form.noscript);
    expect(cspMarkupProblems(out)).toEqual([]);
    expect(cspMarkupProblems(buttons)).toEqual([]);
  });
});

const SEARCH = { path: '/uzivatele', label: 'Hledat', submit: 'Jdi' };

describe('SearchForm', () => {
  const html = renderToStaticMarkup(
    <SearchForm
      path={SEARCH.path}
      label={SEARCH.label}
      submit={SEARCH.submit}
      query="nov"
      keep={{ name: 'skupina', value: 'reditele' }}
    />,
  );

  it('is a native GET search that works without JavaScript', () => {
    expect(html).toMatch(/<form [^>]*method="get"/);
    expect(html).toMatch(/<form [^>]*role="search"/);
    expect(html).toMatch(/<form [^>]*action="\/uzivatele"/);
    expect(html).toMatch(/<button [^>]*type="submit"/);
    expect(html).toContain(`>${SEARCH.submit}</button>`);
  });

  it('labels the search field and fills it with the text searched', () => {
    expect(html).toMatch(new RegExp(`<label [^>]*for="hledat"[^>]*>${SEARCH.label}</label>`));
    expect(html).toMatch(/<input [^>]*id="hledat"/);
    expect(html).toMatch(/<input [^>]*type="search"[^>]*name="hledat"[^>]*value="nov"/);
  });

  it('keeps the group in a hidden field', () => {
    expect(html).toMatch(/<input [^>]*type="hidden"[^>]*name="skupina"[^>]*value="reditele"/);
  });

  it('has clean markup', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('StepUpNotice', () => {
  const html = renderToStaticMarkup(<StepUpNotice returnTo="/uzivatele/u 1" />);

  it('explains why and for how long', () => {
    expect(html).toContain(cs.stepUpNotice.title);
    expect(html).toContain(cs.stepUpNotice.text);
  });

  it('is a plain link in the same tab, to the step-up with the way back', () => {
    const link = /<a [^>]*>/.exec(html)?.[0] ?? '';
    expect(link).toContain('href="/auth/step-up?returnTo=%2Fuzivatele%2Fu%201"');
    expect(link).not.toContain('target=');
    expect(link).not.toContain('prefetch');
    expect(html).toContain(`>${cs.stepUpNotice.action}</a>`);
  });

  it('has clean markup', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('ErrorSummary entries', () => {
  /** The keys React reconciles the entries by: the summary has no hooks, so it can be called. */
  function keysOf(items: readonly { id: string | null; text: string }[]): (string | null)[] {
    const keys: (string | null)[] = [];
    const walk = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const element = node as ReactElement<{ children?: ReactNode }>;
      if (element.type === BulletList) {
        const children = element.props.children;
        for (const child of Array.isArray(children) ? children : [children])
          if (isValidElement(child)) keys.push(child.key);
        return;
      }
      walk(element.props.children);
    };
    walk(ErrorSummary({ items, summaryRef: null }));
    return keys;
  }

  it('keys entries that lead to the same control apart', () => {
    const keys = keysOf([
      { id: 'f-people', text: 'U osoby A zvolte oslovení.' },
      { id: 'f-people', text: 'U osoby B zvolte oslovení.' },
      { id: null, text: 'Přidejte vyjádření.' },
      { id: null, text: 'Přidejte vyjádření.' },
    ]);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
  });

  it('moves a linked entry to its control through revealAndFocus, and leaves a missing control alone', () => {
    const control = { id: 'f-people' };
    const preventDefault = vi.fn();
    vi.stubGlobal('document', {
      getElementById: (id: string) => (id === 'f-people' ? control : null),
    });
    try {
      const summary = ErrorSummary({
        items: [
          { id: 'f-people', text: 'A' },
          { id: 'f-gone', text: 'B' },
        ],
        summaryRef: null,
      });
      const entries: ReactElement<{ id: string; text: string }>[] = [];
      const collect = (node: ReactNode) => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (!isValidElement(node)) return;
        const element = node as ReactElement<{ children?: ReactNode; id?: string; text?: string }>;
        if (typeof element.type === 'function' && element.props.text !== undefined)
          entries.push(element as never);
        else collect(element.props.children);
      };
      collect(summary);
      const click = (entry: ReactElement<{ id: string; text: string }>) => {
        const item = (entry.type as (props: unknown) => ReactElement<{ children: ReactElement }>)(
          entry.props,
        );
        const link = item.props.children as ReactElement<{ onClick: (e: unknown) => void }>;
        link.props.onClick({ preventDefault });
      };
      reveal.calls.length = 0;
      click(entries[0] as never);
      expect(reveal.calls).toEqual([control]);
      expect(preventDefault).toHaveBeenCalledOnce();
      click(entries[1] as never);
      expect(reveal.calls).toEqual([control]);
      expect(preventDefault).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('field rhythm', () => {
  const state: FormState = {
    issues: null,
    problem: null,
    attempt: 0,
    submitting: null,
    onSubmit: () => undefined,
  };

  it('puts 24 px between the fields of a form', () => {
    const out = renderToStaticMarkup(
      <Form id="f" spec={spec} state={state}>
        {NOTE}
      </Form>,
    );
    expect(out).toContain('class="flex flex-col gap-6"');
  });

  it('sets a description in small type', () => {
    const out = renderToStaticMarkup(
      <Form id="f" spec={{ ...spec, role: { label: 'Role' } }} state={state}>
        <TextField name="note" description={NOTE} />
        <SelectField name="role" options={[{ value: 'a', label: 'A' }]} description={NOTE} />
      </Form>,
    );
    expect(out.match(/class="text-sm"/g)).toHaveLength(2);
  });

  it('FieldGroup is a bordered fieldset with its legend, and can be focused or disabled', () => {
    const plain = renderToStaticMarkup(<FieldGroup legend={NOTE}>{OWN}</FieldGroup>);
    expect(plain).toContain('gap-4 rounded-brand border-2 border-ink p-4');
    expect(plain).toContain(`<legend class="px-1 font-bold">${NOTE}</legend>`);
    expect(plain).not.toContain('tabindex');
    const named = renderToStaticMarkup(
      <FieldGroup legend={NOTE} id="g" disabled describedBy="d">
        {OWN}
      </FieldGroup>,
    );
    expect(named).toMatch(/<fieldset id="g" tabindex="-1" disabled="" aria-describedby="d"/);
    expect(cspMarkupProblems(named)).toEqual([]);
  });

  it('FormActions is a row of actions', () => {
    const out = renderToStaticMarkup(<FormActions>{NOTE}</FormActions>);
    expect(out).toBe(`<div class="flex flex-wrap items-center gap-x-3 gap-y-2">${NOTE}</div>`);
  });
});
