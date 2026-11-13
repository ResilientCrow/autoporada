import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, MAX_WAIT_MS, headWait, type Queued } from './saves';

const save = (id: string, at?: number): Queued => ({ k: 'saveFuture', a: [id], ...(at !== undefined && { at }) });
const submit: Queued = { k: 'submitFuture', a: ['f1'], at: 0 };

describe('headWait: a save goes once the typing pauses, anything else at once', () => {
  it('has nothing to wait for in an empty queue', () => {
    expect(headWait([], 0)).toBe(0);
  });

  it('sends an action that is not a save at once', () => {
    expect(headWait([submit], 0)).toBe(0);
  });

  it('holds a save just typed for the whole pause', () => {
    expect(headWait([save('f1', 1000)], 1000)).toBe(DEBOUNCE_MS);
  });

  it('counts the pause from the last keystroke of the same thing', () => {
    const q = [save('f1', 0), save('f1', 400), save('f1', 900)];
    expect(headWait(q, 1000)).toBe(900 + DEBOUNCE_MS - 1000);
    expect(headWait(q, 900 + DEBOUNCE_MS)).toBe(0);
  });

  it('saves during typing that never pauses, once the longest wait is up', () => {
    const q = [save('f1', 0), save('f1', MAX_WAIT_MS - 100)];
    expect(headWait(q, MAX_WAIT_MS - 50)).toBe(50);
    expect(headWait(q, MAX_WAIT_MS)).toBe(0);
  });

  it('ignores the typing in another thing', () => {
    const q = [save('f1', 0), save('f2', 1400)];
    expect(headWait(q, 1000)).toBe(DEBOUNCE_MS - 1000);
  });

  it('sends a save at once when an action waits behind it', () => {
    expect(headWait([save('f1', 1000), submit], 1000)).toBe(0);
  });

  it('sends a save at once when the page asks to flush', () => {
    expect(headWait([save('f1', 1000)], 1000, true)).toBe(0);
  });

  it('sends at once a save the store queued itself, with no keystroke time', () => {
    expect(headWait([save('f1')], 1000)).toBe(0);
  });
});
