import { campusOf, pickedTime, typedDate, type PointContentWire } from './fields';

export type Patch = Partial<PointContentWire>;

/** The editor fields that take text, a date, a time or a campus choice from a control. */
export type PatchName =
  'title' | 'eventDate' | 'endDate' | 'timeFrom' | 'timeTo' | 'campus' | 'place';

/**
 * What a control's new value does to the content: the patch for the field named `name`.
 * A date or time the server would refuse leaves the field as `content` has it.
 */
export function patchFor(name: PatchName, value: string, content: PointContentWire): Patch {
  switch (name) {
    case 'title':
      return { title: value };
    case 'eventDate':
    case 'endDate':
      return { [name]: typedDate(value, content[name]).value };
    case 'timeFrom':
    case 'timeTo':
      return { [name]: pickedTime(value, content[name]) };
    case 'campus':
      return { campus: campusOf(value) };
    case 'place':
      return { place: value === '' ? null : value };
  }
}

/** The content with the patch applied; the content it was given stays as it was. */
export function withPatch(content: PointContentWire, patch: Patch): PointContentWire {
  return { ...content, ...patch };
}
