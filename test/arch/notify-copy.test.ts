/** Every link a mail carries is an address of the Arch UI, the only UI. */
import { describe, expect, it } from 'vitest';

import { instantToWallClock } from '@/domain/time';
import { renderMail, TEMPLATE_NAMES } from '@/notify';

const ORIGIN = 'https://autoporada.example';

describe('mails link only the Arch UI', () => {
  it.each(TEMPLATE_NAMES)('%s', (name) => {
    const date = instantToWallClock(new Date('2026-10-01T10:00:00Z')).date;
    const view = {
      meetingDate: date,
      retryFrom: date,
      submitted: 2,
      accessRequests: 1,
      approved: 3,
      pending: 2,
      returned: 1,
      deadlineAt: new Date('2026-10-01T10:00:00Z'),
      due: new Date('2026-10-01T10:00:00Z'),
    };
    const { text } = renderMail(name, view as never, ORIGIN);
    for (const link of text.match(/https?:\/\/\S*/g) ?? []) {
      const path = link.slice(ORIGIN.length);
      expect(path === '/' || path.startsWith('/#/'), path).toBe(true);
    }
  });

  it('sends the author of a decided point to their points, where the note and the state are', () => {
    for (const name of ['point.returned', 'point.approved', 'point.rejected'] as const) {
      expect(renderMail(name, {}, ORIGIN).text).toContain(`\n${ORIGIN}/#/moje\n`);
    }
  });
});
