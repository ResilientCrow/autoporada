import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../test/support/markup';

import { buttonStyles } from './button-styles';
import {
  ArrowLink,
  BulletList,
  Button,
  Card,
  Cluster,
  Columns,
  Disclosure,
  FactList,
  Item,
  ItemList,
  Meta,
  Notice,
  PageHeader,
  Section,
  SlantLabel,
  Stack,
  StatusChip,
} from './index';

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

describe('StatusChip', () => {
  it.each(['neutral', 'waiting', 'done', 'attention', 'stopped'] as const)(
    '%s has an icon hidden from assistive technology, its text, and no role',
    (tone) => {
      const out = html(<StatusChip tone={tone}>{TEXT}</StatusChip>);
      expect(out).toMatch(/<svg aria-hidden="true"/);
      expect(out).toContain(`${TEXT}</span>`);
      expect(out).not.toContain('role=');
      expect(cspMarkupProblems(out)).toEqual([]);
    },
  );

  it('draws every tone with a different icon', () => {
    const shapes = (['neutral', 'waiting', 'done', 'attention', 'stopped'] as const).map(
      (tone) => /<path d="([^"]+)"/.exec(html(<StatusChip tone={tone}>{TEXT}</StatusChip>))?.[1],
    );
    expect(new Set(shapes).size).toBe(5);
  });

  it('uses the accent as a background only here', () => {
    expect(html(<StatusChip tone="attention">{TEXT}</StatusChip>)).toContain('bg-accent');
    expect(html(<StatusChip tone="done">{TEXT}</StatusChip>)).not.toContain('accent');
  });
});

describe('Notice', () => {
  it.each([
    ['info', 'status'],
    ['problem', 'alert'],
  ] as const)('%s announces itself as %s', (tone, role) => {
    const out = html(<Notice tone={tone}>{TEXT}</Notice>);
    expect(out).toContain(`role="${role}"`);
    expect(out).toMatch(/<svg aria-hidden="true"/);
    expect(out).toContain(`<div>${TEXT}</div>`);
    expect(out).not.toMatch(/sr-only|hidden(?!=)/);
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it.each(['info', 'problem'] as const)('%s has no role when not live', (tone) => {
    expect(
      html(
        <Notice tone={tone} live={false}>
          {TEXT}
        </Notice>,
      ),
    ).not.toContain('role=');
  });
});

describe('buttonStyles', () => {
  it.each([
    ['primary', 'bg-digital text-light'],
    ['secondary', 'bg-light text-digital'],
    ['onDark', 'bg-transparent text-light'],
  ] as const)('%s', (variant, look) => {
    const styles = buttonStyles(variant);
    expect(styles).toContain(look);
    expect(styles).toContain('min-h-11');
    expect(styles).toContain('w-fit');
    expect(styles).toContain('no-underline');
    expect(styles).not.toMatch(/opacity|outline/);
  });

  it('is primary by default', () => {
    expect(buttonStyles()).toBe(buttonStyles('primary'));
  });
});

describe('Button', () => {
  it('is a native button with its type, name and value', () => {
    const out = html(
      <Button type="submit" name="scope" value="all">
        {TEXT}
      </Button>,
    );
    expect(out).toMatch(/^<button /);
    expect(out).toContain('type="submit"');
    expect(out).toContain('name="scope"');
    expect(out).toContain('value="all"');
    expect(out).toContain(buttonStyles('primary'));
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('is a plain button by default, in the variant asked for', () => {
    const out = html(<Button variant="secondary">{TEXT}</Button>);
    expect(out).toContain('type="button"');
    expect(out).toContain(buttonStyles('secondary'));
  });

  it('is disabled when asked', () => {
    expect(html(<Button isDisabled>{TEXT}</Button>)).toMatch(/<button [^>]*disabled=""/);
  });

  it('marks itself pending', () => {
    expect(html(<Button isPending>{TEXT}</Button>)).toContain('data-pending="true"');
  });
});

describe('layout primitives', () => {
  it('Stack takes its gap from the scale and the tag it is asked for', () => {
    expect(html(<Stack>{TEXT}</Stack>)).toBe(`<div class="flex flex-col gap-4">${TEXT}</div>`);
    expect(html(<Stack gap="item">{TEXT}</Stack>)).toContain('gap-2');
    expect(html(<Stack gap="section">{TEXT}</Stack>)).toContain('gap-8');
    expect(html(<Stack as="ul">{TEXT}</Stack>)).toMatch(/^<ul /);
  });

  it('Cluster wraps and aligns', () => {
    const out = html(<Cluster as="p">{TEXT}</Cluster>);
    expect(out).toBe(`<p class="flex flex-wrap items-center gap-x-3 gap-y-2">${TEXT}</p>`);
  });

  it('Columns has the two breakpoints', () => {
    expect(html(<Columns at="sm">{TEXT}</Columns>)).toContain('sm:grid-cols-2');
    expect(html(<Columns at="lg">{TEXT}</Columns>)).toContain('lg:grid-cols-2 lg:items-start');
  });

  it('Section is named by its heading when it has an id, and can be divided', () => {
    const out = html(
      <Section title={TEXT} headingId="x" divided>
        {cs.gallery.intro}
      </Section>,
    );
    expect(out).toContain('<section aria-labelledby="x"');
    expect(out).toContain('border-t border-ink pt-6');
    expect(out).toContain(`<h2 id="x">${TEXT}</h2>`);
    expect(html(<Section title={TEXT}>{TEXT}</Section>)).not.toContain('aria-labelledby');
    expect(
      html(
        <Section title={TEXT} level={3}>
          {TEXT}
        </Section>,
      ),
    ).toContain('<h3>');
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('Card spaces its title and body', () => {
    const out = html(<Card title={TEXT}>{cs.gallery.intro}</Card>);
    expect(out).toContain('p-4 sm:p-6');
    expect(out).toContain('class="text-lg"');
    expect(out).toContain(`<div class="flex flex-col gap-4">${cs.gallery.intro}</div>`);
  });

  it('PageHeader has one h1 and a meta row only when given one', () => {
    const out = html(<PageHeader title={TEXT}>{cs.gallery.intro}</PageHeader>);
    expect(out).toMatch(/^<header class="flex flex-col items-start gap-3"><h1 /);
    expect(out).toContain(`gap-y-2">${cs.gallery.intro}</div>`);
    expect(html(<PageHeader title={TEXT} />)).not.toContain('<div');
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('Item is a row with a title line, optional heading and badges', () => {
    const out = html(
      <ItemList>
        <Item
          title={TEXT}
          heading={3}
          headingId="i"
          badges={<StatusChip tone="done">{TEXT}</StatusChip>}
        >
          <Meta>{cs.gallery.intro}</Meta>
        </Item>
        <Item title={TEXT} />
      </ItemList>,
    );
    expect(out).toMatch(/^<ul class="flex flex-col divide-y divide-ink">/);
    expect(out).toContain('py-3 first:pt-0 last:pb-0');
    expect(out).toContain(`<h3 id="i" class="text-base">${TEXT}</h3>`);
    expect(out).toContain(`<p class="text-sm">${cs.gallery.intro}</p>`);
    expect(out).toContain(`>${TEXT}</span>`);
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('BulletList and FactList', () => {
    expect(html(<BulletList>{TEXT}</BulletList>)).toContain('list-disc');
    const out = html(<FactList rows={[['Termín', 'Pondělí']]} />);
    expect(out).toContain('<dt class="font-bold">Termín</dt><dd>Pondělí</dd>');
  });

  it('Disclosure is a closed details with a hidden chevron', () => {
    const out = html(<Disclosure summary={TEXT}>{cs.gallery.intro}</Disclosure>);
    expect(out).toMatch(/^<details class="group"><summary class="summary-plain [^"]*min-h-11/);
    expect(out).toContain('<svg aria-hidden="true"');
    expect(out).not.toContain('open=');
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('SlantLabel level 1 is smaller on phones', () => {
    expect(html(<SlantLabel level={1}>{TEXT}</SlantLabel>)).toContain('text-2xl sm:text-3xl');
  });
});
