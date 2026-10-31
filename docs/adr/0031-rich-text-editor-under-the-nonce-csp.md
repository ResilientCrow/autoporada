# 0031 — Rich-text editor under the nonce CSP

Refines: ADR 0007 (restricted rich text). The stored form, the validator, the
marks, the limits and the rendering rule of 0007 do not change; this record
fixes how the editor is built and mounted. ADR 0017 is left untouched: no
M9 editor joins its autosave set.

## Context

ADR 0007 chose TipTap 3 and a flat list of paragraphs with an `indent` of
0–3. M9 is the first place that needs the editor: item bodies, Příloha 2 and
the annex texts. The CSP is `style-src 'self' 'nonce-…'`,
`style-src-attr 'none'`, `script-src 'self' 'nonce-…' 'strict-dynamic'`.
CSSOM writes (`el.style.x = …`) pass; a `style=` attribute in markup or set
through `setAttribute` does not, and TipTap injects a `<style>` element
without a nonce unless told not to. There is no jsdom, so interaction is
proved in Playwright. Whether TipTap runs under this CSP is not known until it
has been tried (spike SP-T, item 10).

## Decision

1. **Packages: TipTap 3 core only, exact versions.** `@tiptap/core`,
   `@tiptap/pm`, `@tiptap/extension-document`, `-paragraph`, `-text`,
   `-bold`, `-italic` and `@tiptap/extensions` (UndoRedo, Placeholder). No
   `@tiptap/react`, no other extension. These are the only new dependencies
   of M9.
2. **Our own mount hook, `useRichEditor`.** It creates a vanilla `Editor` in
   an effect, with `injectCSS: false`, `enableInputRules: false` and
   `enablePasteRules: false`. The editor chunk is loaded with `import()` after
   hydration, so it is not in the first load of any page.
3. **The editor never mounts on React-owned children.** `RichTextField`
   renders the stored document as static markup (`doc-markup.tsx`:
   `<p class="rt-p" data-indent="n">`) for the server render and the first
   paint, and renders `mounted ? null : <DocMarkup/>`. ProseMirror mounts on a
   separate, ref'd, empty `<div>` that React never fills, or the static markup
   sits in a memoised sibling and visibility is swapped. This prevents
   duplicate text and a `NotFoundError` when React re-renders (counter,
   toolbar, hidden input).
4. **Indent is a global attribute on paragraph, 0–3.** `parseHTML` reads
   `data-indent`; `renderHTML` writes `{ 'data-indent': n, class: 'rt-l' + n }`.
   The profile `paragraphs` pins it to 0. The CSS (`.ProseMirror` base rules,
   `.rt-l1` to `.rt-l3` padding) lives in `ui/theme/theme.css`; no `<style>` is
   injected and no `style` attribute is written. The editor `<div>` has
   `role="textbox"`, `aria-multiline="true"`, `aria-labelledby` and
   `aria-describedby` (help and counter).
5. **Keys and announcements.** Tab raises the level (max 3), Shift+Tab lowers
   it, Esc releases Tab so that the next Tab leaves the field (WCAG 2.1.2;
   the help text says so), Ctrl or Cmd+B and +I set the marks. A toolbar with
   „Tučně“, „Kurzíva“, „Odsadit“ and „Vrátit odsazení“ serves touch users. A
   polite live region announces „Úroveň {n}“ or „Odstavec“ when the caret's
   level changes.
6. **Paste is filtered before parsing.** `transformPastedHTML` drops
   `<style>`, `<img>`, comments and `mso` conditionals; Word's
   `mso-list:… levelN` becomes indent `min(N, 3)`; everything else becomes
   paragraphs with bold and italic. The result is parsed by ProseMirror's
   clipboard parser in an inert document; `img-src 'self'` stays.
7. **The server stays the authority.** `editor.getJSON()` goes to a hidden
   `<input name>` on every transaction; the server validates it with
   `parseRichDoc(profile)` and `exceedsLimits` (ADR 0007: 64 KB, 2000 nodes).
   The counter warns from 90 %. Rendering stays through components; nothing
   renders HTML from the client.
8. **Explicit save with a dirty guard.** Every M9 editor saves with
   „Uložit“. `use-dirty-guard.ts` registers `beforeunload` and a capture-phase
   click listener on same-origin links that asks
   `confirm(copy.richtext.unsaved)`
   while the form is dirty, and clears on a successful save. ADR 0017's set of
   `refresh: 'none'` actions (`points.create`, `points.save`, `future.create`,
   `future.save`) does not change, and the autosave machine is not used.
9. **A fence confines the library.** The dependency-cruiser rule
   `tiptap-only-in-rich-text` makes any import from `^src/` outside
   `src/ui/form/rich-text/` to `node_modules/(@tiptap|prosemirror-[a-z-]+)/`
   an error. ADR 0004 gets no edit. The ESLint React Aria allow list does not
   change.
10. **Spike SP-T runs first, in the branch checkout, uncommitted, as the
    first half of the commit that adds the editor.** It never switches
    branches. If it passes its code becomes that commit; if it fails the files
    are removed and the fallback is designed. It must show, on a `/vzornik`
    page and in both Playwright projects:
    - no `securitypolicyviolation` event while typing, Tab, Shift+Tab,
      Esc+Tab, Ctrl+B and +I, undo, redo, copy of text, drag and drop of text,
      and pasting a Word fixture (mso styles, `<style>`, `<img>`);
    - no `[style]` attribute in the editor subtree and no `<style>` without
      the nonce;
    - SSR markup, then the editor on its own element, with no hydration
      warning, no duplicate text and no `NotFoundError` after a re-render;
    - `getJSON()` passes `parseRichDoc('outline')` for 50 generated documents
      and comes back equal;
    - the route's JS delta from `next build` under 130 KB gzip, in a lazy
      chunk (estimate 90–120 KB);
    - axe passes, and typing works in the mobile project.
    If TipTap itself fails the CSP checks, the fallback is raw ProseMirror,
    which would supersede the TipTap line of ADR 0007; if ProseMirror fails
    too, a textarea with level buttons that store the indent per line.

## Consequences

- Three routes load the lazy chunk: the item editor, Příloha 2 and the
  settings text. Every other page ships no editor code.
- The first paint shows the stored text before the editor exists; typing
  before the chunk arrives is not possible.
- A page with unsaved changes asks before leaving; the browser's own dialog
  is used, so its text is the browser's.
- The e2e suite asserts that no `[style]` element exists on editor pages and
  that the CSP listener sees no violation.

## Options rejected

- **`@tiptap/react` (`useEditor`, `EditorContent`).** Acceptable if SP-T
  shows no `style=`, but it adds a dependency and a coupling to the React
  version.
- **Raw ProseMirror now.** Saves about 30 KB gzip but gives up ADR 0007's
  stack before it has failed; it is the fallback.
- **Autosave for the M9 editors.** It needs a record superseding ADR 0017
  and gains nothing for one writer.
