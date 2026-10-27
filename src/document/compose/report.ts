import { renderPeople, type Salutation } from '@/domain/cs';
import type { SnapshotBullet, SnapshotReport } from '@/snapshot';

import type { Block } from '../model';
import {
  finalRuns,
  finalText,
  point,
  quoted,
  richBlocks,
  statementLabel,
  type Tokens,
} from './text';

function bulletLine(bullet: SnapshotBullet, groupOrder?: readonly Salutation[]): Block {
  const text =
    bullet.kind === 'text'
      ? bullet.text
      : renderPeople(bullet.people, {
          join: 'comma',
          order: bullet.order,
          ...(groupOrder && { groupOrder }),
        });
  return {
    kind: 'reportLine',
    label: finalText(`${bullet.label}:`),
    runs: finalRuns([{ text: ` ${text}` }]),
  };
}

/**
 * One report as a numbered point: body, labelled bullets, then statements. The provoz section
 * and the single-point preview (fed by reportFromContent) both build on it.
 */
export function reportBlocks(
  report: SnapshotReport,
  opts: { groupOrder?: readonly Salutation[]; tokens: Tokens },
): Block[] {
  return point(report.title, [
    ...richBlocks(report.body, opts.tokens),
    ...report.bullets.map((b) => bulletLine(b, opts.groupOrder)),
    ...report.statements.map((s) => ({
      kind: 'reportLine' as const,
      label: statementLabel(s.speakerGenitive, s.affiliation),
      runs: [{ text: ` ${quoted(s.quote)}` }],
    })),
  ]);
}
