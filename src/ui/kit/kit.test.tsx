import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../test/support/markup';

import { ArrowLink, Card, SlantLabel } from './index';

const TEXT = cs.gallery.title;
const html = renderToStaticMarkup;

describe('SlantLabel', () => {
  it.each([1, 2, 3] as const)('is a level %i heading with the text standing upright', (level) => {
    const out = html(<SlantLabel level={level}>{TEXT}</SlantLabel>);
    expect(out).toMatch(new RegExp(`^<h${level} [^>]*>.*</h${level}>$`));
    expect(out).toContain(`<span class="inline-block skew-x-12">${TEXT}</span>`);
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('is a plain span without a level', () => {
    const out = html(<SlantLabel>{TEXT}</SlantLabel>);
    expect(out).toMatch(/^<span /);
    expect(out).not.toMatch(/<h\d/);
  });
});

describe('Card', () => {
  it.each([
    [undefined, 'h2'],
    [2, 'h2'],
    [3, 'h3'],
  ] as const)('puts its title at level %s as %s', (level, tag) => {
    const out = html(
      <Card title={TEXT} level={level}>
        {cs.gallery.intro}
      </Card>,
    );
    expect(out).toContain(`<${tag} `);
    expect(out).toContain(cs.gallery.intro);
    expect(out).not.toMatch(/role=|<section|<aside|<nav/);
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('has no heading without a title', () => {
    expect(html(<Card>{TEXT}</Card>)).not.toMatch(/<h\d/);
  });
});

describe('ArrowLink', () => {
  it('links to the page, with the arrow hidden from assistive technology', () => {
    const out = html(<ArrowLink href="/vzornik">{TEXT}</ArrowLink>);
    expect(out).toContain('href="/vzornik"');
    expect(out).toMatch(/<svg aria-hidden="true"/);
    expect(cspMarkupProblems(out)).toEqual([]);
  });
});
