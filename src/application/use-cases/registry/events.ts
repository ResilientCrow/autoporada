import type { RegistryEntryValues } from '@/application/ports';

/** The unique index `registry_entries_active_key` compares stored text exactly; so does this. */
export const sameStudent = (a: RegistryEntryValues, b: RegistryEntryValues) =>
  a.familyName === b.familyName && a.givenName === b.givenName && a.classCode === b.classCode;

const FIELDS = ['givenName', 'familyName', 'classCode'] as const;
export type EntryField = (typeof FIELDS)[number];

/** The fields of an entry in which `after` differs from `before`, in the order the audit lists them. */
export const changedEntryFields = (
  before: RegistryEntryValues,
  after: RegistryEntryValues,
): readonly EntryField[] => FIELDS.filter((field) => before[field] !== after[field]);
