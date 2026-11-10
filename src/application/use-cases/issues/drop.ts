import { defineUseCase, fail, ok, readSetting } from '@/application/core';
import type { AuditTarget, IssueRecord, Tx } from '@/application/ports';
import { dropIssueInput, dropIssueOutput } from '@/contracts';
import { planDrop } from '@/domain/calendar';
import { isRichDocEmpty } from '@/domain/richtext';
import { compareDates, toIsoDate } from '@/domain/time';

import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';

/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

/** What the heir took over, as counts for the audit event. */
interface Handover {
  readonly items: number;
  readonly texts: number;
  readonly annexes: number;
}

/**
 * Hands the prepared content of `dropped` to `heir` (ADR 0054 item 4). An open heir takes the
 * outline if it has none of its own (else the dropped one's is only deleted), fills the texts it
 * has not written (Přítomni, Hosté, Příloha 2) and takes the Arch annexes; a generated heir takes
 * nothing, and the dropped porada's outline and annexes are deleted. The row's texts go with its
 * deletion. The heir's version is taken by the writes it makes, and the new record comes back.
 */
async function handOver(tx: Tx, dropped: IssueRecord, heir: IssueRecord): Promise<Handover> {
  const outline = await tx.issueItems.forIssue(dropped.id);
  const hasItems = outline.pokyny.length + outline.hospodareni.length > 0;
  // The rows leave the dropped porada first: their unique keys and its deletion allow no copy.
  if (hasItems) await tx.issueItems.replace(dropped.id, { pokyny: [], hospodareni: [] });
  if (heir.status !== 'open') {
    await tx.issueItems.handOverAnnexes(dropped.monday, null);
    return { items: 0, texts: 0, annexes: 0 };
  }

  let current = heir;
  let items = 0;
  if (hasItems) {
    const own = await tx.issueItems.forIssue(heir.id);
    if (own.pokyny.length + own.hospodareni.length === 0) {
      current = await tx.issues.touch(current.id, current.version);
      await tx.issueItems.replace(heir.id, outline);
      items = outline.pokyny.length + outline.hospodareni.length;
    }
  }
  const from = await tx.issueItems.textsOf(dropped.id);
  const to = await tx.issueItems.textsOf(heir.id);
  const fill = {
    ...(to.present === null && from.present !== null && { present: from.present }),
    ...(to.guests === null && from.guests !== null && { guests: from.guests }),
    ...(to.annex2 === null &&
      from.annex2 !== null &&
      !isRichDocEmpty(from.annex2) && { annex2: from.annex2 }),
  };
  const texts = Object.keys(fill).length;
  if (texts > 0) await tx.issues.setTexts(current.id, current.version, fill);
  const annexes = await tx.issueItems.handOverAnnexes(dropped.monday, heir.monday);
  return { items, texts, annexes };
}

/**
 * „Porada se nekoná“ (ADR 0054 item 4): the open porada of `monday` is removed. In one
 * transaction, under the calendar lock in update mode: the coming Mondays before it with no row
 * get rows (they stay poradas), the next porada after it (its heir, a virtual one made now) gets a
 * row and `calendar.plannedThrough` rises to its Monday, the prepared content passes to the heir
 * (`handOver`), and the porada's outline, annexes and row are deleted. Points are not written:
 * their cumulative rule places them in the next porada. Allowed after the deadline. Sends no mail.
 * The audit event carries dates and counts only.
 */
export const dropIssue = defineUseCase({
  name: 'issues.drop',
  mode: 'write',
  input: dropIssueInput,
  output: dropIssueOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, now }, input) {
    await tx.settings.lock('deadline', 'update');
    if (!input.confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });

    const { slots, rule, plannedThrough } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'not-found' });
    const planned = planDrop(slots, slot, { rule, plannedThrough });
    if (!planned.ok) return fail({ code: 'rule', rule: 'issue-not-open' });
    const { fill, heir, plannedThrough: through } = planned;

    const window = { rule, plannedThrough };
    const made: AuditTarget[] = [];
    for (const empty of fill) {
      const ensured = await ensureIssue(tx, empty.monday, window);
      if (!ensured) return fail({ code: 'not-found' });
      if (ensured.inserted) made.push({ type: 'issue', id: ensured.issue.id });
    }
    const dropped = await ensureIssue(tx, monday, window);
    const heiress = await ensureIssue(tx, heir.monday, window);
    if (!dropped || !heiress) return fail({ code: 'not-found' });
    if (dropped.issue.version !== (input.expectedVersion ?? UNTOUCHED_VERSION)) {
      return fail({ code: 'conflict' });
    }

    const handed = await handOver(tx, dropped.issue, heiress.issue);
    await tx.issues.remove(dropped.issue.id, dropped.issue.version);
    const stored = await readSetting(tx, 'calendar');
    const value = { plannedThrough: toIsoDate(through) };
    if (stored.value.plannedThrough !== value.plannedThrough) {
      if ((await tx.settings.save('calendar', value, stored.version)) === null) {
        return fail({ code: 'conflict' });
      }
    }

    const heirTarget: AuditTarget = { type: 'issue', id: heiress.issue.id };
    await tx.audit.record({
      action: 'issue.dropped',
      target: { type: 'issue', id: dropped.issue.id },
      meta: {
        monday: toIsoDate(monday),
        meetingDate: toIsoDate(dropped.issue.meetingDate),
        heir: toIsoDate(heir.monday),
        filled: fill.length,
        handedItems: handed.items,
        handedTexts: handed.texts,
        handedAnnexes: handed.annexes,
      },
      related: [...made, heirTarget],
    });
    return ok({
      heir: { monday: toIsoDate(heir.monday), meetingDate: toIsoDate(heiress.issue.meetingDate) },
    });
  },
});
