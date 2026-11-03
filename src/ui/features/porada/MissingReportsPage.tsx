import { POINT_LOOK } from '@/ui/status';
import { porada } from '@/ui/copy';
import { ArrowLink, Item, ItemList, Meta, Notice, SlantLabel, Stack, StatusChip } from '@/ui/kit';

import { MissingReportForm } from './MissingReportForm';
import type { PlaceholderAction } from './placeholder';

const { missing } = porada;

/** An akce the porada lacks a report for, with its dates written out. */
interface MissingReportView {
  readonly id: string;
  readonly title: string;
  /** „5.–6. 11. 2026“. */
  readonly dates: string;
  /** Where the report point stands; `none` when nobody started one. */
  readonly state: keyof typeof missing.state;
  readonly paragraph: string;
  readonly original: string;
  readonly own: boolean;
  readonly version: number;
}

/** A report's state is the point's, so the chip's tone is too; „not started“ is neutral. */
const toneOf = (state: MissingReportView['state']) =>
  state === 'none' ? 'neutral' : POINT_LOOK[state].tone;

/**
 * „Chybějící zprávy“ as /porada/[datum]/zpravy shows it (ADR 0049): each akce the porada owes a
 * report for and does not have one, with the paragraph the document prints instead. A generated or
 * skipped porada shows no form.
 */
export function MissingReportsPage({
  model,
  action,
}: {
  readonly model: {
    readonly meeting: string;
    readonly monday: string;
    readonly open: boolean;
    /** The fixed lines the document adds under a placeholder. */
    readonly lines: readonly string[];
    readonly reports: readonly MissingReportView[];
  };
  readonly action: PlaceholderAction;
}) {
  return (
    <>
      <SlantLabel level={1}>{missing.title}</SlantLabel>
      <div className="mt-4">
        <Stack gap="section">
          <p>{porada.meeting(model.meeting)}</p>
          {!model.open && (
            <Notice tone="info" live={false}>
              {missing.closed}
            </Notice>
          )}
          {model.open && model.reports.length === 0 && <p>{missing.empty}</p>}
          {model.open && model.reports.length > 0 && (
            <>
              <p>{missing.intro}</p>
              <ItemList>
                {model.reports.map((report) => (
                  <Item
                    key={report.id}
                    title={report.title}
                    heading={2}
                    badges={
                      <StatusChip tone={toneOf(report.state)}>
                        {missing.state[report.state]}
                      </StatusChip>
                    }
                  >
                    <Meta>{missing.when(report.dates)}</Meta>
                    <MissingReportForm
                      action={action}
                      monday={model.monday}
                      start={report}
                      lines={model.lines}
                    />
                  </Item>
                ))}
              </ItemList>
            </>
          )}
          <ArrowLink href={`/porada/${model.monday}`}>{missing.back}</ArrowLink>
        </Stack>
      </div>
    </>
  );
}
