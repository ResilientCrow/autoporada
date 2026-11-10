import { ScopeViolation, type IssueItemRepo, type TxContext } from '@/application/ports';
import { SECTIONS, type Outline, type OutlineRow } from '@/domain/outline';
import { can } from '@/domain/policy';
import { compareDates, toIsoDate, type CalDate } from '@/domain/time';

import { guard, refusedBy } from './guards';
import type { FakeTxState } from './state';

const chars = (text: string) => [...text].length;

/** A row's CHECKs of migration 0033, by name. */
function checkRow(row: OutlineRow, section: string, position: number): void {
  if (position > 59) throw refusedBy('issue_items_position');
  if ((row.sourcePointId === null) !== (row.title !== null && row.body !== null)) {
    throw refusedBy('issue_items_kind');
  }
  if (
    row.sourcePointId !== null &&
    (row.slot !== null || row.persistence !== 'once' || row.lineageId !== row.sourcePointId)
  ) {
    throw refusedBy('issue_items_source');
  }
  if (row.slot !== null && (section !== 'pokyny' || row.persistence !== 'standing')) {
    throw refusedBy('issue_items_slot');
  }
  if ((row.slot !== 'partners' && row.quotes.length > 0) || row.quotes.length > 20) {
    throw refusedBy('issue_items_quotes');
  }
  if (row.title !== null && (chars(row.title) < 1 || chars(row.title) > 300)) {
    throw refusedBy('issue_items_title');
  }
  const bytes =
    Buffer.byteLength(JSON.stringify(row.body ?? '')) + JSON.stringify(row.quotes).length;
  if (bytes > 131072) throw refusedBy('issue_items_size');
}

/** The outline rows over the fake state, with the CHECKs and unique keys of `issue_items`. */
export function fakeIssueItemRepo(tx: FakeTxState, ctx: TxContext): IssueItemRepo {
  const { principal } = ctx;
  const { issues, issueItems, issueTexts } = tx.draft;
  const empty = (): Outline => ({ pokyny: [], hospodareni: [] });
  const hasRows = (o: Outline) => o.pokyny.length + o.hospodareni.length > 0;
  /** Issues before the Monday, latest first. */
  const earlier = (monday: Parameters<IssueItemRepo['latestSourceBefore']>[0]) =>
    [...issues.values()]
      .filter((i) => compareDates(i.monday, monday) < 0)
      .sort((a, b) => compareDates(b.monday, a.monday));

  return {
    async forIssue(issueId) {
      guard(tx, false);
      return structuredClone(issueItems.get(issueId) ?? empty());
    },
    async replace(issueId, outline) {
      guard(tx, true);
      if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.edit' })) {
        throw new ScopeViolation();
      }
      const all = SECTIONS.flatMap((section) =>
        outline[section].map((row, position) => ({ row, section, position })),
      );
      for (const { row, section, position } of all) checkRow(row, section, position);
      const seen = (key: (r: OutlineRow) => string | null, name: string) => {
        const keys = all.map(({ row }) => key(row)).filter((k) => k !== null);
        if (new Set(keys).size !== keys.length) throw refusedBy(name);
      };
      seen((r) => r.lineageId, 'issue_items_lineage_key');
      seen((r) => r.slot, 'issue_items_slot_key');
      seen((r) => r.sourcePointId, 'issue_items_source_key');
      issueItems.set(issueId, structuredClone(outline));
      tx.written.push({ type: 'issue', id: issueId });
    },
    async handOverAnnexes(from, to) {
      guard(tx, true);
      if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.edit' })) {
        throw new ScopeViolation();
      }
      // The annexes live next to the settings, where `settings.value` reads them (arch_annexes).
      const keyOf = (monday: CalDate) => `arch.annexes.${toIsoDate(monday).replaceAll('-', '')}`;
      const own = tx.draft.settings.get(keyOf(from));
      if (!own) return 0;
      const moving = own.value as unknown[];
      tx.draft.settings.delete(keyOf(from));
      if (to === null || moving.length === 0) return moving.length;
      const kept = tx.draft.settings.get(keyOf(to));
      const annexes = [...((kept?.value as unknown[] | undefined) ?? []), ...moving];
      tx.draft.settings.set(keyOf(to), {
        value: structuredClone(annexes),
        version: (kept?.version ?? 0) + 1,
      });
      return moving.length;
    },
    async textsOf(issueId) {
      guard(tx, false);
      const issue = [...issues.values()].find((i) => i.id === issueId);
      const own = issue && issueTexts.get(toIsoDate(issue.monday));
      return structuredClone(own ?? { present: null, guests: null, annex2: null });
    },
    async latestSourceBefore(monday) {
      guard(tx, false);
      for (const issue of earlier(monday)) {
        const outline = issueItems.get(issue.id);
        if (outline && hasRows(outline)) {
          return {
            status: issue.status,
            meetingDate: issue.meetingDate,
            outline: structuredClone(outline),
          };
        }
      }
      return null;
    },
    async latestTextsBefore(monday) {
      guard(tx, false);
      const texts = earlier(monday).map((i) => issueTexts.get(toIsoDate(i.monday)));
      const latest = <K extends 'present' | 'guests' | 'annex2'>(key: K) => {
        const found = texts.find((t) => t?.[key] !== undefined && t[key] !== null);
        return structuredClone(found?.[key] ?? null);
      };
      return { present: latest('present'), guests: latest('guests'), annex2: latest('annex2') };
    },
  };
}
