import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs, type PrivacyCopy } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PrivacyNotice } from './index';

const draft: PrivacyCopy = cs.privacy;
const approved: PrivacyCopy = { ...draft, approved: true, effectiveFrom: '1.\u00A09.\u00A02027' };
const render = (notice: PrivacyCopy) => renderToStaticMarkup(<PrivacyNotice notice={notice} />);

describe('PrivacyNotice', () => {
  const html = render(draft);

  it('has one h1 and shows the draft banner, not live, while unapproved', () => {
    expect(html.match(/<h1 /g)).toHaveLength(1);
    expect(html).toContain(draft.draft);
    expect(html).not.toMatch(/role="(status|alert)"/);
    expect(html).not.toContain(draft.effectiveLabel);
  });

  it('drops the banner and states the date once approved', () => {
    const done = render(approved);
    expect(done).not.toContain(draft.draft);
    expect(done).toContain(`${draft.effectiveLabel} ${approved.effectiveFrom}`);
  });

  it('shows the summary as a card with its bullets', () => {
    expect(html).toMatch(new RegExp(`<h2 [^>]*>${draft.summaryTitle}</h2>`));
    for (const bullet of draft.summary) expect(html).toContain(bullet);
  });

  it('links every table-of-contents entry to a section heading', () => {
    const nav = /<nav [^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/nav>/.exec(html);
    expect(nav?.[1]).toBe(draft.tocLabel);
    const targets = [...(nav?.[2] ?? '').matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(targets).toEqual(draft.sections.map((section) => section.id));
    for (const section of draft.sections) {
      expect(html).toMatch(
        new RegExp(`<h2 id="${section.id}"[^>]*>${section.title.replace('?', '\\?')}</h2>`),
      );
    }
  });

  it('renders facts as a description list and links as plain anchors', () => {
    expect(html).toContain('<dl ');
    expect(html).not.toContain('<table');
    expect(html).toMatch(
      /<dd><a href="https:\/\/ssps\.cz\/[^"]*">Povinně zveřejňované údaje<\/a><\/dd>/,
    );
  });

  it('marks every flagged block or row with the chip, the reviewer and the task', () => {
    const reviews = draft.sections
      .flatMap((section) => section.blocks)
      .flatMap((block) => [block, ...(block.kind === 'facts' ? block.rows : [])])
      .flatMap((part) => (part.review === undefined ? [] : [part.review]));
    expect(reviews.length).toBeGreaterThan(0);
    expect(html.match(new RegExp(`${draft.reviewLabel}<\\/span>`, 'g'))).toHaveLength(
      reviews.length,
    );
    for (const review of reviews) {
      expect(html).toContain(`${draft.reviewBy[review.by]} ${review.note}`);
    }
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(cspMarkupProblems(render(approved))).toEqual([]);
  });
});
