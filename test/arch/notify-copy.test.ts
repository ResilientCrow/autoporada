/** notify may not import ui, so the sentences the mails share with the screens are compared here. */
import { describe, expect, it } from 'vitest';

import { typographizeText } from '@/domain/cs';
import { cooldownEnd } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';
import { renderMail } from '@/notify';
import { day } from '@/server/pages/dates';
import { access } from '@/ui/copy/access';

const ORIGIN = 'https://autoporada.example';

describe('mails repeat the access screens', () => {
  it('rejection: the cooldown sentences and the date, byte for byte', () => {
    const decidedAt = new Date('2026-10-01T10:00:00Z');
    const until = cooldownEnd(decidedAt);
    const retryFrom = instantToWallClock(until).date;

    // The page text is „Vedení školy žádost zamítlo <decided>. <rest>“; the mail has its own first sentence.
    const [, ...rest] = access.cooldown.text('DECIDED', 'FROM').split('. ');
    const date = typographizeText(day(until.toISOString()));
    const shared = rest.join('. ').replace('FROM', date);

    const { text } = renderMail('access.rejected', { retryFrom }, ORIGIN);
    expect(text).toContain(shared);
  });

  it('block: the advice to turn to the school, byte for byte', () => {
    expect(renderMail('access.blocked', {}, ORIGIN).text).toContain(access.blocked.text);
  });
});
