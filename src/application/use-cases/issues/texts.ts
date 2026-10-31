import { defineUseCase, fail, ok } from '@/application/core';
import { bodyWire, issueTextsInput, issueTextsOutput } from '@/contracts';
import { emptyRichDoc } from '@/domain/richtext';
import { compareDates, toIsoDate } from '@/domain/time';

import { mondayOfText, readWindow } from './calendar';
import { loadTexts } from './outline-store';

/**
 * Přítomni, Hosté and Příloha 2 of a porada for their editors: the stored text, else the one carried
 * from the latest earlier porada (`carried` says which), else empty. Nothing is written. A Monday
 * outside the calendar is not found.
 */
export const readIssueTexts = defineUseCase({
  name: 'issues.texts',
  mode: 'read',
  input: issueTextsInput,
  output: issueTextsOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const { slots } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });

    const [issue] = await tx.issues.between(monday, monday);
    const own = issue ? await tx.issueItems.textsOf(issue.id) : null;
    const texts = await loadTexts(tx, { id: issue?.id ?? null, monday });
    return ok({
      monday: toIsoDate(monday),
      meetingDate: toIsoDate(slot.meetingDate),
      version: issue?.version ?? null,
      present: texts.present,
      guests: texts.guests,
      annex2: bodyWire(texts.annex2 ?? emptyRichDoc()),
      carried: {
        present: (own?.present ?? null) === null,
        guests: (own?.guests ?? null) === null,
        annex2: (own?.annex2 ?? null) === null,
      },
    });
  },
});
