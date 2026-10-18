import type { DocumentModel } from '../model';

/**
 * Guarantees both renderers rely on. A violation is a bug in compose, so it
 * throws rather than letting a malformed official document out.
 */
export function assertModelInvariants(model: DocumentModel): void {
  const problems: string[] = [];
  const [main, table, ...rest] = model.sections;

  if (main?.layout !== 'single' || main.blocks[0]?.kind !== 'title') {
    problems.push('the first section must start with the title');
  }
  if (
    table?.layout !== 'twoColumn' ||
    table.blocks.length !== 1 ||
    table.blocks[0]?.kind !== 'studentTable'
  ) {
    problems.push('the second section must hold exactly the Příloha 1 table');
  }
  if (rest.some((s) => s.layout !== 'nextPage'))
    problems.push('only Příloha 2 may follow the table');

  const numbers = model.sections.flatMap((s) =>
    s.blocks.flatMap((b) => (b.kind === 'point' ? [b.number] : [])),
  );
  if (numbers.some((n, i) => n !== i + 1))
    problems.push(`points must be numbered 1…n, got ${numbers.join(',')}`);

  for (const section of model.sections) {
    for (const b of section.blocks) {
      if (
        (b.kind === 'bullet' || b.kind === 'body' || b.kind === 'rich') &&
        b.runs.some((r) => r.text === '')
      ) {
        problems.push(`${b.kind} has an empty run`);
      }
    }
  }
  if (problems.length > 0) throw new Error(`Invalid document model: ${problems.join('; ')}`);
}
