import { points } from '@/ui/copy';
import type { FormSpec, FormState } from '@/ui/form';

export const EDITOR_FORM_ID = 'bod';

/**
 * The report editor's fields, in page order. A draft may be unfinished, so nothing
 * here is enforced: the title and the first date carry no „(nepovinné)“ because
 * submitting asks for them (readiness).
 */
export const EDITOR_SPEC: FormSpec = {
  title: { label: points.editor.title, required: true },
  eventDate: { label: points.facts.eventDate, required: true },
  endDate: { label: points.facts.endDate },
  timeFrom: { label: points.facts.timeFrom },
  timeTo: { label: points.facts.timeTo },
  campus: { label: points.facts.campus },
  place: { label: points.facts.place },
  body: { label: points.editor.body },
};

/**
 * Autosave is the only way this form saves, so it never submits: React Aria's ComboBox
 * (in the people rows to come) lets Enter through while its list is closed, and a native
 * submit would reload the page over the author's text.
 */
export const EDITOR_FORM_STATE: FormState = {
  issues: null,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: (event) => event.preventDefault(),
};
