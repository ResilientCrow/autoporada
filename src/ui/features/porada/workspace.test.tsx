import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FAILURE_CAUSES, PDF_FAILURES, type DownloadError, type PdfFailure } from '@/contracts';
import { DEFAULT_DEADLINE } from '@/domain/calendar';
import type { DocumentModel } from '@/document';
import { cs, issues, porada } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { ArchivePage, NoPorada, PreviewPage, Workspace } from './index';
import type { FindingView } from './Preflight';
import { SkipForm, type SkipView } from './SkipControl';
import { Steps } from './Steps';
import { firstHeld, nextMeetingNote, skipInput, type SkipCalendar } from './skip';
import type { WorkspaceView } from './Workspace';

const MONDAY = '2026-11-09';
const setSkipped = vi.fn(async () => ({
  ok: true as const,
  data: { status: 'skipped' as const, version: 2 },
}));
const generate = vi.fn(async () => ({
  ok: true as const,
  data: { documentId: '00000000-0000-4000-8000-000000000001', version: 4 },
}));
const GENERATED = {
  monday: MONDAY,
  date: '9. 11. 2026',
  time: '14:05',
  pdf: 'ready',
  pdfFailure: null,
} as const;

/** Tuesday 3 November 2026, 11.00 in Prague, with every porada untouched. */
const CALENDAR: SkipCalendar = {
  issues: [],
  now: '2026-11-03T10:00:00.000Z',
  rule: DEFAULT_DEADLINE,
};

const view = (over: Partial<WorkspaceView> = {}): WorkspaceView => ({
  monday: MONDAY,
  meeting: 'pondělí 9. listopadu 2026',
  meetingLabel: '9. 11. 2026',
  movedFrom: null,
  deadline: { weekday: 'sobota', date: '7.\u00a011.', time: '20:00' },
  deadlinePassed: false,
  status: 'open',
  version: 3,
  nextLabel: '16. 11. 2026',
  calendar: CALENDAR,
  counts: { waiting: 2, returned: 0, approved: 1, later: 0, missing: 0 },
  generated: null,
  ...over,
});
const render = (over: Partial<WorkspaceView> = {}) =>
  renderToStaticMarkup(<Workspace view={view(over)} setSkipped={setSkipped} />);

describe('Workspace', () => {
  it('names the porada, its status and its deadline, with clean markup', () => {
    const html = render();
    expect(html).toContain(porada.meeting('pondělí 9. listopadu 2026'));
    expect(html).toContain(cs.status.issue.open);
    expect(html).toContain(porada.deadline.ahead('sobota', '7.\u00a011.', '20:00'));
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says the deadline has passed', () => {
    const html = render({ deadlinePassed: true });
    expect(html).toContain(porada.deadline.passed('sobota', '7.\u00a011.', '20:00'));
    expect(html).not.toContain(porada.deadline.ahead('sobota', '7.\u00a011.', '20:00'));
  });

  it('tells a moved porada where it was moved from', () => {
    expect(render({ movedFrom: '2.\u00a011.' })).toContain(porada.moved('2.\u00a011.'));
    expect(render()).not.toContain('Přesunuto z');
  });

  it('counts what waits, and the later reports only when there are some', () => {
    const html = render({ counts: { waiting: 2, returned: 1, approved: 0, later: 0, missing: 0 } });
    expect(html).toContain(porada.counts.waiting(2));
    expect(html).toContain(porada.counts.returned(1));
    expect(html).toContain(porada.counts.approved(0));
    expect(html).not.toContain(porada.counts.later(0));
    expect(
      render({ counts: { waiting: 0, returned: 0, approved: 0, later: 3, missing: 0 } }),
    ).toContain(porada.counts.later(3));
  });

  it('has no move page to link to: the skip dialog moves a porada (ADR 0051)', () => {
    expect(render()).not.toContain('/presunout');
  });

  it('puts „Porada se nekoná“ at the right of the status card, and no separate skip card', () => {
    const html = render({ status: 'open' });
    expect(html).toContain(`${porada.skip.title}</button>`);
    expect(html.indexOf(porada.meeting('pondělí 9. listopadu 2026'))).toBeLessThan(
      html.indexOf(`${porada.skip.title}</button>`),
    );
    expect(html.indexOf(`${porada.skip.title}</button>`)).toBeLessThan(
      html.indexOf(porada.counts.title),
    );
    // The dialog renders nothing until it opens.
    expect(html).not.toContain(issues.strip.skip.confirm);
    expect(html).not.toContain('name="confirmed"');
  });

  it('offers „Porada se koná“ for a skipped porada, and neither once it is generated', () => {
    expect(render({ status: 'skipped' })).toContain(`${porada.skip.unskipTitle}</button>`);
    expect(render({ status: 'skipped' })).not.toContain(`${porada.skip.title}</button>`);
    const generated = render({ status: 'generated' });
    expect(generated).toContain(porada.meeting('pondělí 9. listopadu 2026'));
    expect(generated).not.toContain(`${porada.skip.title}</button>`);
    expect(generated).not.toContain(`${porada.skip.unskipTitle}</button>`);
  });

  it('works for a Monday without a row yet (no version)', () => {
    expect(render({ version: null })).toContain(`${porada.skip.title}</button>`);
  });

  it('sends an open porada to the preview to generate it, and links the archive', () => {
    const html = render();
    expect(html).toContain(porada.generate.where);
    expect(html).toContain(`href="/porada/${MONDAY}/nahled"`);
    expect(html).toContain('href="/porada/archiv"');
    expect(html).not.toContain('/dokument/docx');
  });

  it('shows the files of a generated porada, and no skip or generate step', () => {
    const html = render({ status: 'generated', generated: GENERATED });
    expect(html).toContain(porada.document.at('9. 11. 2026', '14:05'));
    expect(html).toContain(`href="/porada/${MONDAY}/dokument/docx"`);
    expect(html).toContain(`href="/porada/${MONDAY}/dokument/pdf"`);
    expect(html).not.toContain(porada.generate.where);
    expect(html).not.toContain(porada.skip.title);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says a PDF is still being made, and links no PDF', () => {
    const html = render({ status: 'generated', generated: { ...GENERATED, pdf: 'pending' } });
    expect(html).toContain(porada.document.pending);
    expect(html).not.toContain('/dokument/pdf');
  });

  describe('a PDF that failed', () => {
    const failed = (pdfFailure: PdfFailure | null) =>
      render({ status: 'generated', generated: { ...GENERATED, pdf: 'failed', pdfFailure } });

    it.each(PDF_FAILURES)('says why, for %s, then falls back to the DOCX', (reason) => {
      const html = failed(reason);
      expect(html).toContain(`${porada.document.failed[reason]} ${porada.document.fallback}`);
      expect(html).toContain(`href="/porada/${MONDAY}/dokument/docx"`);
      expect(html).not.toContain('/dokument/pdf');
      expect(cspMarkupProblems(html)).toEqual([]);
    });

    it('reads a failure stored before the reason existed as an error', () => {
      expect(failed(null)).toContain(`${porada.document.failed.error} ${porada.document.fallback}`);
    });

    it('words each reason differently, and the same in the archive', () => {
      expect(new Set(PDF_FAILURES.map((reason) => porada.document.failed[reason])).size).toBe(
        PDF_FAILURES.length,
      );
      const html = renderToStaticMarkup(
        <ArchivePage
          view={{
            problem: null,
            documents: [
              {
                ...GENERATED,
                pdf: 'failed',
                pdfFailure: 'too-large',
                meeting: 'pondělí 9. listopadu 2026',
              },
            ],
          }}
        />,
      );
      expect(html).toContain(porada.document.failed['too-large']);
      expect(html).not.toContain(porada.document.failed.timeout);
    });
  });
});

describe('SkipForm (the dialog of the status card)', () => {
  const skipView = (over: Partial<SkipView> = {}): SkipView => ({
    monday: MONDAY,
    label: '9. 11. 2026',
    meeting: 'pondělí 9. listopadu 2026',
    status: 'open',
    version: 3,
    deadlinePassed: false,
    next: '16. 11. 2026',
    calendar: CALENDAR,
    ...over,
  });
  const form = (over: Partial<SkipView> = {}) =>
    renderToStaticMarkup(
      <SkipForm action={setSkipped} view={skipView(over)} onCancel={vi.fn()} onDone={vi.fn()} />,
    );

  it('names the porada, asks for the day of the next one pre-filled with it, then the box and the buttons', () => {
    const html = form();
    expect(html).toContain(porada.skip.lead('pondělí 9. listopadu 2026'));
    expect(html).toContain(porada.skip.nextMeeting);
    expect(html).toContain(porada.skip.nextHint);
    expect(html).toMatch(
      /<input[^>]*type="date"[^>]*name="nextMeeting"|name="nextMeeting"[^>]*type="date"/,
    );
    expect(html).toMatch(
      /name="nextMeeting"[^>]*value="2026-11-16"|value="2026-11-16"[^>]*name="nextMeeting"/,
    );
    expect(html).not.toContain('<select');
    expect(html).toContain(issues.strip.skip.confirm);
    const at = (text: string) => html.indexOf(text);
    expect(at('name="nextMeeting"')).toBeLessThan(at('name="confirmed"'));
    expect(at(`${issues.strip.skip.submit}</button>`)).toBeLessThan(
      at(`${porada.skip.cancel}</button>`),
    );
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says what the pre-filled day does: the next porada and its deadline', () => {
    const html = form();
    expect(html).toContain(
      porada.skip.plan.next('pondělí 16. listopadu 2026', 'sobota 14.\u00a011. v\u00a020:00'),
    );
  });

  it('leaves the field empty with a note when no porada follows', () => {
    // 26 April 2027 is the calendar's last Monday on 3 November 2026.
    const html = form({ monday: '2027-04-26', next: null });
    expect(html).toContain(porada.skip.noNext);
    expect(html).toMatch(/name="nextMeeting"/);
    expect(html).not.toMatch(/name="nextMeeting"[^>]*value="2/);
  });

  it('warns after the deadline that the approved points move to the next porada', () => {
    expect(form({ deadlinePassed: true })).toContain(porada.skip.afterDeadline);
    expect(form({ deadlinePassed: false })).not.toContain(porada.skip.afterDeadline);
  });

  it('brings a skipped porada back with its own box, saying where points stay, and no date', () => {
    const html = form({ status: 'skipped', calendar: null });
    expect(html).toContain(issues.strip.unskip.confirm);
    expect(html).toContain(`${issues.strip.unskip.submit}</button>`);
    expect(html).toContain(porada.skip.kept('16. 11. 2026'));
    expect(html).not.toContain('name="nextMeeting"');
    expect(html).not.toContain(porada.skip.lead('pondělí 9. listopadu 2026'));
  });
});

describe('firstHeld and nextMeetingNote', () => {
  it('pre-fills the meeting date of the next porada that takes place', () => {
    expect(firstHeld(CALENDAR, MONDAY)).toBe('2026-11-16');
    const skipped = {
      ...CALENDAR,
      issues: [
        {
          monday: '2026-11-16',
          meetingDate: '2026-11-16',
          deadlineAt: '2026-11-14T19:00:00.000Z',
          status: 'skipped' as const,
        },
        {
          monday: '2026-11-23',
          meetingDate: '2026-11-24',
          deadlineAt: '2026-11-22T19:00:00.000Z',
          status: 'open' as const,
        },
      ],
    };
    expect(firstHeld(skipped, MONDAY)).toBe('2026-11-24');
    expect(firstHeld(CALENDAR, '2030-01-07')).toBe('');
  });

  it('names the poradas skipped on the way and the next one with its deadline', () => {
    expect(nextMeetingNote(CALENDAR, MONDAY, '2026-11-27')).toEqual({
      refused: false,
      self: false,
      lines: [
        porada.skip.plan.skipped('16. 11. 2026, 23. 11. 2026'),
        porada.skip.plan.next('pátek 27. listopadu 2026', 'středa 25.\u00a011. v\u00a020:00'),
      ],
    });
  });

  it('holds this porada on another day of its week', () => {
    expect(nextMeetingNote(CALENDAR, MONDAY, '2026-11-10')).toEqual({
      refused: false,
      self: true,
      lines: [porada.skip.plan.next('úterý 10. listopadu 2026', 'neděle 8.\u00a011. v\u00a020:00')],
    });
  });

  it('says why a day cannot be the next porada’s', () => {
    const refused = (typed: string) => nextMeetingNote(CALENDAR, MONDAY, typed);
    expect(refused('2026-11-05')).toEqual({
      refused: true,
      self: false,
      lines: [porada.skip.refused.early('6. 11. 2026')],
    });
    expect(refused('2030-01-07')?.lines[0]).toMatch(/^Zvolte den nejpozději /);
    expect(refused(MONDAY)).toEqual({
      refused: true,
      self: false,
      lines: [porada.skip.refused.same],
    });
    const skipped = {
      ...CALENDAR,
      issues: [
        {
          monday: '2026-11-16',
          meetingDate: '2026-11-16',
          deadlineAt: '2026-11-14T19:00:00.000Z',
          status: 'skipped' as const,
        },
      ],
    };
    expect(nextMeetingNote(skipped, MONDAY, '2026-11-17')).toEqual({
      refused: true,
      self: false,
      lines: [porada.skip.refused.skipped('16. 11. 2026')],
    });
    const late = { ...CALENDAR, now: '2026-11-04T20:30:00.000Z' };
    expect(nextMeetingNote(late, MONDAY, '2026-11-06')).toEqual({
      refused: true,
      self: false,
      lines: [porada.skip.refused['deadline-past']],
    });
  });

  it('says nothing while the field holds no date, or the porada is not in the calendar', () => {
    expect(nextMeetingNote(CALENDAR, MONDAY, '')).toBeNull();
    expect(nextMeetingNote(CALENDAR, MONDAY, '2026-02-30')).toBeNull();
    expect(nextMeetingNote(CALENDAR, '2030-01-07', '2026-11-16')).toBeNull();
  });
});

describe('skipInput', () => {
  const data = (entries: Record<string, string>) => {
    const out = new FormData();
    for (const [k, v] of Object.entries(entries)) out.set(k, v);
    return out;
  };

  it('sends the day of the next porada with a skip, and never with an unskip', () => {
    expect(
      skipInput(MONDAY, 'skip', 3, data({ nextMeeting: '2026-11-24', confirmed: 'on' })),
    ).toEqual({
      monday: MONDAY,
      event: 'skip',
      expectedVersion: 3,
      confirmed: true,
      nextMeeting: '2026-11-24',
    });
    expect(skipInput(MONDAY, 'unskip', 3, data({ nextMeeting: '2026-11-24' }))).not.toHaveProperty(
      'nextMeeting',
    );
  });

  it('leaves out an empty day, the version of a Monday without a row and an unticked box', () => {
    expect(skipInput(MONDAY, 'skip', null, data({ nextMeeting: '' }))).toEqual({
      monday: MONDAY,
      event: 'skip',
    });
  });
});

describe('ArchivePage', () => {
  it('lists each generated porada with its files, and says when there is none', () => {
    const html = renderToStaticMarkup(
      <ArchivePage
        view={{
          problem: null,
          documents: [
            { ...GENERATED, meeting: 'pondělí 9. listopadu 2026' },
            {
              ...GENERATED,
              monday: '2026-11-02',
              pdf: 'pending',
              meeting: 'pondělí 2. listopadu 2026',
            },
          ],
        }}
      />,
    );
    expect(html).toContain(porada.archive.meeting('pondělí 9. listopadu 2026'));
    expect(html).toContain(`href="/porada/${MONDAY}/dokument/pdf"`);
    expect(html).toContain('href="/porada/2026-11-02/dokument/docx"');
    expect(html).not.toContain('href="/porada/2026-11-02/dokument/pdf"');
    expect(html).toContain(porada.document.pending);
    expect(cspMarkupProblems(html)).toEqual([]);

    const empty = renderToStaticMarkup(<ArchivePage view={{ problem: null, documents: [] }} />);
    expect(empty).toContain(porada.archive.empty);
    expect(empty).not.toContain('/dokument/');
    expect(empty).not.toContain('role="alert"');
  });

  describe('when a download gave no file', () => {
    const shown = (problem: DownloadError) =>
      renderToStaticMarkup(
        <ArchivePage
          view={{ problem, documents: [{ ...GENERATED, meeting: 'pondělí 9. listopadu 2026' }] }}
        />,
      );

    it.each(FAILURE_CAUSES)('names %s after the lead', (cause) => {
      const html = shown(cause);
      expect(html).toContain('role="alert"');
      expect(html).toContain(`${porada.download.failed} ${cs.failures[cause]}`);
    });

    it('says a document is not there, or not the reader’s', () => {
      expect(shown('not-found')).toContain(porada.download['not-found']);
    });

    it('says there were too many tries', () => {
      expect(shown('rate-limited')).toContain(cs.errors['rate-limited']);
    });

    it('keeps the list of files below the notice', () => {
      const html = shown('timeout');
      expect(html.indexOf('role="alert"')).toBeLessThan(
        html.indexOf(porada.archive.meeting('pondělí 9. listopadu 2026')),
      );
      expect(cspMarkupProblems(html)).toEqual([]);
    });
  });
});

describe('Steps', () => {
  const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  it('links the five steps of the Monday in order, „Chybějící zprávy“ before the preview', () => {
    const html = renderToStaticMarkup(<Steps monday={MONDAY} missing={0} />);
    expect(hrefs(html)).toEqual(
      ['udaje', 'pokyny', 'priloha-2', 'zpravy', 'nahled'].map(
        (step) => `/porada/${MONDAY}/${step}`,
      ),
    );
    expect(html).toContain(porada.steps.title);
    expect(html).toMatch(new RegExp(`>${porada.steps.missing}\\s<svg`));
  });

  it('counts the akce that lack a report on their step, and only when there are some', () => {
    expect(renderToStaticMarkup(<Steps monday={MONDAY} missing={2} />)).toContain(
      porada.missing.step(2),
    );
    expect(renderToStaticMarkup(<Steps monday={MONDAY} missing={0} />)).not.toContain('(0)');
  });
});

describe('NoPorada (no open porada ahead)', () => {
  it('says there is nothing to prepare and links no step', () => {
    const html = renderToStaticMarkup(<NoPorada />);
    expect(html).toContain(porada.none.title);
    expect(html).toContain(porada.none.text);
    expect(html).not.toContain('/porada/');
  });
});

const DOCUMENT: DocumentModel = {
  meta: { title: 'Porada vedení školy', author: 'Autoporada' },
  sections: [{ layout: 'single', blocks: [{ kind: 'point', number: 1, text: 'Bod náhledu' }] }],
};
const DISABLED_CHECKBOX = /<input(?=[^>]*type="checkbox")(?=[^>]*disabled)[^>]*>/;
const finding = (over: Partial<FindingView> & Pick<FindingView, 'code' | 'level'>): FindingView =>
  over;
const preview = (findings: readonly FindingView[], over = {}) =>
  renderToStaticMarkup(
    <PreviewPage
      view={{
        monday: MONDAY,
        meeting: 'pondělí 9. listopadu 2026',
        canEdit: true,
        document: DOCUMENT,
        findings,
        generate: null,
        generated: null,
        ...over,
      }}
      generate={generate}
    />,
  );

describe('PreviewPage and Preflight', () => {
  it('prints the paper preview and, with no findings, that nothing stands in the way', () => {
    const html = preview([]);
    expect(html).toContain('Bod náhledu');
    expect(html).toContain(porada.preflight.none);
    expect(html).not.toContain(porada.preflight.level.block);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('offers the headmaster the generate form, held off while a finding blocks it', () => {
    const open = preview([], { generate: { monday: MONDAY, version: 3, blocked: false } });
    expect(open).toContain(porada.generate.intro);
    expect(open).toContain(porada.generate.confirm);
    // The submit waits for hydration either way; the checkbox says whether the form is held off.
    expect(open).not.toMatch(DISABLED_CHECKBOX);
    expect(cspMarkupProblems(open)).toEqual([]);

    const blocked = preview([finding({ code: 'issue-not-open', level: 'block' })], {
      generate: { monday: MONDAY, version: 3, blocked: true },
    });
    expect(blocked).toContain(porada.generate.blocked);
    expect(blocked).toMatch(DISABLED_CHECKBOX);
    expect(preview([])).not.toContain(porada.generate.title);
  });

  it('shows a generated porada with its files instead of the preflight', () => {
    const html = preview([], { generated: GENERATED });
    expect(html).toContain(porada.document.title);
    expect(html).toContain(`href="/porada/${MONDAY}/dokument/docx"`);
    expect(html).not.toContain(porada.preflight.none);
    expect(html).toContain('Bod náhledu');
  });

  it('groups the findings by level, blockers first, each level only when it has some', () => {
    const html = preview([
      finding({ code: 'deadline-ahead', level: 'info' }),
      finding({ code: 'points-waiting', level: 'warn', refs: [] }),
      finding({ code: 'issue-not-open', level: 'block' }),
    ]);
    const at = (text: string) => html.indexOf(text);
    expect(at(porada.preflight.level.block)).toBeGreaterThan(-1);
    expect(at(porada.preflight.level.block)).toBeLessThan(at(porada.preflight.level.warn));
    expect(at(porada.preflight.level.warn)).toBeLessThan(at(porada.preflight.level.info));
    expect(html).not.toContain(porada.preflight.none);
    expect(preview([finding({ code: 'deadline-ahead', level: 'info' })])).not.toContain(
      porada.preflight.level.block,
    );
  });

  it('links each ref to the page that fits: review, akce or point', () => {
    const html = preview([
      finding({
        code: 'points-waiting',
        level: 'warn',
        refs: [{ id: 'p-1', title: 'Čekající bod' }],
      }),
      finding({
        code: 'akce-waiting',
        level: 'warn',
        refs: [{ id: 'a-1', title: 'Čekající akce' }],
      }),
      finding({
        code: 'late-reports-expected',
        level: 'warn',
        refs: [{ id: 'q-1', title: 'Pozdní akce', of: 'akce' }],
      }),
      finding({
        code: 'report-incomplete',
        level: 'block',
        refs: [{ id: 'r-1', title: 'Neúplná zpráva', of: 'point' }],
      }),
    ]);
    expect(html).toContain('href="/kontrola/p-1"');
    expect(html).toContain('href="/akce/a-1"');
    expect(html).toContain('href="/akce/q-1"');
    expect(html).toContain('href="/body/r-1"');
  });

  it('links an earlier open porada to its workspace, named by its meeting date', () => {
    const html = preview([
      finding({
        code: 'earlier-open',
        level: 'block',
        earlier: { monday: '2026-11-02', meetingDate: '2026-11-04' },
      }),
    ]);
    expect(html).toContain(porada.preflight.code['earlier-open']);
    expect(html).toContain('href="/porada/2026-11-02"');
    expect(html).toContain(porada.preflight.earlier('4. 11. 2026'));
  });

  it('names the akce whose report is missing and links each to the page of the missing reports', () => {
    const html = preview([
      finding({
        code: 'reports-missing',
        level: 'warn',
        refs: [{ id: 'm-1', title: 'Seminář bez zprávy', of: 'akce' }],
      }),
    ]);
    expect(html).toContain(porada.preflight.code['reports-missing']);
    expect(html).toContain('Seminář bez zprávy');
    expect(html).toContain(`href="/porada/${MONDAY}/zpravy"`);
    expect(html).not.toContain('href="/akce/m-1"');
  });

  it('names the akce whose report is missing without a link for a reader who cannot edit', () => {
    const html = preview(
      [
        finding({
          code: 'reports-missing',
          level: 'warn',
          refs: [{ id: 'm-1', title: 'Seminář bez zprávy', of: 'akce' }],
        }),
      ],
      { canEdit: false },
    );
    expect(html).toContain('Seminář bez zprávy');
    expect(html).not.toContain('href=');
  });

  it('writes the close of a late report after its title', () => {
    const html = preview([
      finding({
        code: 'late-reports-expected',
        level: 'warn',
        refs: [{ id: 'q-1', title: 'Pozdní akce', of: 'akce', due: '2026-11-23T19:00:00.000Z' }],
      }),
    ]);
    expect(html).toContain(porada.preflight.due('23.\u00a011.\u00a0v\u00a020:00'));
  });

  it('writes a close capped at 00:00 of the meeting day as 23:59 of the day before, as the mails do', () => {
    // 00:00 Prague on Monday 2 November 2026 (CET) is 23:00Z on the Sunday.
    const html = preview([
      finding({
        code: 'late-reports-expected',
        level: 'warn',
        refs: [{ id: 'q-1', title: 'Pozdní akce', of: 'akce', due: '2026-11-01T23:00:00.000Z' }],
      }),
    ]);
    expect(html).toContain(porada.preflight.due('1.\u00a011.\u00a0v\u00a023:59'));
    expect(html).not.toContain('0:00');
  });

  it('says how many late drafts of others are not named, with or without named ones', () => {
    const only = preview([finding({ code: 'late-reports-expected', level: 'warn', count: 2 })]);
    expect(only).toContain(porada.preflight.hiddenDrafts(2));
    const both = preview([
      finding({
        code: 'late-reports-expected',
        level: 'warn',
        refs: [{ id: 'q-1', title: 'Pozdní akce', of: 'akce' }],
        count: 1,
      }),
    ]);
    expect(both).toContain('Pozdní akce');
    expect(both).toContain(porada.preflight.hiddenDrafts(1));
  });

  it('counts the entries marked NOVÉ and lists the invalid fields', () => {
    const html = preview([
      finding({ code: 'registry-new', level: 'info', count: 3 }),
      finding({ code: 'snapshot-invalid', level: 'block', paths: ['meeting.date', 'chair'] }),
    ]);
    expect(html).toContain(porada.preflight.newEntries(3));
    expect(html).toContain('<code>meeting.date</code>');
    expect(html).toContain('<code>chair</code>');
  });

  it('shows the way back to the porada to the headmaster only', () => {
    const back = `href="/porada/${MONDAY}"`;
    expect(preview([])).toContain(back);
    expect(preview([], { canEdit: false })).not.toContain(back);
  });

  it('says the document is invalid instead of a preview', () => {
    const html = preview([], { document: null });
    expect(html).toContain(porada.preview.invalid);
    expect(html).not.toContain('Bod náhledu');
  });
});
