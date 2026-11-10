import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { issues } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { AddForm, AddPorada, type AddCalendar } from './AddPorada';

const { add } = issues.strip;

const addIssue = vi.fn(async () => ({
  ok: true as const,
  data: {
    monday: '2026-11-09',
    meetingDate: '2026-11-10',
    deadlineAt: '2026-11-08T19:00:00.000Z',
    version: 1,
  },
}));
const calendar: AddCalendar = {
  issues: [],
  now: '2026-11-03T10:00:00.000Z',
  rule: DEFAULT_DEADLINE,
  plannedThrough: '2026-11-02',
};

describe('AddPorada', () => {
  it('is a button, with the dialog closed', () => {
    const out = renderToStaticMarkup(
      <AddPorada action={addIssue} calendar={calendar} onDone={vi.fn()} />,
    );
    expect(out).toContain(`${add.title}</button>`);
    expect(out).not.toContain(add.lead);
    expect(out).not.toContain('<form');
    expect(cspMarkupProblems(out)).toEqual([]);
  });
});

describe('AddForm', () => {
  const html = () =>
    renderToStaticMarkup(
      <AddForm action={addIssue} calendar={calendar} onCancel={vi.fn()} onDone={vi.fn()} />,
    );

  it('explains, asks for an empty day, and ends with the buttons', () => {
    const out = html();
    expect(out).toContain(add.lead);
    expect(out).toContain(add.day);
    expect(out).toContain(add.hint);
    expect(out).toMatch(/type="date"[^>]*name="meetingDate"|name="meetingDate"[^>]*type="date"/);
    expect(out).not.toMatch(/name="meetingDate"[^>]*value="2/);
    expect(out.indexOf(`${add.submit}</button>`)).toBeLessThan(
      out.indexOf(`${add.cancel}</button>`),
    );
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('says nothing about the effect or a refusal while the field is empty', () => {
    const out = html();
    expect(out).not.toContain(add.closed);
    expect(out).not.toContain(add.refused.early);
  });
});
