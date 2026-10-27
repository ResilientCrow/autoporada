import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { RecentPerson } from '@/domain/people';
import { POINT_LIMITS, type DraftPerson, type DraftStatement } from '@/domain/report';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';
import { fieldId, Form } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { EDITOR_FORM_ID, EDITOR_FORM_STATE, editorSpec } from './editor-form';
import type { PointContentWire } from './fields';
import { Statements } from './Statements';
import { chooseSpeaker, NEW_STATEMENT, optionValue } from './statements-state';

const { points } = cs;
const copy = points.statements;

const person = (givenName: string, familyName: string, extra: Partial<DraftPerson> = {}) =>
  ({ salutation: 'pan', givenName, familyName, ...extra }) satisfies DraftPerson;

const NOVAK = person('Jan', 'Novák');
const MALA = person('Eva', 'Malá', { salutation: 'slecna', graphId: 'g-2' });
const STRANGER = person('Karel', 'Cizí');
const ODD = person('Xyzzy', 'Qwrtz');

const BULLETS: PointContentWire['bullets'] = [
  { key: 'organizatori', label: 'Organizátoři', kind: 'people', order: 'input', people: [NOVAK] },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [MALA, ODD] },
];

const recent = (p: DraftPerson, genitive: string): RecentPerson => ({
  ...p,
  genitive,
  lastUsed: '2026-10-01T10:00:00.000Z',
});

function render(
  statements: readonly DraftStatement[],
  options: { recents?: RecentPerson[]; readOnly?: boolean; issues?: Record<string, string> } = {},
) {
  return renderToStaticMarkup(
    <Form
      id={EDITOR_FORM_ID}
      spec={editorSpec([], [], statements.length)}
      state={EDITOR_FORM_STATE}
    >
      <Statements
        bullets={BULLETS}
        statements={statements}
        issues={options.issues ?? {}}
        readOnly={options.readOnly ?? false}
        today={calDate(2026, 10, 27)}
        recents={options.recents ?? []}
        directory="off"
        onChange={() => undefined}
        onBlur={() => undefined}
      />
    </Form>,
  );
}

/** The control a label points at, as its opening tag. */
function controlOf(html: string, label: string, nth = 0): string {
  const labels = [
    ...html.matchAll(
      new RegExp(`<label[^>]*\\sfor="([^"]+)"[^>]*>${label}(?: \\(nepovinné\\))?</label>`, 'g'),
    ),
  ];
  const found = labels[nth];
  if (!found) throw new Error(`No label „${label}“ number ${nth} in the markup`);
  const tag = new RegExp(`<(?:input|textarea|select)[^>]*\\sid="${found[1]}"[^>]*>`).exec(html);
  if (!tag) throw new Error(`The label „${label}“ points at ${found[1]}, which is no control`);
  return tag[0];
}

/** The `<fieldset>` of card `n`, whole. */
function cardOf(html: string, n: number): string {
  const found = new RegExp(
    `<fieldset(?:(?!</fieldset>).)*?<legend[^>]*>${copy.legend(n)}</legend>.*?</fieldset>`,
    's',
  ).exec(html);
  if (!found) throw new Error(`No card number ${n}`);
  return found[0];
}

const bySpeaker = (p: DraftPerson, extra: Partial<DraftStatement> = {}): DraftStatement => ({
  ...chooseSpeaker({ ...NEW_STATEMENT, quote: 'Citace' }, p, []),
  ...extra,
});

describe('Statements: the section', () => {
  it('has the heading and the add button, and no card without a statement', () => {
    const html = render([]);
    expect(html).toMatch(/<h2[^>]*>Vyjádření<\/h2>/);
    expect(html).toMatch(/<button[^>]*>Přidat vyjádření<\/button>/);
    expect(html).not.toContain('<fieldset');
  });

  it('says the cap in the words the bullets use', () => {
    expect(copy.full(POINT_LIMITS.statements)).toBe('Bod může mít nejvýše 10\u00a0vyjádření.');
  });

  it('gives each statement a fieldset whose legend carries its number', () => {
    const html = render([bySpeaker(NOVAK), bySpeaker(MALA)]);
    expect(copy.legend(2)).toBe('Vyjádření č.\u00a02');
    expect(html.match(/<fieldset/g)).toHaveLength(2);
    expect(cardOf(html, 1)).toContain('Citace');
    expect(cardOf(html, 2)).toContain('Citace');
  });

  it('is clean for the Content-Security-Policy, with no style attribute', () => {
    const html = render([bySpeaker(NOVAK), bySpeaker(ODD), NEW_STATEMENT]);
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(html).not.toContain('style=');
  });
});

describe('Statements: „Kdo“', () => {
  const options = (html: string, n = 1) =>
    [...cardOf(html, n).matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map((m) => ({
      value: m[1],
      selected: (m[2] ?? '').includes('selected'),
      label: m[3],
    }));

  it('lists the participants by name, then „Jiná osoba…“', () => {
    const html = render([bySpeaker(NOVAK)]);
    expect(options(html).map((o) => o.label)).toEqual([
      'Jan Novák',
      'Eva Malá',
      'Xyzzy Qwrtz',
      'Jiná osoba…',
    ]);
    expect(options(html).map((o) => o.value)).toEqual([
      optionValue(NOVAK),
      'id:g-2',
      optionValue(ODD),
      'other',
    ]);
  });

  it('selects the participant who is the speaker', () => {
    const html = render([bySpeaker(MALA)]);
    expect(
      options(html)
        .filter((o) => o.selected)
        .map((o) => o.label),
    ).toEqual(['Eva Malá']);
  });

  it('shows a one-slot people field only for „Jiná osoba…“', () => {
    const listLabel = `aria-label="${copy.otherList(1)}"`;
    expect(render([bySpeaker(NOVAK)])).not.toContain(listLabel);
    const other = render([bySpeaker(STRANGER)]);
    expect(
      options(other)
        .filter((o) => o.selected)
        .map((o) => o.label),
    ).toEqual(['Jiná osoba…']);
    expect(other).toContain(listLabel);
    expect(other).toContain('Karel Cizí');
  });

  it('starts a new statement on „Vyberte…“, with no people field', () => {
    const html = render([NEW_STATEMENT]);
    expect(options(html)[0]).toEqual({ value: '', selected: true, label: 'Vyberte…' });
    expect(html).not.toContain(`aria-label="${copy.otherList(1)}"`);
  });

  it('is labelled „Kdo“, takes the id of the readiness path and is asked for', () => {
    const html = render([bySpeaker(NOVAK)]);
    const tag = controlOf(html, 'Kdo');
    expect(tag).toContain(`id="${fieldId(EDITOR_FORM_ID, 'statements.0.speaker')}"`);
    expect(tag).toContain('id="bod-statements-0-speaker"');
    expect(tag).toMatch(/^<select/);
  });
});

describe('Statements: the genitive', () => {
  it('shows the genitive the statement holds, labelled „Ve 2. pádě“, with the readiness id', () => {
    const html = render([bySpeaker(NOVAK)]);
    const tag = controlOf(html, 'Ve 2\\.\u00a0pádě');
    expect(tag).toContain('id="bod-statements-0-speakerGenitive"');
    expect(tag).toContain('value="pana Jana Nováka"');
  });

  it('shows a genitive the author used before for that person', () => {
    const recents = [recent(NOVAK, 'pana Honzy Nováka')];
    const chosen = chooseSpeaker(NEW_STATEMENT, NOVAK, recents);
    expect(controlOf(render([chosen], { recents }), 'Ve 2\\.\u00a0pádě')).toContain(
      'value="pana Honzy Nováka"',
    );
  });

  it('says to check a suggestion the rules are unsure of, in text, tied to the field', () => {
    const html = render([bySpeaker(ODD)]);
    const text = copy.check('pana Xyzzyho Qwrtze');
    expect(text).toBe('Zkontrolujte tvar: pana Xyzzyho Qwrtze');
    expect(html).toContain(text);
    const note = new RegExp(`<[^>]*id="([^"]+)"[^>]*>${text}<`).exec(html);
    expect(controlOf(html, 'Ve 2\\.\u00a0pádě')).toMatch(
      new RegExp(`aria-describedby="(?:[^"]* )?${note?.[1]}(?: [^"]*)?"`),
    );
  });

  it('drops the check once the author changed the genitive, and for a sure suggestion', () => {
    expect(render([bySpeaker(ODD, { speakerGenitive: 'pana Xyzzyho Qwrtzeho' })])).not.toContain(
      'Zkontrolujte',
    );
    expect(render([bySpeaker(NOVAK)])).not.toContain('Zkontrolujte');
  });

  it('asks for the salutation first when the speaker has none, with the field empty', () => {
    const html = render([bySpeaker(person('Jan', 'Novák', { salutation: null }))]);
    expect(copy.needSalutation).toBe('Nejdřív zvolte oslovení.');
    expect(html).toContain('Nejdřív zvolte oslovení.');
    expect(controlOf(html, 'Ve 2\\.\u00a0pádě')).toContain('value=""');
  });

  it('shows no note for a statement with no speaker', () => {
    const html = render([NEW_STATEMENT]);
    expect(html).not.toContain('Nejdřív zvolte');
    expect(html).not.toContain('Zkontrolujte');
  });

  it('caps the genitive at the contract’s limit', () => {
    expect(controlOf(render([bySpeaker(NOVAK)]), 'Ve 2\\.\u00a0pádě')).toMatch(
      new RegExp(`maxlength="${POINT_LIMITS.speakerGenitive}"`, 'i'),
    );
    expect(POINT_LIMITS.speakerGenitive).toBe(200);
  });
});

describe('Statements: the other fields', () => {
  const html = render([bySpeaker(NOVAK, { affiliation: 'ředitel školy', quote: 'Děkuji všem.' })]);

  it('has „Funkce nebo třída“, optional, capped, with the readiness id and its value', () => {
    const tag = controlOf(html, 'Funkce nebo třída');
    expect(tag).toContain('id="bod-statements-0-affiliation"');
    expect(tag).toMatch(new RegExp(`maxlength="${POINT_LIMITS.statementAffiliation}"`, 'i'));
    expect(POINT_LIMITS.statementAffiliation).toBe(120);
    expect(tag).toContain('value="ředitel školy"');
    expect(html).toContain('Funkce nebo třída (nepovinné)');
  });

  it('has „Citace“ as a textarea, capped, with the readiness id and the text', () => {
    const tag = controlOf(html, 'Citace');
    expect(tag).toMatch(/^<textarea/);
    expect(tag).toContain('id="bod-statements-0-quote"');
    expect(tag).toMatch(new RegExp(`maxlength="${POINT_LIMITS.quote}"`, 'i'));
    expect(POINT_LIMITS.quote).toBe(1500);
    expect(html).toMatch(/<textarea[^>]*>Děkuji všem\.<\/textarea>/);
    expect(html).not.toContain('Citace (nepovinné)');
  });

  it('takes the ids of the second card from its own place', () => {
    const two = render([bySpeaker(NOVAK), bySpeaker(MALA)]);
    expect(controlOf(two, 'Citace', 1)).toContain('id="bod-statements-1-quote"');
    expect(controlOf(two, 'Kdo', 1)).toContain('id="bod-statements-1-speaker"');
  });
});

describe('Statements: the card’s buttons', () => {
  const html = render([bySpeaker(NOVAK), bySpeaker(MALA)]);

  it('carry the number of the card in their names, and the words on their faces', () => {
    const second = cardOf(html, 2);
    expect(second).toMatch(
      /<button[^>]*aria-label="Nahoru vyjádření č\.\u00a02"[^>]*>Nahoru<\/button>/,
    );
    expect(second).toMatch(
      /<button[^>]*aria-label="Dolů vyjádření č\.\u00a02"[^>]*>Dolů<\/button>/,
    );
    expect(second).toMatch(
      /<button[^>]*aria-label="Odebrat vyjádření č\.\u00a02"[^>]*>Odebrat<\/button>/,
    );
    expect(cardOf(html, 1)).toContain('aria-label="Odebrat vyjádření č.\u00a01"');
  });

  it('give the move buttons the ids focus is sent to', () => {
    expect(cardOf(html, 2)).toContain('id="bod-statements-1-up"');
    expect(cardOf(html, 2)).toContain('id="bod-statements-1-down"');
  });
});

describe('Statements: a speaker outside the people rows', () => {
  it('shows no warning in the card for a speaker picked as „Jiná osoba…“, as readiness is where it lives', () => {
    const html = render([bySpeaker(NOVAK), bySpeaker(STRANGER)]);
    expect(html).not.toContain('už není mezi účastníky');
    expect(html).not.toContain('role="alert"');
  });

  it('keeps all the card’s fields for such a speaker', () => {
    const html = render([bySpeaker(STRANGER)]);
    expect(controlOf(html, 'Citace')).toMatch(/^<textarea/);
  });
});

describe('Statements: refused saves and locking', () => {
  it('shows the message of a refused field under it', () => {
    const html = render([bySpeaker(NOVAK)], {
      issues: { 'statements.0.quote': 'Text je příliš dlouhý.' },
    });
    expect(html).toContain('Text je příliš dlouhý.');
    expect(controlOf(html, 'Citace')).toContain('aria-invalid="true"');
  });

  it('ties the refused message of „Kdo“ to the select, not to a loose line', () => {
    const MESSAGE = 'Mluvčí nelze uložit.';
    const html = render([bySpeaker(NOVAK)], { issues: { 'statements.0.speaker': MESSAGE } });
    const select = controlOf(html, 'Kdo');
    expect(select).toContain('aria-invalid="true"');
    const id = /aria-describedby="([^"]*)"/.exec(select)?.[1]?.split(' ') ?? [];
    expect(id).toContain('bod-statements-0-speaker-error');
    expect(html).toMatch(new RegExp(`<div id="bod-statements-0-speaker-error"[^>]*>.*${MESSAGE}`));
    expect(html.match(/id="[^"]*-speaker-error"/g)).toHaveLength(1);
  });

  it('disables the card while the editor is locked, and makes the text fields read-only', () => {
    const html = render([bySpeaker(NOVAK)], { readOnly: true });
    expect(cardOf(html, 1)).toMatch(/^<fieldset[^>]*\sdisabled=""/);
    expect(controlOf(html, 'Citace')).toMatch(/\sreadonly=""/i);
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Přidat vyjádření<\/button>/);
  });

  it('leaves everything open otherwise', () => {
    const html = render([bySpeaker(NOVAK)]);
    expect(html).not.toMatch(/\sdisabled=""/);
    expect(html).not.toMatch(/\sreadonly=""/i);
  });
});
