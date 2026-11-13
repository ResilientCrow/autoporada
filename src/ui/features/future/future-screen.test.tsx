import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { FutureContentWire } from './edit';
import { FutureHost } from './FutureHost';
import { FutureScreen, type FutureScreenItem } from './FutureScreen';
import { FUTURE_HEADING_ID, type FutureReviewModel } from './review-calls';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  usePathname: () => '/akce/x',
  useSearchParams: () => new URLSearchParams(),
}));
// Hydrated, so the submit buttons render as the page shows them.
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));

const { future, points, autosave, review } = cs;
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));
const ACTIONS = {
  saveFuture: never,
  submitFuture: never,
  getFuture: never,
  retractFuture: never,
  decideFuture: never,
  cancelFuture: never,
  requestCancelFuture: never,
  retractCancelFuture: never,
  refuseCancelFuture: never,
};

const content = (over: Partial<FutureContentWire> = {}): FutureContentWire => ({
  title: 'Lyžařský kurz',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: '08:00',
  timeTo: null,
  campus: 'radlice',
  place: 'Špindlerův Mlýn',
  organizer: null,
  participants: null,
  note: null,
  ...over,
});
const editorOf = (over: Partial<FutureContentWire> = {}) => ({
  version: 3,
  content: content(over),
});
const item = (over: Partial<FutureScreenItem> = {}): FutureScreenItem => ({
  id: ID,
  kind: 'akce',
  state: 'draft',
  version: 3,
  canRetract: false,
  returnNote: null,
  returnParts: [],
  cancelRequested: false,
  cancelRefusalNote: null,
  review: null,
  view: {
    title: 'Lyžařský kurz',
    startDate: '2026-11-10',
    endDate: null,
    timeFrom: '08:00',
    timeTo: null,
    campus: 'radlice',
    place: 'Špindlerův Mlýn',
    organizer: null,
    participants: null,
    note: null,
  },
  window: null,
  editor: editorOf(),
  ...over,
});
const render = (over: Partial<FutureScreenItem> = {}) =>
  renderToStaticMarkup(<FutureScreen item={item(over)} actions={ACTIONS} />);
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

describe('the editor of a draft', () => {
  const html = render();

  it('heads the page, then the status line leads the form', () => {
    expect(html).toMatch(/<h1[^>]*>.*Lyžařský kurz.*<\/h1>/s);
    expect(html).toContain(future.state.draft);
    expect(html).toContain('aria-live="off"');
  });

  it('has the item’s fields filled in', () => {
    expect(html).toMatch(/<input [^>]*name="title"[^>]*value="Lyžařský kurz"/);
    expect(html).toMatch(/<input [^>]*type="date"[^>]*value="2026-11-10"/);
    expect(html).toMatch(/<input [^>]*type="time"[^>]*value="08:00"/);
    expect(html).toMatch(/<input [^>]*name="place"[^>]*value="Špindlerův Mlýn"/);
    expect(html).toMatch(/<input [^>]*name="campus"[^>]*checked=""[^>]*value="radlice"/);
    expect(html).toContain('10. listopadu 2026');
  });

  it('has the organizer, participants and note as text areas', () => {
    expect(html).toMatch(/<textarea [^>]*name="organizer"/);
    expect(html).toMatch(/<textarea [^>]*name="participants"/);
    expect(html).toMatch(/<textarea [^>]*name="note"/);
  });

  it('does not ask whether a report follows: every akce owes one (ADR 0048)', () => {
    expect(html).not.toContain('zpráva do porady');
    expect(html).not.toMatch(/<input [^>]*name="expectsReport"/);
  });

  it('has one button, „Odeslat ke kontrole“, and no revise notice', () => {
    expect(buttons(html).filter((text) => text?.includes(future.editor.submit))).toHaveLength(1);
    expect(html).not.toContain(future.editor.revise);
    expect(html).not.toContain(future.editor.reviseNotice);
  });

  it('is clean for the CSP', () => {
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('names the kind of a jednání', () => {
    expect(render({ kind: 'jednani' })).toContain(future.kind.jednani);
  });

  it('shows the strip from the dates being edited when a calendar came', () => {
    const strip = render({ window: { stripFrom: '2026-11-09', issues: [] } });
    expect(strip).toContain(future.strip.title);
  });
});

describe('the return note', () => {
  it('stands above the editor of a returned item, with its label', () => {
    const html = render({ state: 'returned', returnNote: 'Doplňte <b>vyjádření</b>.' });
    expect(html).toContain(future.returnNote);
    expect(html).toContain('Doplňte &lt;b&gt;vyjádření&lt;/b&gt;.');
    expect(html.indexOf(future.returnNote)).toBeLessThan(html.indexOf('<form'));
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('names the parts to rework, also without a note (ADR 0058)', () => {
    const html = render({ state: 'returned', returnParts: ['when', 'who'] });
    expect(html).toContain(future.returnNote);
    expect(html).toContain(future.reworkParts([future.returnPart.when, future.returnPart.who]));
    expect(html.indexOf(future.returnNote)).toBeLessThan(html.indexOf('<form'));
  });

  it('is left out where there is none', () => {
    expect(render({ state: 'returned' })).not.toContain(future.returnNote);
    expect(render()).not.toContain(future.returnNote);
  });
});

describe('the editor of a returned item', () => {
  it('autosaves like a draft', () => {
    const html = render({ state: 'returned' });
    expect(html).toContain(future.state.returned);
    expect(html).toContain('aria-live="off"');
    expect(html).toContain(future.editor.submit);
  });
});

describe('the editor of an approved akce', () => {
  const html = render({ state: 'approved' });

  it('has no autosave status line, and its button is „Uložit změny“ with the notice', () => {
    expect(html).not.toContain('aria-live="off"');
    expect(html).not.toContain(autosave.unsaved);
    expect(buttons(html).some((text) => text?.includes(future.editor.revise))).toBe(true);
    expect(html).toContain(future.editor.reviseNotice);
    expect(html).not.toContain(future.editor.submit);
  });

  it('describes the button by the notice', () => {
    const noticeId = /<p id="([^"]+)"[^>]*>[^<]*Po úpravě akce zmizí/.exec(html)?.[1];
    expect(noticeId).toBeDefined();
    expect(html).toMatch(new RegExp(`<button [^>]*aria-describedby="${noticeId}"`));
  });

  it('still shows the fields, filled in', () => {
    expect(html).toMatch(/<input [^>]*name="title"[^>]*value="Lyžařský kurz"/);
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('the read view', () => {
  it('shows no editor where the server sent none, and no retract for what is not submitted', () => {
    const html = render({ state: 'submitted', editor: null });
    expect(html).not.toContain('<form');
    expect(html).toContain(future.state.submitted);
    expect(html).not.toContain(future.editor.retract.button);
  });

  it('offers „Stáhnout“ with its hint to the author of a submitted item', () => {
    const html = render({ state: 'submitted', editor: null, canRetract: true });
    expect(buttons(html).some((text) => text?.includes(future.editor.retract.button))).toBe(true);
    expect(html).toContain(future.editor.retract.hint);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('still links back to the list', () => {
    expect(render({ editor: null })).toContain('href="/akce"');
    expect(render()).toContain('href="/akce"');
  });
});

describe('copy', () => {
  it('keeps the shared labels of a point', () => {
    expect(render()).toContain(points.facts.eventDate);
  });
});

describe('the reviewer’s side', () => {
  const all: FutureReviewModel = {
    decisions: ['approve', 'return', 'reject'],
    othersApprove: false,
    canCancel: false,
    canRequestCancel: false,
    canRetractCancel: false,
    canRefuseCancel: false,
  };
  const cancelOnly: FutureReviewModel = {
    decisions: [],
    othersApprove: false,
    canCancel: true,
    canRequestCancel: false,
    canRetractCancel: false,
    canRefuseCancel: false,
  };

  it('puts the decision bar under the read view of a handed-in item, before the way back', () => {
    const html = render({ state: 'submitted', editor: null, review: { ...all } });
    expect(buttons(html)).toEqual([
      review.decision.approve,
      review.decision.return,
      review.decision.reject,
    ]);
    expect(html.indexOf(review.decision.label)).toBeLessThan(html.indexOf('href="/akce"'));
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('offers a reviewer the return, the reject and the cancel on an approved akce', () => {
    const html = render({
      state: 'approved',
      editor: null,
      review: {
        decisions: ['return', 'reject'],
        othersApprove: false,
        canCancel: true,
        canRequestCancel: false,
        canRetractCancel: false,
        canRefuseCancel: false,
      },
    });
    expect(buttons(html)).toEqual([
      review.decision.return,
      review.decision.reject,
      future.review.cancel.button,
    ]);
  });

  it('puts the cancel after the revise editor of the author of an approved akce', () => {
    const html = render({ state: 'approved', review: { ...cancelOnly } });
    expect(html.indexOf(future.editor.revise)).toBeGreaterThan(-1);
    expect(html.indexOf(future.review.cancel.button)).toBeGreaterThan(
      html.indexOf(future.editor.revise),
    );
    expect(html).not.toContain(review.decision.label);
    expect(html).toContain(future.review.cancel.confirm);
  });

  it('shows no bar and no cancel where the server sent none', () => {
    for (const html of [render(), render({ state: 'approved', editor: null })]) {
      expect(html).not.toContain(review.decision.label);
      expect(html).not.toContain(future.review.cancel.button);
    }
  });

  it('marks a cancelled akce „Zrušeno“ and offers a reviewer nothing to press', () => {
    const html = render({
      state: 'cancelled',
      editor: null,
      review: {
        decisions: [],
        othersApprove: false,
        canCancel: false,
        canRequestCancel: false,
        canRetractCancel: false,
        canRefuseCancel: false,
      },
    });
    expect(html).toContain(future.state.cancelled);
    expect(buttons(html)).toEqual([]);
    expect(html).not.toContain('<form');
  });
});

describe('the host above the views (ADR 0013 items 1 and 7)', () => {
  const read = (over: Partial<FutureScreenItem> = {}) => render({ editor: null, ...over });
  const heading = new RegExp(
    `<h1 [^>]*id="${FUTURE_HEADING_ID}"[^>]*tabindex="-1"|<h1 [^>]*tabindex="-1"[^>]*id="${FUTURE_HEADING_ID}"`,
  );

  it('makes the title a place focus can be sent to, in the read view and in the editor', () => {
    expect(read()).toMatch(heading);
    expect(render()).toMatch(heading);
    expect(render({ state: 'approved' })).toMatch(heading);
  });

  it('ends every view with the host’s status region, with or without a bar', () => {
    const states = [
      read({ review: null }),
      render({ review: null }),
      read({
        state: 'submitted',
        review: {
          decisions: ['approve'],
          othersApprove: false,
          canCancel: false,
          canRequestCancel: false,
          canRetractCancel: false,
          canRefuseCancel: false,
        },
      }),
      render({
        state: 'approved',
        review: {
          decisions: [],
          othersApprove: false,
          canCancel: true,
          canRequestCancel: false,
          canRetractCancel: false,
          canRefuseCancel: false,
        },
      }),
    ];
    for (const html of states) expect(html).toMatch(/<div role="status"><\/div><\/div>$/);
  });

  it('is the same element at the same place whichever view shows, so a message outlives the switch', () => {
    const tops = [
      FutureScreen({ item: item({ editor: null }), actions: ACTIONS }),
      FutureScreen({ item: item(), actions: ACTIONS }),
      FutureScreen({ item: item({ state: 'approved' }), actions: ACTIONS }),
      FutureScreen({ item: item({ review: null }), actions: ACTIONS }),
    ];
    for (const top of tops) {
      expect(top.type).toBe(FutureHost);
      expect(top.key).toBeNull();
    }
  });
});

describe('a cancel request (ADR 0062)', () => {
  const none: FutureReviewModel = {
    decisions: [],
    othersApprove: false,
    canCancel: false,
    canRequestCancel: false,
    canRetractCancel: false,
    canRefuseCancel: false,
  };
  const asked = future.review.cancelRequest;

  it('offers the author „Požádat o zrušení“ under the editor of an approved akce', () => {
    const html = render({ state: 'approved', review: { ...none, canRequestCancel: true } });
    expect(buttons(html)).toContain(asked.button);
    expect(html).not.toContain(future.review.cancel.button);
  });

  it('shows the waiting author the notice and „Vzít žádost zpět“, and no editor', () => {
    const html = render({
      state: 'approved',
      editor: null,
      cancelRequested: true,
      review: { ...none, canRetractCancel: true },
    });
    expect(html).toContain(asked.waiting);
    expect(buttons(html)).toContain(asked.retract);
  });

  it('gives the vedení „Potvrdit zrušení“ and „Zamítnout zrušení“ on a waiting request', () => {
    const html = render({
      state: 'approved',
      editor: null,
      cancelRequested: true,
      review: { ...none, canCancel: true, canRefuseCancel: true },
    });
    expect(html).toContain(asked.waiting);
    expect(buttons(html)).toContain(future.review.cancel.confirmRequest);
    expect(buttons(html)).toContain(asked.refuse);
  });

  it('shows the author the vedení’s refusal', () => {
    const html = render({ state: 'approved', cancelRefusalNote: 'Akce je potřeba.' });
    expect(html).toContain(asked.refusal);
    expect(html).toContain('Akce je potřeba.');
  });
});
