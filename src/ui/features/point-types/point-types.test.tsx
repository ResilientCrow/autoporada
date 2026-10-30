import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { pointTypes } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PointTypes } from './index';
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
