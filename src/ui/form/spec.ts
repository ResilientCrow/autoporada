import type { FieldIssueCode } from '@/contracts';
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
