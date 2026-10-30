import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { pointTypes } from '@/ui/copy';
import { Form, type FormSpec } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PointTypes } from './index';
import { BulletRows } from './BulletRows';
import type { PointTypesView, TypeView } from './PointTypes';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const OTHER = '1c1d2e3f-4051-4263-8475-8697a8b9cadb';

const type = (over: Partial<TypeView> = {}): TypeView => ({
  id: ID,
  name: 'Soutěž',
  titleGender: 'f',
  defaultBullets: [
    { key: 'hoste', label: 'Hosté', kind: 'people', required: true, role: 'organisers' },
    { key: 'popis', label: 'Popis', kind: 'text', required: false },
  ],
  active: true,
  locked: false,
  position: 2,
  version: 3,
  ...over,
});

const save = vi.fn(async () => ({
  ok: true as const,
  data: { id: ID, version: 4, changed: true },
}));
const render = (view: PointTypesView) =>
  renderToStaticMarkup(<PointTypes view={view} savePointType={save} />);

describe('PointTypes', () => {
  it('has the page title, the intro and clean markup', () => {
    const html = render({ types: [type()] });
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${pointTypes.title}.*</h1>`));
    expect(html).toContain(pointTypes.intro);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('shows a form per type in the order given, a retired one marked as off', () => {
    const html = render({
      types: [type(), type({ id: OTHER, name: 'Výlet', active: false, position: 3 })],
    });
    const titles = [...html.matchAll(/<h3 [^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Soutěž', `Výlet (${pointTypes.list.off})`]);
    expect(html.match(/<form /g)).toHaveLength(3);
  });

  it('starts a form from the type: name, gender, position, active and the bullets in order', () => {
    const html = render({ types: [type()] });
    expect(html).toContain('value="Soutěž"');
    expect(html).toMatch(/<option value="f" selected/);
    expect(html).toContain('value="2"');
    expect(html).toMatch(/name="active"[^>]*checked/);
    expect(html).toContain('name="defaultBullets.0.key" value="hoste"');
    expect(html).toContain('name="defaultBullets.1.key" value="popis"');
    expect(html).toContain('value="Hosté"');
    expect(html).toMatch(/name="defaultBullets\.0\.organisers"[^>]*checked/);
    expect(html).not.toMatch(/name="defaultBullets\.1\.organisers"[^>]*checked/);
  });

  it('tells what a started point keeps and what it follows', () => {
    expect(pointTypes.intro).not.toContain('si odrážky ponechají');
    for (const word of ['povinnost', 'organizátor', 'rod názvu', 'druh']) {
      expect(pointTypes.intro).toContain(word);
    }
  });

  it('fixes the kind of a saved bullet: sent hidden, shown as text, never a select', () => {
    const html = render({ types: [type()] });
    expect(html).toContain('name="defaultBullets.0.kind" value="people"');
    expect(html).toContain('name="defaultBullets.1.kind" value="text"');
    expect(html).not.toContain('name="defaultBullets.0.kind" id=');
    expect(html).not.toMatch(/<select[^>]*name="defaultBullets\.\d\.kind"/);
    expect(html).toContain(pointTypes.bullets.kindFixed(pointTypes.bullets.kinds.people));
  });

  it('lets a new bullet row choose its kind and keeps the organisers box to people rows', () => {
    const rows = [
      { uid: 0, key: '', label: '', kind: 'text', required: false, organisers: false },
      { uid: 1, key: 'hoste', label: 'Hosté', kind: 'people', required: false, organisers: false },
      { uid: 2, key: 'popis', label: 'Popis', kind: 'text', required: false, organisers: false },
    ] as const;
    const spec: FormSpec = Object.fromEntries(
      rows.flatMap((_, i) =>
        ['label', 'kind', 'required', 'organisers'].map((f) => [
          `defaultBullets.${i}.${f}`,
          { label: f },
        ]),
      ),
    );
    const html = renderToStaticMarkup(
      <Form
        id="f"
        spec={spec}
        state={{
          issues: null,
          problem: null,
          attempt: 0,
          submitting: null,
          onSubmit: () => undefined,
        }}
      >
        <BulletRows
          formId="f"
          rows={rows}
          canAdd
          onAdd={vi.fn()}
          onKind={vi.fn()}
          onRemove={vi.fn()}
        />
      </Form>,
    );
    expect(html).toMatch(/<select[^>]*name="defaultBullets\.0\.kind"/);
    expect(html).not.toMatch(/<select[^>]*name="defaultBullets\.1\.kind"/);
    expect(html).toContain('name="defaultBullets.1.organisers"');
    expect(html).not.toContain('name="defaultBullets.2.organisers"');
  });

  it('says only for a new type that an empty position puts it last', () => {
    const saved = render({ types: [type()] });
    const [existing, fresh] = saved.split('id="novy-typ"');
    expect(existing).toContain(pointTypes.fields.position.descriptionSaved);
    expect(existing).not.toContain(pointTypes.fields.position.description);
    expect(fresh).toContain(pointTypes.fields.position.description);
  });

  it('offers no way to switch off the locked type', () => {
    const html = render({ types: [type({ locked: true, name: 'Jiné' })] });
    const form = html.slice(0, html.indexOf('id="novy-typ"'));
    expect(form).toContain(pointTypes.locked);
    expect(form).not.toContain('name="active"');
  });

  it('offers a new type form with an add button, every gender and no bullets yet', () => {
    const html = render({ types: [] });
    expect(html).toContain(pointTypes.list.empty);
    expect(html).toContain(pointTypes.create.save);
    expect(html).toContain(pointTypes.bullets.empty);
    for (const label of Object.values(pointTypes.fields.titleGender.options)) {
      expect(html).toContain(label);
    }
  });

  it('gives every control a label of its own', () => {
    const html = render({ types: [type()] });
    const labelled = [...html.matchAll(/<label[^>]* for="([^"]+)"/g)].map((m) => m[1]);
    const ids = [...html.matchAll(/<(?:input|select)[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(labelled).size).toBe(labelled.length);
    for (const id of ids) expect(labelled).toContain(id);
  });
});
