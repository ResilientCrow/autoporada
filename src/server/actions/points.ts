'use server';

import {
  createPoint as createPointUseCase,
  pointStatus as pointStatusUseCase,
  savePoint as savePointUseCase,
  submitPoint as submitPointUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * „Začít“ on /body/novy. It does not refresh: the chooser's client replaces the
 * route with the new draft itself (ADR 0017 item 1), and a retry with the same
 * `clientRef` returns the same draft.
 */
export const createPoint = defineAction(createPointUseCase, {
  rateLimit: 'submission',
  refresh: 'none',
});

/**
 * The editor's autosave. It does not refresh either: a refresh would remount the
 * editor under the author's hands, and a conflict is settled by the client
 * (`router.refresh()` after „Načíst aktuální stav“).
 */
export const savePoint = defineAction(savePointUseCase, {
  rateLimit: 'autosave',
  refresh: 'none',
});

/**
 * What the editor asks after a conflict: the version, and whether the point can
 * still be saved. A read, so the default refresh does nothing.
 */
export const pointStatus = defineAction(pointStatusUseCase, { rateLimit: 'autosave' });

/**
 * „Odeslat ke kontrole“: saves the content and hands the point in. It moves the state, so it
 * refreshes the page, which remounts as the read view; the editor's own client has already waited
 * for its autosave to land (`useAutosave().submit`).
 */
export const submitPoint = defineAction(submitPointUseCase, {
  rateLimit: 'submission',
});
