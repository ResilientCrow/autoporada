import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { future } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PlacementStrip } from './PlacementStrip';
import type { StripItem, StripWindow } from './placement';

const WINDOW: StripWindow = {
  stripFrom: '2026-11-09',
  plannedThrough: '2026-11-16',
  issues: [{ monday: '2026-11-09', meetingDate: '2026-11-09', status: 'open' }],
};
const ITEM: StripItem = { kind: 'akce', startDate: '2026-11-17', endDate: null };
const render = (item: StripItem = ITEM) =>
  renderToStaticMarkup(<PlacementStrip item={item} window={WINDOW} />);

describe('PlacementStrip', () => {
  it('is a titled list with one line per Monday, the date first', () => {
    const html = render();
    expect(html).toContain(`>${future.strip.title}</h2>`);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain('9.\u00a011.: v\u00a0přehledu akcí');
    expect(html).toContain('23.\u00a011.: už ne');
  });

  it('leaves out a Monday that has no porada', () => {
    expect(render()).not.toContain('16.\u00a011.:');
    expect(render().match(/<li>/g)).toHaveLength(3);
  });

  it('renders nothing for an item with no date', () => {
    expect(render({ ...ITEM, startDate: null })).toBe('');
  });

  it('is clean for the CSP', () => {
    expect(cspMarkupProblems(render())).toEqual([]);
  });
});
