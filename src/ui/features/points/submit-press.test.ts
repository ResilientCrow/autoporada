import { describe, expect, it, vi } from 'vitest';

import type { SaveAnswer } from '@/ui/form';

import { NO_OUTCOME, type SubmitOutcome } from './submit-outcome';
import {
  NOTHING_SHOWN,
  pressDecision,
  readOnlyWhile,
  runPress,
  withOutcome,
  type PressPorts,
} from './submit-press';

const ENTRIES = [
  { id: 'bod-title', text: 'Vyplňte název.' },
  { id: null, text: 'Přidejte alespoň jedno vyjádření.' },
];
const SUMMARY: SubmitOutcome = { summary: ENTRIES, problem: null };
const PROBLEM: SubmitOutcome = { summary: null, problem: { code: 'network' } };

describe('withOutcome', () => {
  it('raises the summary count for a summary and the form count for a problem, never the other', () => {
    expect(withOutcome(NOTHING_SHOWN, SUMMARY)).toEqual({
      outcome: SUMMARY,
      summaryAttempt: 1,
      problemAttempt: 0,
    });
    expect(withOutcome(NOTHING_SHOWN, PROBLEM)).toEqual({
      outcome: PROBLEM,
      summaryAttempt: 0,
      problemAttempt: 1,
    });
  });

  it('raises nothing for an outcome that shows nothing, and clears what was shown', () => {
    const before = withOutcome(withOutcome(NOTHING_SHOWN, PROBLEM), SUMMARY);
    expect(withOutcome(before, NO_OUTCOME)).toEqual({
      outcome: NO_OUTCOME,
      summaryAttempt: 1,
      problemAttempt: 1,
    });
  });

  it('a press with problems after a refusal moves the summary and leaves the form lead alone', () => {
    // Form and panel each focus their own lead when their count rises; one shared count had both fire.
    const refused = withOutcome(NOTHING_SHOWN, PROBLEM);
    const pressed = withOutcome(refused, SUMMARY);
    expect(pressed.summaryAttempt).toBe(refused.summaryAttempt + 1);
    expect(pressed.problemAttempt).toBe(refused.problemAttempt);
  });

  it('counts every shown outcome', () => {
    let shown = NOTHING_SHOWN;
    for (const outcome of [SUMMARY, SUMMARY, PROBLEM, SUMMARY]) shown = withOutcome(shown, outcome);
    expect(shown).toMatchObject({ summaryAttempt: 3, problemAttempt: 1 });
  });
});

describe('pressDecision', () => {
  it('shows the problems found now and sends nothing', () => {
    expect(pressDecision(false, ENTRIES)).toEqual({ kind: 'show', entries: ENTRIES });
  });

  it('sends when nothing is missing', () => {
    expect(pressDecision(false, [])).toEqual({ kind: 'send' });
  });

  it('ignores a press while a send is on its way, whatever the content says', () => {
    expect(pressDecision(true, [])).toEqual({ kind: 'ignore' });
    expect(pressDecision(true, ENTRIES)).toEqual({ kind: 'ignore' });
  });
});

describe('readOnlyWhile', () => {
  it('holds the fields for a banner and for a send in flight', () => {
    expect(readOnlyWhile(false, false)).toBe(false);
    expect(readOnlyWhile(true, false)).toBe(true);
    expect(readOnlyWhile(false, true)).toBe(true);
  });
});

describe('runPress', () => {
  function ports(over: Partial<PressPorts> & { answer?: SaveAnswer | null } = {}) {
    const log: string[] = [];
    const found: PressPorts = {
      sending: false,
      problems: [],
      show: (outcome) => log.push(`show ${JSON.stringify(outcome)}`),
      setSending: (value) => log.push(`sending ${value}`),
      send: () => {
        log.push('send');
        return Promise.resolve(
          over.answer === undefined ? { kind: 'ok', version: 5 } : over.answer,
        );
      },
      ...over,
    };
    return { found, log };
  }

  it('with problems shows them, and neither sends nor starts pending', async () => {
    const send = vi.fn();
    const { found, log } = ports({ problems: ENTRIES, send });
    await runPress(found);
    expect(log).toEqual([`show ${JSON.stringify(SUMMARY)}`]);
    expect(send).not.toHaveBeenCalled();
  });

  it('with none clears the page, goes pending, sends, and stays pending after an accepted send', async () => {
    const { found, log } = ports();
    await runPress(found);
    expect(log).toEqual([`show ${JSON.stringify(NO_OUTCOME)}`, 'sending true', 'send']);
  });

  it.each<[string, SaveAnswer | null]>([
    ['a conflict', { kind: 'conflict' }],
    ['a failed call', { kind: 'failed' }],
    ['a locked point', { kind: 'not-editable' }],
    ['a banner that refused it', null],
  ])('ends pending after %s', async (_name, answer) => {
    const { found, log } = ports({ answer });
    await runPress(found);
    expect(log).toEqual([
      `show ${JSON.stringify(NO_OUTCOME)}`,
      'sending true',
      'send',
      'sending false',
    ]);
  });

  it('does nothing while a send is on its way', async () => {
    const send = vi.fn();
    const { found, log } = ports({ sending: true, send });
    await runPress(found);
    await runPress({ ...found, problems: ENTRIES });
    expect(log).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
