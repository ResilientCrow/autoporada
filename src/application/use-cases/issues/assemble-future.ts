import type { FutureItemRecord } from '@/application/ports';
import { snapshotPerson } from '@/document';
import { routeFutureItem } from '@/domain/calendar';
import { singleLine } from '@/domain/richtext';
import { toIsoDate, toIsoTime, type CalDate } from '@/domain/time';
import type { SnapshotFutureItem } from '@/snapshot';

/** A jednání or akce as the snapshot prints it; one without a start date cannot be (it is left out). */
export function futureItemOf(item: FutureItemRecord): SnapshotFutureItem[] {
  const c = item.content;
  if (c.startDate === null) return [];
  const place = c.place ? singleLine(c.place) : '';
  const people = (c.responsible?.people ?? []).flatMap((p) => snapshotPerson(p) ?? []);
  const behalfOf = c.responsible?.behalfOf ? singleLine(c.responsible.behalfOf) : '';
  return [
    {
      id: item.id,
      kind: item.kind,
      title: singleLine(c.title),
      date: toIsoDate(c.startDate),
      ...(c.endDate && { endDate: toIsoDate(c.endDate) }),
      ...(c.timeFrom && { timeFrom: toIsoTime(c.timeFrom) }),
      ...(c.timeTo && { timeTo: toIsoTime(c.timeTo) }),
      ...(c.campus && { campus: c.campus }),
      ...(place && { place }),
      ...(c.responsible &&
        people.length > 0 && {
          responsible: { verb: c.responsible.verb, ...(behalfOf && { behalfOf }), people },
        }),
    },
  ];
}

/** Whether a waiting item falls in the meetings or events window of the meeting (the preflight's „akce čeká“). */
export function inAgendaWindow(item: FutureItemRecord, meeting: CalDate): boolean {
  const c = item.content;
  if (c.startDate === null) return false;
  const slot = routeFutureItem(
    { kind: item.kind, date: c.startDate, ...(c.endDate && { endDate: c.endDate }) },
    meeting,
  );
  return slot === 'meetings' || slot === 'events';
}
