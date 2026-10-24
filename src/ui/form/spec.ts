import type { FieldIssueCode, FieldIssues } from '@/contracts';
import { fieldIssues } from '@/ui/copy';

/**
 * One declaration per field: the label, the required marker, the inline message,
 * the summary text and the DOM id all derive from it, so they cannot drift apart.
 */
export interface FieldSpec {
  readonly label: string;
  readonly required?: boolean;
  /** Field-specific wording per issue code; anything missing uses the generic text. */
  readonly messages?: Partial<Readonly<Record<FieldIssueCode, string>>>;
}

/** Key = input name = the `FieldIssues` path; insertion order = page order. */
export type FormSpec = Readonly<Record<string, FieldSpec>>;

/** A DOM id unique per form; dots in paths (`statements.0.quote`) become dashes. */
export function fieldId(formId: string, name: string): string {
  return `${formId}-${name.replaceAll(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** The text for one issue: the field's own message, else the generic one. */
export function fieldMessage(spec: FormSpec, name: string, code: FieldIssueCode): string {
  return spec[name]?.messages?.[code] ?? fieldIssues[code];
}

export interface SummaryEntry {
  /** The control to link to; null for a path the spec does not declare. */
  readonly id: string | null;
  readonly text: string;
}

/**
 * What the error summary lists: one entry per issue, in the spec's (page) order,
 * as "Label: message" linked to its control. Paths the spec lacks come last,
 * unlinked, with the generic message.
 */
export function summaryItems(
  formId: string,
  spec: FormSpec,
  issues: FieldIssues,
): readonly SummaryEntry[] {
  const known = Object.keys(spec).flatMap((name) => {
    const code = issues[name];
    if (code === undefined) return [];
    return [
      {
        id: fieldId(formId, name),
        text: `${spec[name]!.label}: ${fieldMessage(spec, name, code)}`,
      },
    ];
  });
  const unknown = Object.keys(issues)
    .filter((name) => !(name in spec))
    .map((name) => ({ id: null, text: fieldIssues[issues[name]!] }));
  return [...known, ...unknown];
}

/**
 * A field's value among `values`. The controls offer nothing else, so a missing
 * or unknown one is a bug and throws.
 */
export function choiceOf<T extends string>(data: FormData, name: string, values: readonly T[]): T {
  const value = data.get(name);
  const found = values.find((candidate) => candidate === value);
  if (found === undefined) throw new Error(`The form sent no valid "${name}".`);
  return found;
}

/** A field's text from submitted data; '' when it is absent or not text (a file). */
export function textOf(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
