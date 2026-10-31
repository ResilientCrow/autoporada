import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Gallery } from './index';

vi.mock('next/navigation', () => ({
  usePathname: () => '/vzornik',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Gallery', () => {
  const html = renderToStaticMarkup(<Gallery />);

  it('has its heading', () => {
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.gallery.title}.*</h1>`));
  });

  it.each([
    cs.gallery.statuses.title,
    cs.gallery.statusMaps.title,
    cs.gallery.buttons.title,
    cs.gallery.layout.title,
    cs.gallery.lists.title,
    cs.gallery.disclosure.title,
    cs.gallery.notices.title,
    cs.gallery.forms.title,
    cs.gallery.forms.controls.title,
    cs.gallery.people.title,
    cs.gallery.autosave.title,
    cs.gallery.problems.title,
  ])('has the section %s', (title) => {
    expect(html).toMatch(new RegExp(`<h2 [^>]*>${title}</h2>`));
  });

  it('shows all five chips and both notices, none of them live', () => {
    for (const label of Object.values(cs.gallery.statuses).slice(1)) expect(html).toContain(label);
    expect(html).toContain(cs.gallery.notices.info);
    expect(html).toContain(cs.gallery.notices.problem);
    // The live form's region, and two per people field (the directory notice and the announcements);
    // the autosave demo has none (its banners are alerts); the kit notices above carry no role,
    // and the off box's notice is its only text in a region.
    expect(html.match(/role="status"/g)).toHaveLength(7);
    expect(html.match(/<p id="[^"]+" role="status" data-live-announcer="true">[^<]/g)).toHaveLength(
      1,
    );
  });

  it('shows the error form with its issues and the plain form without', () => {
    expect(html).toContain(cs.gallery.forms.failed.reasonTooLong);
    expect(html).toContain(cs.fieldIssues.required);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(5);
    // Two summaries, plus one problem notice per code (eleven).
    expect(html.match(/role="alert"/g)).toHaveLength(13);
    expect(html).toContain(cs.form.summaryTitle);
  });

  it('shows a select, a checkbox and a radio group, clean and with an issue each', () => {
    const { controls } = cs.gallery.forms;
    expect(html.match(/<select /g)).toHaveLength(2);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/<fieldset [^>]*role="radiogroup"/g)).toHaveLength(2);
    expect(html).toMatch(/<fieldset [^>]*role="radiogroup"[^>]*aria-invalid="true"/);
    expect(html).toContain(controls.roleHint);
    expect(html).toContain(cs.fieldIssues.invalid);
    expect(html).toMatch(/<select [^>]*aria-invalid="true"/);
    expect(html).toMatch(/<input [^>]*type="checkbox"[^>]*aria-invalid="true"/);
  });

  it('shows a problem notice for every code', () => {
    for (const label of Object.values(cs.gallery.problems.code)) expect(html).toContain(label);
    expect(html).toContain(`${cs.app.errorCode} abcdef12-3456`);
    expect(html).toContain('returnTo=%2Fvzornik');
  });

  it('has the live form, quiet until submitted', () => {
    expect(html).toContain(cs.gallery.forms.live.name);
    expect(html).not.toContain(cs.gallery.forms.live.sent);
  });

  it('shows the people field against the stub directory, with the directory off, and with people in it', () => {
    const { people } = cs.gallery;
    expect(html).toContain(people.live.label);
    expect(html).toContain(people.off.label);
    expect(html).toContain(people.chips.label);
    expect(html.match(/role="combobox"/g)).toHaveLength(3);
    expect(html).toContain(cs.people.search.notice.off);
    // Only the demo with people draws a list; one person lacks a salutation, one has an old class.
    expect(html.match(new RegExp(`<ul [^>]*aria-label="${people.chips.list}"`, 'g'))).toHaveLength(
      1,
    );
    expect(html.match(new RegExp(cs.people.chips.flag.salutation, 'g'))).toHaveLength(1);
    expect(html.match(new RegExp(cs.people.chips.flag.class, 'g'))).toHaveLength(1);
  });

  it('puts the demo with people in a form of its own, whose send is disabled until the page is live', () => {
    expect(html.match(/<form class="flex flex-col gap-2">/g)).toHaveLength(1);
    expect(html).toMatch(
      new RegExp(
        `<form class="flex flex-col gap-2">.*<button type="submit" disabled="" [^>]*>${cs.gallery.people.chips.send}</button></div></form>`,
        's',
      ),
    );
  });

  it('shows the layout kit: stacks, columns, lists and a closed disclosure', () => {
    const { layout, lists, disclosure } = cs.gallery;
    expect(html).toContain(layout.item);
    expect(html).toContain('grid gap-4 sm:grid-cols-2');
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('divide-y');
    expect(html).toContain(lists.meta);
    expect(html).toContain(lists.fact[0][0]);
    expect(html).toMatch(new RegExp(`<details [^>]*><summary [^>]*>.*${disclosure.summary}`));
    expect(html).not.toMatch(/<details [^>]*open/);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
