/**
 * What the headmaster's preview once showed: the snapshot of a Monday's issue as it would print
 * now, what the assembler left out, and the preflight findings. A read through the assembler and
 * the preflight, as `issues.generate` runs them; no use case any more.
 */
import { system } from '@/application/ports';
import { assembleIssueSnapshot } from '@/application/use-cases/issues/assemble';
import { mondayOfText } from '@/application/use-cases/issues/calendar';
import { preflight } from '@/application/use-cases/issues/preflight';
import { toIsoDate, type CalDate } from '@/domain/time';

import type { World } from './world';

/** The preview of `monday` (an ISO date), or null when the Monday is no porada (not a Monday, or no row up to the boundary). */
export async function previewOf(world: World, monday: string | CalDate) {
  const day = typeof monday === 'string' ? mondayOfText(monday) : monday;
  if (!day) return null;
  return world.tx(
    system('test.seed'),
    async (tx) => {
      const assembled = await assembleIssueSnapshot(tx, day, { now: world.clock.now() });
      if (!assembled) return null;
      const { snapshot, problems, facts } = assembled;
      const now = world.clock.now();
      return {
        snapshot: snapshot === null ? null : JSON.stringify(snapshot),
        problems: problems.map((p) =>
          p.code === 'snapshot-invalid' ? { ...p, paths: [...p.paths] } : p,
        ),
        findings: preflight(facts, problems, now).map(({ refs, paths, earlier, ...finding }) => ({
          ...finding,
          ...(earlier && {
            earlier: {
              monday: toIsoDate(earlier.monday),
              meetingDate: toIsoDate(earlier.meetingDate),
            },
          }),
          ...(refs && {
            refs: refs.map(({ due, ...r }) => ({
              ...r,
              ...(due && { due: due.toISOString() }),
            })),
          }),
          ...(paths && { paths: [...paths] }),
        })),
        origin:
          facts.origin.kind === 'derived'
            ? { kind: facts.origin.kind, from: toIsoDate(facts.origin.from), how: facts.origin.how }
            : facts.origin,
      };
    },
    'read',
  );
}
