import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../test/support/markup';

import { BackLink } from './BackLink';
import { buttonStyles } from './button-styles';
import {
  ArrowLink,
  BulletList,
  Button,
  ButtonLink,
  Card,
  Cluster,
  Columns,
  Dialog,
  Disclosure,
  DownloadLink,
  FactList,
  InPageLink,
  Item,
  ItemLink,
  ItemList,
  Meta,
  Notice,
  PageHeader,
  Section,
  SlantLabel,
  Stack,
  StatusChip,
  TextLink,
} from './index';

const TEXT = cs.gallery.title;
const html = renderToStaticMarkup;

describe('SlantLabel', () => {
  it.each([1, 2, 3] as const)('is a level %i heading, upright (no slanted edges)', (level) => {
    const out = html(<SlantLabel level={level}>{TEXT}</SlantLabel>);
    expect(out).toMatch(new RegExp(`^<h${level} [^>]*>.*</h${level}>$`));
    expect(out).toContain(`>${TEXT}</h${level}>`);
    expect(out).not.toMatch(/skew|rotate/);
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

  it('puts the aside after its content, in a row from sm up', () => {
    const out = html(
      <Card title={TEXT} aside={<Button>{cs.porada.skip.title}</Button>}>
        {cs.gallery.intro}
      </Card>,
    );
    expect(out.indexOf(cs.gallery.intro)).toBeLessThan(
      out.indexOf(`${cs.porada.skip.title}</button>`),
    );
    expect(out).toContain('sm:flex-row');
    expect(html(<Card title={TEXT}>{TEXT}</Card>)).not.toContain('sm:flex-row');
    expect(cspMarkupProblems(out)).toEqual([]);
  });
});

describe('Dialog', () => {
  it('renders only its trigger while closed', () => {
    const out = html(
      <Dialog
        title={TEXT}
        isOpen={false}
        onOpenChange={() => undefined}
        trigger={<Button>{cs.porada.skip.title}</Button>}
      >
        {cs.gallery.intro}
      </Dialog>,
    );
    expect(out).toContain(`${cs.porada.skip.title}</button>`);
    expect(out).not.toContain(TEXT);
    expect(out).not.toContain(cs.gallery.intro);
    expect(cspMarkupProblems(out)).toEqual([]);
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
    ['primary', 'bg-accent text-ink'],
    ['secondary', 'bg-light text-ink'],
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

  it('SlantLabel level 1 is smaller on phones (Arch type scale)', () => {
    expect(html(<SlantLabel level={1}>{TEXT}</SlantLabel>)).toContain(
      'text-4xl leading-tight sm:text-5xl',
    );
  });
});

describe('link kinds', () => {
  it('TextLink is a plain, unprefetched link', () => {
    const out = html(<TextLink href="/vzornik">{TEXT}</TextLink>);
    expect(out).toBe(`<a href="/vzornik">${TEXT}</a>`);
  });

  it('InPageLink points at a hash and is a block of its own', () => {
    const out = html(<InPageLink id="cil">{TEXT}</InPageLink>);
    expect(out).toContain('href="#cil"');
    expect(out).toContain('inline-block w-fit py-1');
  });

  it('ItemLink is bold, natural width, and can be named and described', () => {
    const out = html(
      <ItemLink href="/body/1" id="t" describedBy="d">
        {TEXT}
      </ItemLink>,
    );
    expect(out).toContain('id="t"');
    expect(out).toContain('aria-describedby="d"');
    expect(out).toContain('class="w-fit font-bold"');
  });

  it('BackLink leads with a hidden arrow and a no-break space', () => {
    const out = html(<BackLink href="/akce">{TEXT}</BackLink>);
    expect(out).toMatch(/^<a [^>]*href="\/akce"[^>]*><svg aria-hidden="true"/);
    expect(out).toContain(`</svg>\u00a0${TEXT}</a>`);
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('ArrowLink and DownloadLink end in their icon after a no-break space', () => {
    expect(html(<ArrowLink href="/vzornik">{TEXT}</ArrowLink>)).toContain(`${TEXT}\u00a0<svg`);
    const download = html(<DownloadLink href="/porada/x/dokument/docx">{TEXT}</DownloadLink>);
    // No `download` attribute: a failed download answers 303 to the archive, and a download link
    // would save that page as a file instead of showing its notice.
    expect(download).not.toMatch(/\sdownload[=\s>]/);
    expect(download).toContain('w-fit font-bold');
    expect(download).toContain(`${TEXT}\u00a0<svg`);
    expect(download).not.toContain('underline');
  });

  it('ButtonLink looks like a button and marks the current page', () => {
    const other = html(
      <ButtonLink href="/body/novy" variant="secondary">
        {TEXT}
      </ButtonLink>,
    );
    expect(other).toContain(buttonStyles('secondary'));
    expect(other).not.toContain('aria-current');
    const current = html(
      <ButtonLink href="/body/novy" variant="secondary" current>
        {TEXT}
      </ButtonLink>,
    );
    expect(current).toContain('aria-current="page"');
    expect(current).toContain(buttonStyles('primary'));
  });

  it('PageHeader puts the back link above the title', () => {
    const out = html(<PageHeader title={TEXT} back={{ href: '/akce', label: cs.gallery.intro }} />);
    expect(out.indexOf('href="/akce"')).toBeGreaterThan(0);
    expect(out.indexOf('href="/akce"')).toBeLessThan(out.indexOf('<h1'));
  });
});
