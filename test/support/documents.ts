import { system } from '@/application/ports';
import type { CalDate } from '@/domain/time';

import { issueFixtures } from './issues';
import { snapshotFixture } from './snapshots';
import type { World } from './world';

/**
 * Generated documents without running a generation: a porada of the given Monday, marked
 * generated, with a document composed from the template replica snapshot (17 points, every block
 * kind), or from the snapshot given.
 */
export function documentFixtures(world: World) {
  const fixtures = issueFixtures(world);
  const seeder = system('test.seed');

  async function stored(
    monday: CalDate,
    options: { meetingDate?: CalDate; snapshot?: ReturnType<typeof snapshotFixture> } = {},
  ) {
    const row = await fixtures.issue(monday, {
      status: 'generated',
      ...(options.meetingDate && { meetingDate: options.meetingDate }),
    });
    return world.tx(seeder, async (tx) => {
      const document = await tx.documents.insert({
        issueId: row.id,
        snapshot: options.snapshot ?? snapshotFixture('template-replica'),
        docx: new Uint8Array([0x50, 0x4b, 3, 4]),
      });
      await tx.audit.record({ action: 'test.seed', target: { type: 'document', id: document.id } });
      return document;
    });
  }

  return { stored };
}
