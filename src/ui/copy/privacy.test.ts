import { describe, expect, it } from 'vitest';

import { reviewsOf } from '../../../test/support/privacy';

import { privacy } from './privacy';
import type { PrivacyCopy } from './privacy-types';

/** An approved notice has nothing left to confirm and says since when it holds. */
function approvalProblems(notice: PrivacyCopy): string[] {
  if (!notice.approved) return [];
  return [
    reviewsOf(notice).length > 0 && 'approved with open reviews',
    notice.effectiveFrom === null && 'approved without an effective date',
  ].filter((problem): problem is string => problem !== false);
}

describe('approval', () => {
  it('holds for the notice as it is', () => {
    expect(approvalProblems(privacy)).toEqual([]);
  });

  it('fails an approved notice that still has reviews or no date (both directions)', () => {
    const approved: PrivacyCopy = { ...privacy, approved: true, effectiveFrom: '2027-09-01' };
    expect(approvalProblems(approved)).toEqual(['approved with open reviews']);
    const clean = { ...approved, summary: [], sections: [] };
    expect(approvalProblems(clean)).toEqual([]);
    expect(approvalProblems({ ...clean, effectiveFrom: null })).toEqual([
      'approved without an effective date',
    ]);
  });

  it('counts a flag on a summary bullet, though no section has one', () => {
    const flagged: PrivacyCopy = {
      ...privacy,
      approved: true,
      effectiveFrom: '2027-09-01',
      summary: [{ text: 'x', review: { by: 'dpo', note: 'Ověřit x.' } }],
      sections: [],
    };
    expect(approvalProblems(flagged)).toEqual(['approved with open reviews']);
  });

  it('is still a draft, since reviews are open', () => {
    expect(privacy.approved).toBe(false);
    expect(reviewsOf(privacy).length).toBeGreaterThan(0);
  });
});

describe('sections', () => {
  const ids: string[] = privacy.sections.map((section) => section.id);

  it('have unique lowercase slug ids, never the skip-link target', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    expect(ids).not.toContain('obsah');
  });

  it('each have a title and at least one block', () => {
    for (const section of privacy.sections) {
      expect(section.title.trim()).not.toBe('');
      expect(section.blocks.length).toBeGreaterThan(0);
    }
  });

  it('open with the controller and the officer', () => {
    expect(ids.slice(0, 2)).toEqual(['spravce', 'poverenec']);
  });
});

describe('review notes', () => {
  it('are short tasks that begin with a verb, never commentary', () => {
    for (const review of reviewsOf(privacy))
      expect(review.note).toMatch(/^(?:Ověřit|Stanovit)[ ,][^]+\.$/);
  });
});
