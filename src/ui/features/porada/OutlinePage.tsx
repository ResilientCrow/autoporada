import { porada } from '@/ui/copy';
import { ArrowLink, SlantLabel } from '@/ui/kit';

import { OriginBanner, type OutlineOriginView } from './OriginBanner';
import { OutlineList } from './OutlineList';
import type { OutlineActions, OutlineView } from './outline';

/** „Pokyny a hospodaření“ as /porada/[datum]/pokyny shows it. */
export function OutlinePage({
  model,
  actions,
}: {
  readonly model: {
    readonly meeting: string;
    readonly origin: OutlineOriginView;
    readonly view: OutlineView;
  };
  readonly actions: OutlineActions;
}) {
  return (
    <>
      <SlantLabel level={1}>{porada.outline.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{porada.meeting(model.meeting)}</p>
        <OriginBanner origin={model.origin} />
        <OutlineList view={model.view} actions={actions} />
        <ArrowLink href={`/porada/${model.view.monday}`}>{porada.outline.back}</ArrowLink>
      </div>
    </>
  );
}
