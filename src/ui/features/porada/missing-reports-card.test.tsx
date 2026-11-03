import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { MissingReportsCard } from './index';

const tally = { monday: '2026-11-09', meetingDate: '2026-11-10', owed: 5, missing: 2 };

describe('MissingReportsCard', () => {
  it('counts the reports the working porada lacks and links „Chybějící zprávy“ (ADR 0052)', () => {
    const html = renderToStaticMarkup(<MissingReportsCard tally={tally} />);
    expect(html).toContain(`>${cs.porada.missing.title}</h2>`);
    expect(html).toContain('href="/porada/2026-11-09/zpravy"');
    // The porada is named by the day it is held.
    expect(html).toContain('Zprávy z\u00a0akcí pro poradu 10.\u00a011.: neodevzdáno 2 z\u00a05');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says none is missing as a count too', () => {
    const html = renderToStaticMarkup(<MissingReportsCard tally={{ ...tally, missing: 0 }} />);
    expect(html).toContain('neodevzdáno 0 z\u00a05');
  });
});
