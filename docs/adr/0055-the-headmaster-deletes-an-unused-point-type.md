# 0055 — The headmaster deletes a point type no point uses

Adds to ADR 0053 (the Arch UI on the same backend). Leaves „Nabízet při
psaní“ (`active`) as it was.

## Context

The headmaster could make report types and switch them off, but not remove
one made by mistake. A type is referenced by `points.type_id`, and a published
point's opening sentence and bullets follow its type, so a type that any point
uses cannot simply go.

## Decision

1. **`pointTypes.delete`** (`pointTypes.manage`, headmaster only, `admin` rate
   limit) deletes a type at the version the admin saw (`conflict` otherwise,
   `not-found` for an unknown id).
2. **„Jiné“ (locked) never goes** (rule `type-locked`), so there is always a
   type to choose.
3. **A type that any point uses stays**, whatever the point's state. The
   foreign key `points_type_id_point_types_id_fk` refuses the delete; it is a
   known constraint and reads as rule `type-in-use`. The headmaster switches
   such a type off instead. There is no archive and no cascade.
4. **The audit event `point_type.deleted`** keeps the settings the type had
   (title gender, active, position), never its name or bullets (ADR 0015).
5. **Arch shows „Smazat typ“** on an unlocked type's page, behind a
   confirmation. The classic `/nastaveni/typy-bodu` page does not offer it.

## Consequences

- `PointTypeRepo.remove` joins the port, with its contract in both worlds.
- A type written by mistake and never used can go; a used one stays in the
  list, switched off, as before.
