import { defineUseCase, fail, ok } from '@/application/core';
import { newSchoolYearInput, newSchoolYearOutput } from '@/contracts';
import { archiveYears } from '@/domain/registry';
import { instantToWallClock } from '@/domain/time';

/**
 * „Nový školní rok“: the headmaster, signed in afresh (step-up), archives the lists he ticked
 * under the current school year or the one before (ADR 0033). Their students that no document
 * ever listed are deleted, the others are kept as removed with the year; the lists stay. A box
 * left unticked, a year outside the two or a list that does not exist changes nothing. The
 * audit event names the lists by id, holds the year and how many students it cleared, and
 * lists the students it deleted or archived by the ids the statements returned.
 */
export const newSchoolYear = defineUseCase({
  name: 'registry.newSchoolYear',
  mode: 'write',
  input: newSchoolYearInput,
  output: newSchoolYearOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.newSchoolYear' }) },
  async execute({ tx, now }, input) {
    if (!input.confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const { options } = archiveYears(instantToWallClock(now).date);
    if (!options.includes(input.year)) {
      return fail({ code: 'invalid-input', fields: { year: 'invalid' } });
    }
    const ids = new Set(input.listIds);
    const chosen = (await tx.registry.lists()).filter((list) => ids.has(list.id));
    const [first, ...others] = chosen;
    if (first === undefined || chosen.length !== ids.size) return fail({ code: 'not-found' });
    // Named in the event, as every row the transaction changes must be (ADR 0011): the ids the
    // statements gave back, not a read taken before them.
    const { archived, deleted } = await tx.registry.archiveLists([...ids], input.year);
    await tx.audit.record({
      action: 'registry.school_year_archived',
      target: { type: 'registry_list', id: first.id },
      meta: { count: archived.length + deleted.length, year: input.year },
      related: [
        ...others.map((list) => ({ type: 'registry_list' as const, id: list.id })),
        ...[...archived, ...deleted].map((id) => ({ type: 'registry_entry' as const, id })),
      ],
    });
    return ok({ archived: archived.length, deleted: deleted.length });
  },
});
