import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

import type { Indent } from '@/domain/richtext';

export function clampIndent(value: unknown, max: number): Indent {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, max, 3) as Indent;
}

/** Every paragraph of the selection one level deeper (1) or back (-1), within 0 to `max`. */
export function shiftIndent(editor: Editor, delta: 1 | -1, max: number): void {
  editor
    .chain()
    .command(({ state, tr }) => {
      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
        if (node.type.name !== 'paragraph') return true;
        const level = clampIndent((node.attrs['indent'] as number) + delta, max);
        if (level !== node.attrs['indent']) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
        }
        return false;
      });
      return true;
    })
    .run();
}

/**
 * The indent of a paragraph, 0 to `max` (the `paragraphs` profile pins it to 0): stored as the
 * `indent` attribute, written as `data-indent` and a class, never as a `style` attribute (the CSP
 * has `style-src-attr 'none'`, ADR 0031). Tab and Shift+Tab change it; Esc lets the next Tab leave
 * the field (WCAG 2.1.2).
 */
export const Indentation = Extension.create<{ max: number }>({
  name: 'indentation',
  addOptions: () => ({ max: 3 }),
  addGlobalAttributes() {
    const { max } = this.options;
    return [
      {
        types: ['paragraph'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => clampIndent(element.getAttribute('data-indent'), max),
            renderHTML: (attributes) => {
              const level = clampIndent(attributes['indent'], max);
              return { 'data-indent': level, class: `rt-l${level}` };
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    const { editor } = this;
    const shift = (delta: 1 | -1) => shiftIndent(editor, delta, this.options.max);
    // Esc releases Tab until the next key; the plugin owns the flag, so no state leaks across editors.
    let released = false;
    return [
      new Plugin({
        props: {
          handleKeyDown: (_view, event) => {
            if (event.key === 'Escape') {
              released = true;
              return false;
            }
            if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) {
              released = false;
              return false;
            }
            if (released) {
              released = false;
              return false;
            }
            if (this.options.max === 0) return false;
            shift(event.shiftKey ? -1 : 1);
            return true;
          },
          handleDOMEvents: {
            blur: () => {
              released = false;
              return false;
            },
          },
        },
      }),
    ];
  },
});
