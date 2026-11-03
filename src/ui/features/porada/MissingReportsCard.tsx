import { formatDayMonth } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { porada } from '@/ui/copy';
import { ArrowLink, Card } from '@/ui/kit';

/** The working porada and how many of the akce it owes have no report handed in. */
interface ReportTally {
  readonly monday: string;
  readonly meetingDate: string;
  readonly owed: number;
  readonly missing: number;
}

/**
 * The headmaster's count on Přehled (ADR 0052): „Zprávy z akcí pro poradu …: neodevzdáno n z m“,
 * linking „Chybějící zprávy“ of that porada. Counts only: no titles, no names.
 */
export function MissingReportsCard({ tally }: { readonly tally: ReportTally }) {
  return (
    <Card title={porada.missing.title}>
      <p>
        <ArrowLink href={`/porada/${tally.monday}/zpravy`}>
          {porada.missing.tally(
            formatDayMonth(parseIsoDate(tally.meetingDate)),
            tally.missing,
            tally.owed,
          )}
        </ArrowLink>
      </p>
    </Card>
  );
}
