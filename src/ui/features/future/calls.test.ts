import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';

import {
  createInput,
  declineReportInput,
  editorStatusOf,
  retractInput,
  reviseEffect,
  reviseInput,
  startReportInput,
  reportHref,
  submitAnswer,
  submitInput,
} from './calls';
import type { FutureContentWire } from './edit';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const CONTENT: FutureContentWire = {
  title: 'Lyžák',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  responsible: null,
  expectsReport: false,
};
const fail = (error: ActionError) => ({ ok: false, error }) as const;

describe('the inputs of the calls', () => {
  it('revise sends the page’s version, the content held and the intent to revise', () => {
    expect(reviseInput(ID, 4, CONTENT)).toEqual({
      id: ID,
      expectedVersion: 4,
      content: CONTENT,
      intent: 'revise',
    });
  });

  it('submit sends the version the autosave landed and no intent', () => {
    expect(submitInput(ID, 7, CONTENT)).toEqual({ id: ID, expectedVersion: 7, content: CONTENT });
  });

  it('retract sends the page’s version', () => {
    expect(retractInput(ID, 5)).toEqual({ id: ID, expectedVersion: 5 });
  });

  it('create keeps the first press’s clientRef for every later press', () => {
    const held = { current: null as string | null };
    let made = 0;
    const make = () => `ref-${++made}`;
    expect(createInput(held, 'akce', make)).toEqual({ clientRef: 'ref-1', kind: 'akce' });
    expect(createInput(held, 'jednani', make)).toEqual({ clientRef: 'ref-1', kind: 'jednani' });
    expect(made).toBe(1);
  });
});

describe('reviseEffect', () => {
  it('refreshes the page when the change was handed in', () => {
    const result = { ok: true, data: { version: 5, state: 'submitted' } } as const;
    expect(reviseEffect(result)).toEqual({
      refresh: true,
      unchanged: false,
      answer: { kind: 'ok', version: 5 },
    });
  });

  it('ends the send, with no refresh, when nothing changed (the server answers the same state)', () => {
    const result = { ok: true, data: { version: 4, state: 'approved' } } as const;
    expect(reviseEffect(result)).toEqual({ refresh: false, unchanged: true, answer: null });
  });

  it('ends a failed call as a failure', () => {
    expect(reviseEffect(null)).toEqual({
      refresh: false,
      unchanged: false,
      answer: { kind: 'failed' },
    });
  });

  it('hears a conflict and a state that moved on in the autosave’s words', () => {
    expect(reviseEffect(fail({ code: 'conflict' })).answer).toEqual({ kind: 'conflict' });
    expect(reviseEffect(fail({ code: 'rule', rule: 'future-not-editable' })).answer).toEqual({
      kind: 'not-editable',
    });
    expect(reviseEffect(fail({ code: 'conflict' })).refresh).toBe(false);
  });
});

describe('submitAnswer', () => {
  it('hears the server’s answer, and a failed call as a failure', () => {
    expect(submitAnswer({ ok: true, data: { version: 8 } })).toEqual({ kind: 'ok', version: 8 });
    expect(submitAnswer(null)).toEqual({ kind: 'failed' });
    expect(submitAnswer(fail({ code: 'rule', rule: 'future-not-editable' }))).toEqual({
      kind: 'not-editable',
    });
  });
});

describe('editorStatusOf', () => {
  const status = (state: string, editable: boolean) =>
    ({ ok: true, data: { version: 6, editable, state } }) as never;

  it.each(['draft', 'returned'])('lets the autosave go on for a %s item that is editable', (s) => {
    expect(editorStatusOf(status(s, true))).toEqual({ kind: 'ok', version: 6, editable: true });
  });

  it.each(['approved', 'submitted'])(
    'locks the autosave for a %s item, though its author may still revise it',
    (s) => {
      expect(editorStatusOf(status(s, true))).toEqual({ kind: 'ok', version: 6, editable: false });
    },
  );

  it('keeps the other answers as the autosave hears them', () => {
    expect(editorStatusOf(fail({ code: 'not-found' }))).toEqual({ kind: 'gone' });
    expect(editorStatusOf(fail({ code: 'busy' }))).toEqual({ kind: 'failed' });
  });
});

describe('the report calls', () => {
  const TYPE_A = '1b0c1d2e-3f40-4152-8364-758697a8b9ca';
  const TYPE_B = '2b0c1d2e-3f40-4152-8364-758697a8b9ca';
  const chosen = (typeId?: string) => {
    const data = new FormData();
    if (typeId !== undefined) data.set('typeId', typeId);
    return data;
  };

  it('starts the report of the type ticked', () => {
    const types = [{ id: TYPE_A }, { id: TYPE_B }];
    expect(startReportInput(ID, chosen(TYPE_B), types)).toEqual({ id: ID, typeId: TYPE_B });
  });

  it('takes the only type when there is no choice to make', () => {
    expect(startReportInput(ID, chosen(), [{ id: TYPE_A }])).toEqual({ id: ID, typeId: TYPE_A });
  });

  it('sends no type when several are offered and none is ticked, for the server to refuse as missing', () => {
    // Missing, not empty: an empty string reads as an invalid type, a missing one as „Vyberte druh zprávy.“.
    expect(startReportInput(ID, chosen(), [{ id: TYPE_A }, { id: TYPE_B }])).toStrictEqual({
      id: ID,
      typeId: undefined,
    });
  });

  it('declines by the akce alone', () => {
    expect(declineReportInput(ID)).toEqual({ id: ID });
  });

  it('opens the draft the report was started as', () => {
    expect(reportHref(TYPE_A)).toBe(`/body/${TYPE_A}`);
  });
});
