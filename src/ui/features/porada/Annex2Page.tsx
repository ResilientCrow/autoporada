import type { RichDoc } from '@/domain/richtext';
import { porada } from '@/ui/copy';
import { ArrowLink, SlantLabel } from '@/ui/kit';

import { Annex2Form } from './Annex2Form';
import type { Annex2Action } from './issue-texts';

/** „Příloha 2“ as /porada/[datum]/priloha-2 shows it. */
export function Annex2Page({
  model,
  action,
}: {
  readonly model: {
    readonly meeting: string;
    readonly monday: string;
    readonly version: number | null;
    readonly annex2: RichDoc;
    readonly carried: { readonly annex2: boolean };
  };
  readonly action: Annex2Action;
}) {
  return (
    <>
      <SlantLabel level={1}>{porada.annex2.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{porada.meeting(model.meeting)}</p>
        <Annex2Form
          action={action}
          monday={model.monday}
          start={{
            version: model.version,
            annex2: model.annex2,
            carried: model.carried.annex2,
          }}
        />
        <ArrowLink href={`/porada/${model.monday}`}>{porada.annex2.back}</ArrowLink>
      </div>
    </>
  );
}
