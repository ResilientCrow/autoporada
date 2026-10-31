import { porada } from '@/ui/copy';
import { ArrowLink, SlantLabel } from '@/ui/kit';

import { DetailsForm } from './DetailsForm';
import type { DetailsAction } from './issue-texts';

/** „Údaje“ as /porada/[datum]/udaje shows it. */
export function DetailsPage({
  model,
  action,
}: {
  readonly model: {
    readonly meeting: string;
    readonly monday: string;
    readonly version: number | null;
    readonly present: string;
    readonly guests: string;
    readonly carried: { readonly present: boolean; readonly guests: boolean };
  };
  readonly action: DetailsAction;
}) {
  return (
    <>
      <SlantLabel level={1}>{porada.details.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{porada.meeting(model.meeting)}</p>
        <DetailsForm
          action={action}
          monday={model.monday}
          start={{
            version: model.version,
            present: model.present,
            guests: model.guests,
            carried: model.carried.present || model.carried.guests,
          }}
        />
        <ArrowLink href={`/porada/${model.monday}`}>{porada.details.back}</ArrowLink>
      </div>
    </>
  );
}
