# 0005 — Snapshot → DocumentModel → DOCX / HTML

## Context

The generated DOCX must look exactly like the hand-made template. The same
content also appears as a live preview in the browser. If the preview and the
DOCX were produced by separate code, they would drift apart.

## Decision

1. `assembleIssueSnapshot` reads everything an issue needs and returns a
   versioned, Zod-validated `IssueSnapshot`.
2. `composeDocument(snapshot)` is pure. It returns a `DocumentModel`, a closed
   set of block types with typographised runs. It owns every rule:
   - point numbering;
   - routing future items into points;
   - eligibility and ordering;
   - empty-section omission;
   - bold for new students.
3. Two renderers consume the model, and both switch exhaustively on the block
   kind:
   - `renderDocx` (server only, the `docx` library) produces the bytes and
     their SHA-256;
   - `renderHtml` (React) is used for the full preview and the in-form
     preview.
4. A worker converts the DOCX to PDF with Gotenberg (LibreOffice) on an
   internal network.
5. Every generated version stores its snapshot, `model_hash`,
   `renderer_version`, `template_sha256` and the output hashes.

## Consequences

- Format fidelity is tested in three ways:
  - golden XML snapshots;
  - a parity test against the pinned template;
  - a render check (PDF text, page count, glyphs).
- The engine is built and checked before any UI exists (milestone M2).
