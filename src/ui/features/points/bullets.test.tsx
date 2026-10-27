import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BulletSpec, DraftPerson } from '@/domain/report';
import { POINT_LIMITS } from '@/domain/report';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';
import { fieldId, Form } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { keyBullets, type KeyedBullet } from './bullet-chips';
import { Bullets } from './Bullets';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, editorSpec } from './editor-form';
import type { PointContentWire } from './fields';

const { points } = cs;

const SPEC: readonly BulletSpec[] = [
  { key: 'organizatori', label: 'Organizátoři', kind: 'people', required: false },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
  { key: 'vysledky', label: 'Výsledky', kind: 'text', required: false },
];

const person = (givenName: string): DraftPerson => ({
  salutation: 'pan',
  givenName,
  familyName: 'Novák',
});

const WIRE: PointContentWire['bullets'] = [
  {
    key: 'organizatori',
    label: 'Organizátoři',
    kind: 'people',
    order: 'input',
    people: [person('Jan')],
  },
  {
    key: 'ucastnici',
    label: 'Účastníci',
    kind: 'people',
    order: 'class-surname',
    people: [person('Eva'), person('Petr'), person('Ivo')],
  },
  { key: 'vysledky', label: 'Výsledky', kind: 'text', text: 'Vyhrál 3.B' },
  { key: 'custom-1', label: 'Hosté', kind: 'people', order: 'input', people: [] },
  { key: 'custom-2', label: '', kind: 'text', text: '' },
];

function render(
  wire: PointContentWire['bullets'] = WIRE,
  options: { readOnly?: boolean; issues?: Record<string, string> } = {},
) {
  const bullets: readonly KeyedBullet[] = keyBullets(wire);
  return renderToStaticMarkup(
    <Form id={EDITOR_FORM_ID} spec={editorSpec(bullets, SPEC)} state={EDITOR_FORM_STATE}>
      <Bullets
        bullets={bullets}
        spec={SPEC}
        issues={options.issues ?? {}}
        readOnly={options.readOnly ?? false}
        today={calDate(2026, 10, 27)}
        recents={[]}
        directory="off"
        onChange={() => undefined}
        onBlur={() => undefined}
      />
    </Form>,
  );
}

/** The control a label points at, as its opening tag. */
function controlOf(html: string, label: string): string {
  const found = new RegExp(
    `<label[^>]*\\sfor="([^"]+)"[^>]*>${label}(?: \\(nepovinné\\))?</label>`,
  ).exec(html);
  if (!found) throw new Error(`No label „${label}“ in the markup`);
  const tag = new RegExp(`<(?:input|textarea|select)[^>]*\\sid="${found[1]}"[^>]*>`).exec(html);
  if (!tag) throw new Error(`The label „${label}“ points at ${found[1]}, which is no control`);
  return tag[0];
}

/** The `<fieldset>` of the people row with this legend, whole. */
function fieldsetOf(html: string, legend: string): string {
  const found = new RegExp(
    `<fieldset(?:(?!</fieldset>).)*?<legend[^>]*>${legend}(?: \\(nepovinné\\))?</legend>.*?</fieldset>`,
    's',
  ).exec(html);
  if (!found) throw new Error(`No row with the legend „${legend}“`);
  return found[0];
}

const removeButtons = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-label="(Odebrat řádek[^"]*)"[^>]*>/g)].map((m) => m[1]);

describe('Bullets: people rows', () => {
  const html = render();

  it('makes each people row a fieldset named by a legend with its label', () => {
    for (const label of ['Organizátoři', 'Účastníci', 'Hosté']) {
      expect(html).toMatch(
        new RegExp(
          `<fieldset[^>]*>(?:(?!</fieldset>).)*?<legend[^>]*>${label}(?: \\(nepovinné\\))?</legend>`,
        ),
      );
    }
  });

  it('names a row with no label by its place', () => {
    expect(html).toContain(points.bullets.unnamed(5));
  });

  it('counts the people under the legend with the plural of the picker', () => {
    expect(html).toContain('1\u00a0osoba');
    expect(html).toContain('3\u00a0osoby');
    expect(html).toContain('0\u00a0osob');
  });

  it('marks an optional people row „(nepovinné)“ in its legend, as an optional text row is', () => {
    expect(html).toMatch(/<legend[^>]*>Organizátoři \(nepovinné\)<\/legend>/);
    expect(html).toMatch(/<legend[^>]*>Hosté \(nepovinné\)<\/legend>/);
  });

  it('marks a required people row with nothing', () => {
    expect(html).toMatch(/<legend[^>]*>Účastníci<\/legend>/);
  });

  it('puts the count after the legend', () => {
    expect(html.indexOf('<legend')).toBeLessThan(html.indexOf('1\u00a0osoba'));
  });

  it('offers „Pořadí“ with its two options, word for word, and the current one selected', () => {
    expect(points.bullets.order).toBe('Pořadí');
    expect(points.bullets.orderOption).toEqual({
      input: 'V\u00a0pořadí zadání',
      'class-surname': 'Podle třídy a\u00a0příjmení',
    });
    const selects = [...html.matchAll(/<select[^>]*>.*?<\/select>/g)].map((m) => m[0]);
    expect(selects).toHaveLength(3);
    const second = selects[1] ?? '';
    expect(second).toMatch(/<option value="input"[^>]*>V\u00a0pořadí zadání<\/option>/);
    expect(second).toMatch(
      /<option value="class-surname" selected=""[^>]*>Podle třídy a\u00a0příjmení<\/option>/,
    );
    expect(second).not.toMatch(/<option value="input" selected/);
    expect(selects[0]).toMatch(/<option value="input" selected=""/);
  });

  it('labels every order select „Pořadí“, tied to it', () => {
    const labels = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"[^>]*>Pořadí<\/label>/g)];
    expect(labels.map((m) => m[1])).toEqual([
      'bod-bullets-0-order',
      'bod-bullets-1-order',
      'bod-bullets-3-order',
    ]);
    for (const [, id] of labels) expect(html).toContain(`<select id="${id}"`);
  });

  it('carries the people, as chips, in the row’s field', () => {
    expect(html).toContain('Eva Novák');
    expect(html).toContain('Ivo Novák');
  });

  it('names the chip list of each row, so the lists are told apart', () => {
    expect(html).toContain(`aria-label="${points.bullets.peopleList('Účastníci')}"`);
    expect(html).toContain(`aria-label="${points.bullets.peopleList('Organizátoři')}"`);
  });

  it('gives the fieldset the id of the readiness path, through the form’s helper', () => {
    const id = fieldId(EDITOR_FORM_ID, 'bullets.1.people');
    expect(id).toBe('bod-bullets-1-people');
    expect(html).toMatch(new RegExp(`<fieldset id="${id}"[^>]*tabindex="-1"`));
  });
});

describe('Bullets: text rows', () => {
  const html = render();

  it('is a label and a textarea', () => {
    expect(controlOf(html, 'Výsledky')).toMatch(/^<textarea/);
  });

  it('caps the text at the contract’s limit and shows the saved text', () => {
    expect(POINT_LIMITS.textBullet).toBe(2000);
    expect(controlOf(html, 'Výsledky')).toMatch(/maxlength="2000"/i);
    expect(html).toMatch(/<textarea[^>]*>Vyhrál 3\.B<\/textarea>/);
  });

  it('marks an optional text row „(nepovinné)“ and takes the id of its readiness path', () => {
    expect(html).toMatch(/for="[^"]+"[^>]*>Výsledky \(nepovinné\)<\/label>/);
    expect(html).toContain(`id="${fieldId(EDITOR_FORM_ID, 'bullets.2.text')}"`);
  });

  it('is no fieldset', () => {
    expect(html).not.toMatch(/<legend[^>]*>Výsledky/);
  });
});

describe('Bullets: removing and adding rows', () => {
  const html = render();

  it('offers no „Odebrat řádek“ on a row the type requires', () => {
    expect(fieldsetOf(html, 'Účastníci')).not.toContain('Odebrat řádek');
  });

  it('offers it on an optional row of the type and on a custom row', () => {
    expect(fieldsetOf(html, 'Organizátoři')).toContain(`>${points.bullets.remove}</button>`);
    expect(fieldsetOf(html, 'Hosté')).toContain(`>${points.bullets.remove}</button>`);
  });

  it('puts the label in the button’s name, or the place while the row has no label', () => {
    expect(removeButtons(html)).toEqual([
      'Odebrat řádek „Organizátoři“',
      'Odebrat řádek „Výsledky“',
      'Odebrat řádek „Hosté“',
      'Odebrat řádek č.\u00a05',
    ]);
  });

  it('offers two plain buttons to add a row, after the rows', () => {
    expect(points.bullets.addPeopleRow).toBe('Přidat řádek s\u00a0osobami');
    expect(points.bullets.addTextRow).toBe('Přidat řádek s\u00a0textem');
    for (const label of [points.bullets.addPeopleRow, points.bullets.addTextRow]) {
      expect(html).toMatch(new RegExp(`<button[^>]*type="button"[^>]*>${label}</button>`));
      expect(html.lastIndexOf('<legend')).toBeLessThan(html.indexOf(label));
    }
  });

  it('shows no notice about the cap while the point has room', () => {
    expect(html).not.toContain(points.bullets.full(POINT_LIMITS.bullets));
  });
});

describe('Bullets: bringing back a row of the type', () => {
  const without = (...keys: string[]) => WIRE.filter((b) => !keys.includes(b.key));
  const restoreButtons = (html: string) =>
    [...html.matchAll(/<button[^>]*>(Vrátit řádek[^<]*)<\/button>/g)].map((m) => m[1]);

  it('offers none while the draft has every row of the type', () => {
    expect(restoreButtons(render())).toEqual([]);
  });

  it('offers one „Vrátit řádek“ for each row of the type the draft lacks, in the type’s order', () => {
    expect(points.bullets.restore('Organizátoři')).toBe('Vrátit řádek „Organizátoři“');
    expect(restoreButtons(render(without('vysledky', 'organizatori')))).toEqual([
      'Vrátit řádek „Organizátoři“',
      'Vrátit řádek „Výsledky“',
    ]);
  });

  it('uses the type’s label, not what the draft calls anything', () => {
    const renamed = without('organizatori').map((b) =>
      b.key === 'custom-1' ? { ...b, label: 'Organizátoři' } : b,
    );
    expect(restoreButtons(render(renamed))).toEqual(['Vrátit řádek „Organizátoři“']);
  });

  it('puts them among the buttons that add a row, as plain buttons', () => {
    const html = render(without('organizatori'));
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Vrátit řádek „Organizátoři“<\/button>/);
    expect(html.lastIndexOf('<legend')).toBeLessThan(html.indexOf('Vrátit řádek'));
  });

  it('disables them while the editor is locked', () => {
    expect(render(without('organizatori'), { readOnly: true })).toMatch(
      /<button[^>]*disabled=""[^>]*>Vrátit řádek/,
    );
  });
});

describe('Bullets: copy', () => {
  it('says the cap with the formal „nejvýše“ and a no-break space before the noun', () => {
    expect(points.bullets.full(POINT_LIMITS.bullets)).toBe('Bod může mít nejvýše 12\u00a0řádků.');
  });
});

describe('Bullets: custom rows', () => {
  const html = render();

  it('give a custom row a „Název řádku“ field, capped at the label limit', () => {
    const tag = controlOf(fieldsetOf(html, 'Hosté'), points.bullets.label);
    expect(tag).toMatch(new RegExp(`maxlength="${POINT_LIMITS.bulletLabel}"`, 'i'));
    expect(tag).toContain('value="Hosté"');
    expect(html.match(new RegExp(`>${points.bullets.label}</label>`, 'g'))).toHaveLength(2);
  });

  it('give a bullet of the type no such field: its label is the type’s', () => {
    expect(fieldsetOf(html, 'Účastníci')).not.toContain(points.bullets.label);
  });

  it('take the id of the readiness path of their label', () => {
    expect(html).toContain(`id="${fieldId(EDITOR_FORM_ID, 'bullets.3.label')}"`);
    expect(html).toContain(`id="${fieldId(EDITOR_FORM_ID, 'bullets.4.label')}"`);
  });
});

describe('Bullets: the controls', () => {
  it('say the search box of every row „Přidat osobu“ inside the row’s legend group', () => {
    const row = fieldsetOf(render(), 'Účastníci');
    expect(row).toContain(`>${points.bullets.addPerson}</label>`);
  });

  it('show the message of a refused save under its control, wired as its error', () => {
    const html = render(WIRE, {
      issues: {
        'bullets.1.people': points.bullets.tooManyPeople,
        'bullets.2.text': 'Text je příliš dlouhý.',
      },
    });
    expect(fieldsetOf(html, 'Účastníci')).toContain(points.bullets.tooManyPeople);
    const id = fieldId(EDITOR_FORM_ID, 'bullets.1.people');
    expect(fieldsetOf(html, 'Účastníci')).toContain(`aria-describedby="${id}-error"`);
    expect(html).toMatch(
      new RegExp(`id="${id}-error"[^>]*>(?:(?!</div>).)*${points.bullets.tooManyPeople}`),
    );
    expect(controlOf(html, 'Výsledky')).toContain('aria-invalid="true"');
    expect(html).toContain('Text je příliš dlouhý.');
  });

  it('show no message without issues', () => {
    expect(render()).not.toContain('aria-invalid="true"');
  });

  it('are disabled together while the editor is locked', () => {
    const html = render(WIRE, { readOnly: true });
    expect(fieldsetOf(html, 'Účastníci')).toMatch(/^<fieldset[^>]*\sdisabled=""/);
    expect(fieldsetOf(html, 'Hosté')).toMatch(/^<fieldset[^>]*\sdisabled=""/);
    expect(controlOf(html, 'Výsledky')).toMatch(/readonly/i);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Přidat řádek s\u00a0osobami/);
  });

  it('are enabled otherwise', () => {
    expect(render()).not.toMatch(/\sdisabled=/);
  });

  it('is clean for the Content-Security-Policy, with no style attribute', () => {
    const html = render();
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(html).not.toContain('style=');
  });

  it('renders no row for no bullets, only the buttons', () => {
    const html = render([]);
    expect(html).not.toContain('<fieldset');
    expect(html).toContain(points.bullets.addPeopleRow);
  });
});
