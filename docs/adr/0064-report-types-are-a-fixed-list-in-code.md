# 0064 — Report types are a fixed list in code

Supersedes ADR 0055 (the headmaster deletes an unused point type) and the
`point_types` part of ADR 0018 item 3 (its version trigger). Ends the
admin-defined point types of plan §1 („Point types are defined by admins“).
Applies to the Arch UI and the classic UI alike.

## Context

A report's type („Seminář“, „Exkurze“, …) picks the grammar of its opening
sentence („proběhl seminář …, který organizoval …“) and the bullets a new draft
starts with. The headmaster could create, rename, reorder, switch off and
delete types in Správa („Typy zpráv“, classic `/nastaveni/typy-bodu`). The
school does not use that: the six seeded types are the ones it wants, and an
edited type only risks a wrong opening sentence. The types stay; editing them
goes.

## Decision

1. **The types are a list in code.** `POINT_TYPES` in `domain/report` holds,
   in this order, Seminář (`seminar`), Exkurze (`exkurze`), Soutěž (`soutez`),
   Přednáška (`prednaska`), Projektový den (`projektovy`) and Jiné (`jine`),
   each with its title gender and default bullets as migrations 0014 and 0040
   seeded them. Jiné has no title gender, so its opening says „akce „…““. The
   keys are the prototype's. Changing a type is a code change; renaming a key
   or removing a type also needs a migration of `points.type_id`.
2. **A point names its type by key.** `points.type_id` holds the key as text,
   checked by `points_type` against the list. The table `point_types`, its
   foreign key and the enum `title_gender` are dropped. Contracts keep the
   field name `typeId`; its value is a key, no longer a uuid. A read-only
   mirror table was rejected: nothing would write it, and it would be a second
   copy of the list to keep in step.
3. **Migration 0058 maps the rows.** A point of a seeded type gets that type's
   key, matched by the seeded name. A point of any other type (one the
   headmaster added, or a seeded one renamed) gets `jine`. Each changed point's
   version rises by one, as `version_bump` requires; an editor open across the
   deploy sees a conflict. The custom types themselves are deleted.
4. **No settings.** The use cases `pointTypes.list`, `pointTypes.save` and
   `pointTypes.delete`, the policy action `pointTypes.manage`, the port
   `PointTypeRepo`, the rules `type-locked` and `type-in-use`, the known
   constraint `points_type_id_point_types_id_fk`, the audit target
   `point_type`, Arch's „Typy zpráv“ tab and tile and the classic
   `/nastaveni/typy-bodu` page go. The chooser („Co to bylo“), the report card
   and the opening read `POINT_TYPES`. There is no „Nabízet při psaní“: all six
   are always offered.
5. **Written reports keep what they hold.** A draft keeps the bullets it
   copied; the opening sentence a point stores stays until its author edits a
   field it is built from. The save, the submit and a reviewer's edit check a
   point against its coded type, also a point whose type the headmaster had
   edited or added: a point mapped to `jine` that lacks „Účastníci“, or a
   „Seminář“ whose optional rows were dropped, is refused until the row is
   back. The editor offers it („Vrátit řádek „Účastníci““), in the author's
   and the reviewer's editor alike.
6. **Documents and snapshots do not change.** A snapshot holds a report's
   opening text, body and bullets, never its type, so schema 2 and every
   generated document stay as they are. The worker never read `point_types`;
   no grants change. The audit log keeps old diffs with type uuids; it is
   append-only and is not rewritten.

## Consequences

- `test/integration/db/point-type-migration.test.ts` runs 0058 against the
  pre-migration shape; the list's own invariants (order, unique bullet keys,
  at most one organisers bullet listing people) are unit tests in
  `domain/report`.
- A new type, or a different bullet, is a commit and a deploy, not a setting.
