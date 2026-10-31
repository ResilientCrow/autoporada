import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { profile } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Profile } from './index';

const setReminders = vi.fn(async () => ({ ok: true as const, data: { changed: true } }));
const render = (remindDeadline: boolean) =>
  renderToStaticMarkup(<Profile view={{ remindDeadline }} setReminders={setReminders} />);

const checkbox = (html: string) => /<input [^>]*type="checkbox"[^>]*>/.exec(html)?.[0] ?? '';

describe('Profile', () => {
  it('has the page title as the one h1, a section heading and an empty status region', () => {
    const html = render(true);
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${profile.title}.*</h1>`));
    expect(html.match(/<h1 /g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h2 [^>]*tabindex="-1"[^>]*>${profile.reminders.title}</h2>`));
    expect(html).toContain('<div role="status"></div>');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('offers the reminders box with its label and what it covers', () => {
    const html = render(true);
    expect(html).toContain(profile.reminders.label);
    expect(html).toContain(profile.reminders.description);
    expect(checkbox(html)).toContain('name="on"');
    expect(html).toContain(`${profile.reminders.save}</button>`);
    expect(html).toContain('<noscript>');
  });

  it('shows the box ticked while the reminders are on, and clear when they are off', () => {
    expect(checkbox(render(true))).toContain('checked');
    expect(checkbox(render(false))).not.toContain('checked');
  });

  it('does not mark the box as optional: it is a switch', () => {
    expect(render(true)).not.toContain('nepovinné');
  });
});
