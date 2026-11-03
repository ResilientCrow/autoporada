import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FAILURE_CAUSES, PDF_FAILURES, type DownloadError, type PdfFailure } from '@/contracts';
import { DEFAULT_DEADLINE, deadline } from '@/domain/calendar';
import type { DocumentModel } from '@/document';
import { instantToWallClock, parseIsoDate, toIsoDate, toIsoTime } from '@/domain/time';
import { cs, issues, porada } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { ArchivePage, MovePage, NoPorada, PreviewPage, Workspace } from './index';
import type { FindingView } from './Preflight';
import type { MoveView } from './move';
import { moveEffect, moveInput, ruleDeadline, skipList } from './move';
import { SkipForm, type SkipView } from './SkipControl';
import { Steps } from './Steps';
import { skipInput } from './skip';
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
  heldNext: [
    { monday: '2026-11-16', label: 'pondělí 16. listopadu 2026' },
    { monday: '2026-11-23', label: 'úterý 24. listopadu 2026' },
  ],
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

  it('offers the move only while the porada is open', () => {
    const link = `href="/porada/${MONDAY}/presunout"`;
    expect(render({ status: 'open' })).toContain(link);
    expect(render({ status: 'skipped' })).not.toContain(link);
    expect(render({ status: 'generated' })).not.toContain(link);
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
    heldNext: view().heldNext,
    ...over,
  });
  const form = (over: Partial<SkipView> = {}) =>
    renderToStaticMarkup(
      <SkipForm action={setSkipped} view={skipView(over)} onCancel={vi.fn()} onDone={vi.fn()} />,
    );

  it('names the porada, offers the next ones with the first chosen, then the box and the buttons', () => {
    const html = form();
    expect(html).toContain(porada.skip.lead('pondělí 9. listopadu 2026'));
    expect(html).toContain(porada.skip.until);
    expect(html).toContain(porada.skip.untilHint);
    expect(html).toMatch(/<select[^>]*name="until"[^>]*aria-required="true"/);
    expect(html).not.toContain(`${porada.skip.until} (`);
    expect(html).toMatch(/<option value="2026-11-16" selected="">pondělí 16. listopadu 2026/);
    expect(html).toContain('<option value="2026-11-23">úterý 24. listopadu 2026');
    expect(html).toContain(issues.strip.skip.confirm);
    const at = (text: string) => html.indexOf(text);
    expect(at('name="until"')).toBeLessThan(at('name="confirmed"'));
    expect(at(`${issues.strip.skip.submit}</button>`)).toBeLessThan(
      at(`${porada.skip.cancel}</button>`),
    );
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('leaves out the hint with one porada to choose, and the select with none', () => {
    expect(form({ heldNext: view().heldNext.slice(0, 1) })).not.toContain(porada.skip.untilHint);
    const none = form({ heldNext: [], next: null });
    expect(none).not.toContain('name="until"');
    expect(none).toContain(porada.skip.noNext);
  });

  it('warns after the deadline that the approved points move to the chosen porada', () => {
    expect(form({ deadlinePassed: true })).toContain(porada.skip.afterDeadline);
    expect(form({ deadlinePassed: false })).not.toContain(porada.skip.afterDeadline);
    expect(form({ deadlinePassed: true, heldNext: [] })).not.toContain(porada.skip.afterDeadline);
  });

  it('brings a skipped porada back with its own box, saying where points stay, and no select', () => {
    const html = form({ status: 'skipped' });
    expect(html).toContain(issues.strip.unskip.confirm);
    expect(html).toContain(`${issues.strip.unskip.submit}</button>`);
    expect(html).toContain(porada.skip.kept('16. 11. 2026'));
    expect(html).not.toContain('name="until"');
    expect(html).not.toContain(porada.skip.lead('pondělí 9. listopadu 2026'));
  });
});

describe('skipInput', () => {
  const data = (entries: Record<string, string>) => {
    const out = new FormData();
    for (const [k, v] of Object.entries(entries)) out.set(k, v);
    return out;
  };

  it('sends the chosen porada with a skip, and never with an unskip', () => {
    expect(skipInput(MONDAY, 'skip', 3, data({ until: '2026-11-23', confirmed: 'on' }))).toEqual({
      monday: MONDAY,
      event: 'skip',
      expectedVersion: 3,
      confirmed: true,
      until: '2026-11-23',
    });
    expect(skipInput(MONDAY, 'unskip', 3, data({ until: '2026-11-23' }))).not.toHaveProperty(
      'until',
    );
  });

  it('leaves out an empty choice, the version of a Monday without a row and an unticked box', () => {
    expect(skipInput(MONDAY, 'skip', null, data({}))).toEqual({ monday: MONDAY, event: 'skip' });
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

const MOVE_RULE = DEFAULT_DEADLINE;
const NOW = '2026-10-19T08:00:00.000Z';
const slot = (monday: string, status: 'open' | 'generated' | 'skipped' = 'open') => ({
  monday,
  meetingDate: monday,
  deadlineAt: deadline(parseIsoDate(monday), MOVE_RULE).toISOString(),
  status,
});
const moveView = (over: Partial<MoveView> = {}): MoveView => ({
  monday: '2026-11-02',
  version: 4,
  meetingDate: '2026-11-02',
  deadlineAt: slot('2026-11-02').deadlineAt,
  today: '2026-10-19',
  last: '2027-06-30',
  issues: [slot('2026-10-26'), slot('2026-11-02'), slot('2026-11-09')],
  now: NOW,
  rule: MOVE_RULE,
  ...over,
});
const move = (v: MoveView) =>
  renderToStaticMarkup(
    <MovePage
      model={{ monday: v.monday, meeting: 'pondělí 2. listopadu 2026', view: v }}
      moveIssue={vi.fn()}
    />,
  );
const fieldValue = (html: string, name: string) =>
  new RegExp(`name="${name}"[^>]*?value="([^"]*)"|value="([^"]*)"[^>]*?name="${name}"`).exec(html);

describe('MovePage', () => {
  it('pre-fills the deadline the rule gives for the current meeting date', () => {
    const html = move(moveView());
    expect(ruleDeadline('2026-11-02', MOVE_RULE, NOW)).not.toBeNull();
    expect(html).toContain('name="meetingDate"');
    expect(html).toContain(porada.move.current('2. 11. 2026'));
    expect(html).not.toContain(porada.move.deadlinePast);
    expect(fieldValue(html, 'deadlineTime')?.[1] ?? fieldValue(html, 'deadlineTime')?.[2]).toBe(
      ruleDeadline('2026-11-02', MOVE_RULE, NOW)!.time,
    );
  });

  it('leaves the deadline empty with a note when the rule gives a past one', () => {
    const html = move(moveView({ now: '2026-12-01T08:00:00.000Z' }));
    expect(html).toContain(porada.move.deadlinePast);
  });

  it('links back to the porada and does not ask for the confirm box when nothing is crossed', () => {
    const html = move(moveView());
    expect(html).toContain(`href="/porada/2026-11-02"`);
    expect(html).not.toContain('name="confirmed"');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('move helpers', () => {
  const typedFor = (meeting: string, at: Date) => {
    const { date, time } = instantToWallClock(at);
    return { meeting, date: toIsoDate(date), time: toIsoTime(time) };
  };

  it('gives no rule deadline for an unreadable date or a deadline already past', () => {
    expect(ruleDeadline('nonsense', MOVE_RULE, NOW)).toBeNull();
    expect(ruleDeadline('2026-10-19', MOVE_RULE, '2026-12-01T00:00:00.000Z')).toBeNull();
    expect(ruleDeadline('2026-11-02', MOVE_RULE, NOW)).toEqual(
      expect.objectContaining({ date: expect.stringMatching(/^2026-1\d-\d\d$/) }),
    );
  });

  it('gives no effect while a value is missing or the Monday has no slot', () => {
    const v = moveView();
    expect(moveEffect(v, { meeting: '', date: '2026-10-30', time: '20:00' })).toBeNull();
    expect(moveEffect(v, { meeting: '2026-11-02', date: '', time: '20:00' })).toBeNull();
    expect(moveEffect(v, { meeting: '2026-11-02', date: '2026-10-30', time: '' })).toBeNull();
    expect(
      moveEffect(
        { ...v, monday: '2030-01-07' },
        { meeting: '2026-11-02', date: '2026-10-30', time: '20:00' },
      ),
    ).toBeNull();
  });

  it('compares the typed deadline with the current one: same, earlier, later', () => {
    const v = moveView();
    const current = new Date(v.deadlineAt);
    const hour = 3_600_000;
    expect(moveEffect(v, typedFor('2026-11-02', current))?.change).toBe('same');
    expect(
      moveEffect(v, typedFor('2026-11-02', new Date(current.getTime() - 24 * hour)))?.change,
    ).toBe('earlier');
    expect(
      moveEffect(v, typedFor('2026-11-02', new Date(current.getTime() + 24 * hour)))?.change,
    ).toBe('later');
  });

  it('finds the porady a later meeting date would cross, and lists them as Mondays', () => {
    const v = moveView();
    const effect = moveEffect(
      v,
      typedFor('2026-11-10', new Date(new Date(v.deadlineAt).getTime() + 7 * 24 * 3_600_000)),
    );
    expect(skipList(effect!.conflicts)).toEqual(['2026-11-09']);
    expect(effect!.conflicts[0]).toMatchObject({ status: 'open' });
  });

  it('shows the conflicts with the confirm box and the effect line', () => {
    const v = moveView({ meetingDate: '2026-11-10' });
    // The form starts from the view; a crossed Monday asks for the confirm box.
    const html = move(v);
    expect(html).toContain(porada.move.conflicts('9. 11. 2026'));
    expect(html).toContain('name="confirmed"');
    expect(html).toContain(porada.move.fields.confirmed);
  });

  it('refuses to move over a generated porada: no confirm box, a fixed text', () => {
    const v = moveView({
      meetingDate: '2026-11-10',
      issues: [slot('2026-10-26'), slot('2026-11-02'), slot('2026-11-09', 'generated')],
    });
    const html = move(v);
    expect(html).toContain(porada.move.conflictsFixed);
    expect(html).not.toContain('name="confirmed"');
  });

  it('sends the version only for a slot with a row and confirmed only when ticked', () => {
    const form = (entries: Record<string, string>) => {
      const data = new FormData();
      for (const [k, val] of Object.entries(entries)) data.set(k, val);
      return data;
    };
    const base = { meetingDate: '2026-11-10', deadlineDate: '2026-11-06', deadlineTime: '20:00' };
    expect(moveInput(moveView(), ['2026-11-09'], form({ ...base, confirmed: 'on' }))).toEqual({
      monday: '2026-11-02',
      ...base,
      skip: ['2026-11-09'],
      expectedVersion: 4,
      confirmed: true,
    });
    const bare = moveInput(moveView({ version: null }), [], form(base));
    expect(bare).not.toHaveProperty('expectedVersion');
    expect(bare).not.toHaveProperty('confirmed');
  });
});
