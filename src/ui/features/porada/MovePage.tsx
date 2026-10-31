import { porada } from '@/ui/copy';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';

import { MoveForm, type MoveAction } from './MoveForm';
import type { MoveView } from './move';

/** „Přesunout poradu“ as /porada/[datum]/presunout shows it. */
export function MovePage({
  model,
  moveIssue,
}: {
  readonly model: { readonly monday: string; readonly meeting: string; readonly view: MoveView };
  readonly moveIssue: MoveAction;
}) {
  return (
    <>
      <SlantLabel level={1}>{porada.move.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <Card level={2} title={porada.meeting(model.meeting)}>
          <MoveForm action={moveIssue} view={model.view} />
        </Card>
        <ArrowLink href={`/porada/${model.monday}`}>{porada.move.back}</ArrowLink>
      </div>
    </>
  );
}
