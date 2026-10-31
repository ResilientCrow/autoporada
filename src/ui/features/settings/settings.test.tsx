import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { settings } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { differsFromSaved } from './inputs';
import { Settings, type SettingsView } from './Settings';

const VIEW: SettingsView = {
  deadline: { rule: { dayOffset: -2, time: '20:00' }, version: 3 },
  reminders: { value: { soft: true, hard: false }, version: 2 },
  annex1: {
    value: {
      heading: 'Příloha 1: Talent',
      intro: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { indent: 0 },
            content: [{ type: 'text', text: 'Úvodní věta.' }],
          },
        ],
      },
    },
    version: 5,
  },
  effect: { keep: '9. 11. 2026', day: 'sobota', time: '20:00', from: '16. 11. 2026' },
};

const save = vi.fn(async () => ({ ok: true as const, data: { version: 4, changed: true } }));
const render = (view: SettingsView = VIEW) =>
  renderToStaticMarkup(<Settings view={view} saveSettings={save as never} />);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/[ \t\n]+/g, ' ');

describe('Settings', () => {
  it('has the title, the three forms in their sections and clean markup', () => {
    const html = render();
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${settings.title}.*</h1>`));
    for (const id of ['uzaverka', 'pripominky', 'priloha-1']) expect(html).toContain(`id="${id}"`);
    expect(html.match(/<form /g)).toHaveLength(3);
    expect(html.match(new RegExp(`>${settings.save}<`, 'g'))).toHaveLength(3);
    expect(html).toContain('href="/nastaveni/typy-bodu"');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('shows the deadline rule with its example for a Monday porada', () => {
    const t = text(render());
    expect(t).toContain(settings.deadline.dayOptions[2]);
    expect(t).toContain('20:00');
    expect(t).toContain(settings.deadline.example('sobota', '20:00'));
    expect(t).toContain('U\u00a0pondělní porady: sobota 20:00');
  });

  it('follows another rule in the example line', () => {
    const t = text(
      render({ ...VIEW, deadline: { rule: { dayOffset: -4, time: '08:15' }, version: 1 } }),
    );
    expect(t).toContain(settings.deadline.example('čtvrtek', '8:15'));
  });

  it('marks the day and time selects of the deadline as required', () => {
    const html = render();
    for (const name of ['value.dayOffset', 'value.time']) {
      expect(html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>`))?.[0]).toContain(
        'aria-required="true"',
      );
    }
  });

  it('says nothing of an effect while the selects hold the saved rule', () => {
    const t = text(render());
    expect(t).not.toContain(
      settings.deadline.effect('9. 11. 2026', 'sobota', '20:00', '16. 11. 2026'),
    );
    expect(t).not.toContain('Ručně nastavené uzávěrky se nemění');
  });

  it('writes the effect line with the porada, its deadline and the next one', () => {
    expect(settings.deadline.effect('9. 11. 2026', 'sobota', '20:00', '16. 11. 2026')).toBe(
      'Uzávěrka porady 9. 11. 2026 zůstává sobota 20:00. Nové pravidlo platí od porady 16. 11. 2026. Ručně nastavené uzávěrky se nemění.',
    );
  });

  describe('differsFromSaved', () => {
    const saved = { dayOffset: -2, time: '20:00' };
    it.each([
      ['2', '20:00', false],
      ['3', '20:00', true],
      ['2', '18:15', true],
    ])('days %s at %s: %s', (days, time, differs) => {
      expect(differsFromSaved(saved, days, time)).toBe(differs);
    });
  });

  it('checks the reminders the view has on and leaves the other off', () => {
    const html = render();
    const box = (name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
    expect(box('value.soft')).toContain('checked');
    expect(box('value.hard')).toBeDefined();
    expect(box('value.hard')).not.toContain('checked');
  });

  it('fills the annex heading and intro from the saved texts', () => {
    const html = render();
    expect(html).toContain('Příloha 1: Talent');
    expect(html).toContain('Úvodní věta.');
  });
});
