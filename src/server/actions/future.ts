'use server';

import {
  cancelFuture as cancelFutureUseCase,
  createFuture as createFutureUseCase,
  decideFuture as decideFutureUseCase,
  getFuture as getFutureUseCase,
  refuseCancelFuture as refuseCancelFutureUseCase,
  requestCancelFuture as requestCancelFutureUseCase,
  retractCancelFuture as retractCancelFutureUseCase,
  retractFuture as retractFutureUseCase,
  saveFuture as saveFutureUseCase,
  startFutureReport as startFutureReportUseCase,
  submitFuture as submitFutureUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * „Začít“ on /akce/novy. It does not refresh: the chooser's client replaces the route with the
 * new draft itself (ADR 0017 item 1), and a retry with the same `clientRef` returns the same one.
 */
export const createFuture = defineAction(createFutureUseCase, {
  rateLimit: 'submission',
  refresh: 'none',
});

/**
 * The editor's autosave, and an approved akce's one „Uložit změny“ (`intent: 'revise'`). Neither
 * refreshes: a refresh would remount the editor under the author's hands, and the revise's own
 * client refreshes once it has the answer, since the item has left „Schváleno“.
 */
export const saveFuture = defineAction(saveFutureUseCase, {
  rateLimit: 'autosave',
  refresh: 'none',
});

/**
 * What the editor asks after a conflict: the item's version, and whether it may still be saved
 * (`editable`). A read, so the default refresh does nothing; it has no use case of its own.
 */
export const getFuture = defineAction(getFutureUseCase, { rateLimit: 'autosave' });

/**
 * „Odeslat ke kontrole“: saves the content and hands the item in. It moves the state, so it
 * refreshes the page, which remounts as the read view.
 */
export const submitFuture = defineAction(submitFutureUseCase, { rateLimit: 'submission' });

/** „Stáhnout“: a submitted item back to the drafts. It moves the state, so it refreshes the page. */
export const retractFuture = defineAction(retractFutureUseCase, { rateLimit: 'submission' });

/**
 * The decision bar on /akce/[id]: approve, return or reject. It moves the state, so it refreshes
 * the page, which shows the new state and the bar of what may be decided next.
 */
export const decideFuture = defineAction(decideFutureUseCase, {
  rateLimit: 'admin',
  refresh: 'page',
});

/**
 * „Zrušit akci“ of an approved item, or „Potvrdit zrušení“ of a waiting request: a vedení
 * decision since ADR 0062, so it counts under the admin limit like the other decisions. The page
 * refreshes as „Zrušeno“.
 */
export const cancelFuture = defineAction(cancelFutureUseCase, {
  rateLimit: 'admin',
  refresh: 'page',
});

/**
 * „Požádat o zrušení“: the author outside the vedení asks for the cancel (ADR 0062). The akce
 * stays approved; it counts under the submission limit, like the author's other moves.
 */
export const requestCancelFuture = defineAction(requestCancelFutureUseCase, {
  rateLimit: 'submission',
  refresh: 'page',
});

/** „Vzít žádost zpět“: the author takes the waiting request back. */
export const retractCancelFuture = defineAction(retractCancelFutureUseCase, {
  rateLimit: 'submission',
  refresh: 'page',
});

/** „Zamítnout zrušení“: the vedení refuses the waiting request, with a note; the akce stays. */
export const refuseCancelFuture = defineAction(refuseCancelFutureUseCase, {
  rateLimit: 'admin',
  refresh: 'page',
});

/**
 * „Napsat zprávu“ on the home page and in „Moje body“: opens the draft report of an akce that has
 * ended. It counts under the submission limit, like the creation of any point; the client goes to
 * the draft itself, and the refresh keeps the page it leaves behind current.
 */
export const startFutureReport = defineAction(startFutureReportUseCase, {
  rateLimit: 'submission',
  refresh: 'page',
});
