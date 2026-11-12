import { describe, expect, it } from 'vitest';

import { placeholderChecked, placeholderStatus } from './placeholder';

const closesAt = new Date('2026-10-22T12:00:00Z');
const before = new Date('2026-10-22T11:59:59Z');

describe('placeholderStatus', () => {
  it('is checked whatever else holds', () => {
    expect(placeholderStatus({ checked: true, report: 'submitted', closesAt }, before)).toBe(
      'checked',
    );
  });

  it('is handed-in while a report waits for a decision, before or after the close', () => {
    expect(placeholderStatus({ checked: false, report: 'submitted', closesAt }, before)).toBe(
      'handed-in',
    );
    expect(placeholderStatus({ checked: false, report: 'submitted', closesAt }, closesAt)).toBe(
      'handed-in',
    );
  });

  it('is open until the close and to-check from it', () => {
    expect(placeholderStatus({ checked: false, report: 'none', closesAt }, before)).toBe('open');
    expect(placeholderStatus({ checked: false, report: 'draft', closesAt }, closesAt)).toBe(
      'to-check',
    );
  });
});

describe('placeholderChecked', () => {
  it('holds only when the confirmed text equals the system text now', () => {
    expect(placeholderChecked('A', 'A')).toBe(true);
    expect(placeholderChecked('A', 'B')).toBe(false);
    expect(placeholderChecked(null, 'A')).toBe(false);
    expect(placeholderChecked('A', null)).toBe(false);
  });
});
