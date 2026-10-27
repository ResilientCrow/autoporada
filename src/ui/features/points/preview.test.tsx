import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { PointContentWire } from './fields';
import { LayoutToggle } from './LayoutToggle';
import { Preview } from './Preview';

const { points } = cs;

const para = (text: string) => ({
  type: 'paragraph' as const,
  attrs: { indent: 0 },
  content: [{ type: 'text' as const, text }],
});

const CONTENT: PointContentWire = {
  title: 'Exkurze do Terezína',
  eventDate: '2027-01-14',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: 'Žáci navštívili památník.',
  openingEdited: true,
  body: { type: 'doc', content: [para('Druhý odstavec')] },
  bullets: [],
  statements: [],
};

const person = (salutation: 'pan' | 'pani' | null, familyName: string) => ({
  salutation,
  givenName: 'Jana',
  familyName,
});

const preview = (content: PointContentWire = CONTENT) =>
  renderToStaticMarkup(<Preview content={content} schoolYear="2026/2027" />);

describe('Preview', () => {
  it('is a section named „Náhled bodu“ holding the point as the document prints it', () => {
    const html = preview();
    expect(html).toMatch(new RegExp(`<section [^>]*aria-label="${points.preview.label}"`));
    expect(html).toContain('Exkurze do Terezína');
    expect(html).toContain('Žáci navštívili památník.');
    expect(html).toContain('Druhý odstavec');
  });

  it('asks for a title and a start date while one is missing, with no notice', () => {
    // Each also omits something (an empty text bullet), so a notice would show if one were allowed.
    const omitting = [{ key: 'a', label: 'Výsledky', kind: 'text' as const, text: ' ' }];
    for (const content of [
      { ...CONTENT, title: '', bullets: omitting },
      { ...CONTENT, eventDate: null, bullets: omitting },
    ]) {
      const html = preview(content);
      expect(html).toContain('Náhled se zobrazí, až vyplníte název a\u00a0datum začátku.');
      expect(html).not.toContain('se v\u00a0náhledu nezobrazí');
      expect(html).not.toContain('Druhý odstavec');
    }
  });

  it('scrolls inside itself on the wide layout, and is focusable so the keyboard can scroll it', () => {
    const section = /<section [^>]*>/.exec(preview())?.[0] ?? '';
    expect(section).toContain('tabindex="0"');
    expect(section).toMatch(/class="[^"]*\blg:pane-fit\b/);
  });

  it('keeps the section when there is nothing to show', () => {
    expect(preview({ ...CONTENT, title: '' })).toContain(`aria-label="${points.preview.label}"`);
  });

  it('shows no notice when nothing was left out', () => {
    expect(preview()).not.toContain('se v\u00a0náhledu nezobrazí');
  });

  it('names the people left out', () => {
    const html = preview({
      ...CONTENT,
      bullets: [
        {
          key: 'ucastnici',
          label: 'Účastníci',
          kind: 'people',
          order: 'input',
          people: [person('pan', 'Novák'), person(null, 'Svoboda'), person('pani', '')],
        },
      ],
    });
    expect(html).toContain('Osoby bez oslovení nebo příjmení se v\u00a0náhledu nezobrazí: 2.');
    expect(html).not.toContain('Prázdné nebo nepojmenované');
    expect(html).not.toContain('Neúplná vyjádření');
  });

  it('names the rows left out', () => {
    const html = preview({
      ...CONTENT,
      bullets: [
        { key: 'a', label: 'Výsledky', kind: 'text', text: '  ' },
        { key: 'b', label: 'Účastníci', kind: 'people', order: 'input', people: [] },
      ],
    });
    expect(html).toContain('Prázdné nebo nepojmenované řádky se v\u00a0náhledu nezobrazí: 2.');
  });

  it('names the statements left out', () => {
    const html = preview({
      ...CONTENT,
      statements: [{ speaker: person('pan', 'Novák'), speakerGenitive: '', quote: 'Text.' }],
    });
    expect(html).toContain('Neúplná vyjádření se v\u00a0náhledu nezobrazí: 1.');
  });

  it('writes no style attribute and nothing a content security policy refuses', () => {
    expect(cspMarkupProblems(preview())).toEqual([]);
    expect(preview()).not.toContain('style=');
  });
});

const FORM_PANE = 'obsah formuláře';
const PREVIEW_PANE = 'obsah náhledu';

describe('LayoutToggle', () => {
  const html = renderToStaticMarkup(
    <LayoutToggle form={<p>{FORM_PANE}</p>} preview={<p>{PREVIEW_PANE}</p>} />,
  );

  it('puts both panes in the markup, so the page works before it hydrates', () => {
    expect(html).toContain('obsah formuláře');
    expect(html).toContain('obsah náhledu');
  });

  it('is a radio group with the catalogue legend and the two labelled radios, the form checked', () => {
    expect(html).toMatch(new RegExp(`<legend[^>]*>${points.layout.legend}</legend>`));
    const radios = [...html.matchAll(/<input [^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('value="form"');
    expect(radios[0]).toMatch(/checked/);
    expect(radios[1]).toContain('value="preview"');
    expect(radios[1]).not.toMatch(/checked=""/);
    expect(html).toContain(`>${points.layout.form}</span>`);
    expect(html).toContain(`>${points.layout.preview}</span>`);
  });

  it('hides the radio group until hydrated: without scripts the form shows alone', () => {
    expect(html).toMatch(/<fieldset [^>]*class="(?:[^"]* )?hidden(?: [^"]*)?"/);
  });

  it('hides the preview pane by a class below the wide layout, and the form pane never', () => {
    expect(html).toMatch(
      /<div class="[^"]*\bhidden\b[^"]*\blg:sticky\b[^"]*\blg:top-4\b[^"]*\blg:block\b[^"]*"><p>obsah náhledu<\/p>/,
    );
    expect(html).not.toMatch(/<div class="[^"]*\bhidden\b[^"]*"><p>obsah formuláře/);
  });

  it('writes no style attribute and nothing a content security policy refuses', () => {
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
