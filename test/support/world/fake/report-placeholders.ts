import { ScopeViolation, type ReportPlaceholderRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';
import { POINT_LIMITS } from '@/domain/report';

import { guard, refusedBy } from './guards';
import type { FakeState, FakeTxState } from './state';

const codePoints = (text: string) => [...text].length;

/**
 * What migrations 0047 and 0055 refuse, in PostgreSQL's order: the CHECKs by name, then the
 * foreign key.
 */
function refuse(
  state: FakeState,
  futureItemId: string,
  paragraph: string | null,
  confirmedOriginal: string | null,
): void {
  const outOfBounds = (text: string | null) =>
    text !== null && (codePoints(text) < 1 || codePoints(text) > POINT_LIMITS.placeholder);
  if (outOfBounds(confirmedOriginal)) throw refusedBy('report_placeholders_confirmed_original');
  if (paragraph === null && confirmedOriginal === null) {
    throw refusedBy('report_placeholders_not_empty');
  }
  if (outOfBounds(paragraph)) throw refusedBy('report_placeholders_paragraph');
  if (!state.futureItems.has(futureItemId)) {
    throw refusedBy('report_placeholders_future_item_id_future_items_id_fk');
  }
}

/** The placeholder repository over the fake state: one paragraph per akce, with a version. */
export function fakeReportPlaceholderRepo(tx: FakeTxState, ctx: TxContext): ReportPlaceholderRepo {
  const { principal } = ctx;
  const { reportPlaceholders } = tx.draft;
  const mayRead = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.preview' })) {
      throw new ScopeViolation();
    }
  };
  const mayWrite = () => {
    if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.edit' })) {
      throw new ScopeViolation();
    }
  };

  return {
    async many(futureItemIds) {
      guard(tx, false);
      mayRead();
      return futureItemIds.flatMap((id) => {
        const row = reportPlaceholders.get(id);
        return row ? [{ ...row }] : [];
      });
    },
    async save(futureItemId, paragraph, expectedVersion) {
      guard(tx, true);
      mayWrite();
      const current = reportPlaceholders.get(futureItemId);
      // An insert is checked before it meets an existing row; an update only once it matches one.
      if (expectedVersion === 0) refuse(tx.draft, futureItemId, paragraph, null);
      if ((current?.version ?? 0) !== expectedVersion) return null;
      refuse(tx.draft, futureItemId, paragraph, null);
      const version = expectedVersion + 1;
      reportPlaceholders.set(futureItemId, {
        futureItemId,
        paragraph,
        confirmedOriginal: null,
        version,
      });
      tx.written.push({ type: 'future_item', id: futureItemId });
      return version;
    },
    async confirm(futureItemId, original, expectedVersion) {
      guard(tx, true);
      mayWrite();
      const current = reportPlaceholders.get(futureItemId);
      if (expectedVersion === 0) refuse(tx.draft, futureItemId, null, original);
      if ((current?.version ?? 0) !== expectedVersion) return null;
      refuse(tx.draft, futureItemId, current?.paragraph ?? null, original);
      const version = expectedVersion + 1;
      reportPlaceholders.set(futureItemId, {
        futureItemId,
        paragraph: current?.paragraph ?? null,
        confirmedOriginal: original,
        version,
      });
      tx.written.push({ type: 'future_item', id: futureItemId });
      return version;
    },
    async remove(futureItemId, expectedVersion) {
      guard(tx, true);
      mayWrite();
      if (reportPlaceholders.get(futureItemId)?.version !== expectedVersion) return false;
      reportPlaceholders.delete(futureItemId);
      tx.written.push({ type: 'future_item', id: futureItemId });
      return true;
    },
  };
}
