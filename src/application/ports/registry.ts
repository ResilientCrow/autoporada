/** A list of students the document prints (ADR 0033). */
export interface RegistryListRecord {
  readonly id: string;
  /** A slug, fixed once made; the URL names the list by it. */
  readonly key: string;
  readonly title: string;
  /** What the list is called inside the document. */
  readonly docLabel: string;
  /** `annex1` is Příloha 1 (exactly one, always active); `point4` the lists of point 4. */
  readonly purpose: 'annex1' | 'point4';
  readonly position: number;
  readonly active: boolean;
  readonly version: number;
}

/** What a user sets on a list; the key, the purpose and the version are not theirs to set. */
export type RegistryListValues = Pick<RegistryListRecord, 'title' | 'docLabel' | 'active'>;

/** One student on a list. Names and class only, no person id (ADR 0033). */
export interface RegistryEntryRecord {
  readonly id: string;
  readonly listId: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly classCode: string;
  readonly addedAt: Date;
  /** Set on an entry that was printed before it was removed or archived. */
  readonly removedAt: Date | null;
  readonly archivedYear: string | null;
  /** Null until M10 generates a document that lists the entry. */
  readonly firstPublishedIssueId: string | null;
  readonly version: number;
}

/** What a user sets on an entry. */
export type RegistryEntryValues = Pick<
  RegistryEntryRecord,
  'givenName' | 'familyName' | 'classCode'
>;

/** How many active entries a list has, and how many of them were never printed („NOVÉ“). */
export interface RegistryListCount {
  readonly listId: string;
  readonly active: number;
  readonly fresh: number;
}

/**
 * The registry lists and their entries. Entries are the names of students, so only a staff
 * reviewer reads them (`registry.view`) and only the headmaster writes (`registry.edit`); the
 * repository re-checks both for a user (ADR 0011). Not the worker's: it holds no grant.
 */
export interface RegistryRepo {
  /** Every list, inactive ones too, in `position` order. */
  lists(): Promise<readonly RegistryListRecord[]>;
  /** The list, or null for an unknown id. */
  list(id: string): Promise<RegistryListRecord | null>;
  /** The list, or null for an unknown key. */
  listByKey(key: string): Promise<RegistryListRecord | null>;
  /** The counts of active entries per list, for the lists that have any. */
  counts(): Promise<readonly RegistryListCount[]>;
  /** The list's active entries (`removed_at IS NULL`), in no particular order. */
  entries(listId: string): Promise<readonly RegistryEntryRecord[]>;
  /** The entry, removed ones too, or null for an unknown id. */
  entry(id: string): Promise<RegistryEntryRecord | null>;
  /**
   * New entries at version 1, in one statement: all or none. ConstraintViolation(
   * `registry_entries_active_key`) when one is already active on the list (or twice in `rows`).
   */
  addEntries(
    listId: string,
    rows: readonly RegistryEntryValues[],
  ): Promise<readonly RegistryEntryRecord[]>;
  /** StaleVersion for another version, an unknown or a removed entry; the same violation as `addEntries`. */
  updateEntry(
    id: string,
    expectedVersion: number,
    values: RegistryEntryValues,
  ): Promise<RegistryEntryRecord>;
  /**
   * Deletes an entry that was never printed (`first_published_issue_id IS NULL`), else sets its
   * `removed_at`. Gives which, or null when there is no active entry of that id.
   */
  removeEntry(id: string): Promise<'deleted' | 'archived' | null>;
  /**
   * A new `point4` list at the end, active, at version 1, with a key made from the title by the
   * caller. ConstraintViolation(`registry_lists_title_key`) for a title in use.
   */
  createList(key: string, values: RegistryListValues): Promise<RegistryListRecord>;
  /** StaleVersion for another version or an unknown id; ConstraintViolation as `createList`. */
  updateList(
    id: string,
    expectedVersion: number,
    values: RegistryListValues,
  ): Promise<RegistryListRecord>;
  /** Writes the positions 1..n in the order of `ids`, all lists named once. */
  orderLists(ids: readonly string[]): Promise<void>;
}
