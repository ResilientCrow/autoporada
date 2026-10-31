import { Editor, type JSONContent } from '@tiptap/core';
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { Italic } from '@tiptap/extension-italic';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';

import {
  stripForbiddenCharacters,
  type Mark,
  type RichDoc,
  type RichParagraph,
  type RichText,
} from '@/domain/richtext';

import { clampIndent, Indentation, shiftIndent } from './indent';
import { cleanPastedHtml } from './paste';
import type { CaretState, CreateEditorOptions, EditorAttributes, RichEditorControl } from './types';

/**
 * The editor chunk (ADR 0031): everything that imports TipTap lives here and is loaded with `import()`
 * after hydration. Only the extensions of D7; `injectCSS: false` and no input or paste rules.
 */

const MARKS: readonly Mark[] = ['bold', 'italic'];

/** A stored document as the editor takes it: an empty one still needs its first paragraph. */
function contentOf(doc: RichDoc): JSONContent {
  if (doc.content.length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return {
    type: 'doc',
    content: doc.content.map((p) => ({
      type: 'paragraph',
      attrs: { indent: p.attrs.indent },
      ...(p.content && {
        content: p.content.map((t) => ({
          type: 'text',
          text: t.text,
          ...(t.marks && { marks: t.marks.map((m) => ({ type: m.type })) }),
        })),
      }),
    })),
  };
}

/** What the server keeps of pasted text: no invisible or look-alike characters, no newline inside a paragraph. */
function textOf(node: JSONContent): RichText | null {
  if (node.type !== 'text' || !node.text) return null;
  const text = stripForbiddenCharacters(node.text).replace(/\n/g, ' ');
  if (text === '') return null;
  const types = new Set((node.marks ?? []).map((m) => m.type));
  const marks = MARKS.filter((m) => types.has(m)).map((type) => ({ type }));
  return { type: 'text', text, ...(marks.length > 0 && { marks }) };
}

/** The editor's JSON in the stored shape (`parseRichDoc` takes it as it is). */
export function docOf(json: JSONContent, max: number): RichDoc {
  const content = (json.content ?? []).map((p): RichParagraph => {
    const runs = (p.content ?? []).flatMap((node) => textOf(node) ?? []);
    return {
      type: 'paragraph',
      attrs: { indent: clampIndent(p.attrs?.['indent'], max) },
      ...(runs.length > 0 && { content: runs }),
    };
  });
  return { type: 'doc', content };
}

function propsOf(attributes: EditorAttributes, max: number) {
  return {
    attributes: {
      id: attributes.id,
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-labelledby': attributes.labelledBy,
      ...(attributes.describedBy !== undefined && { 'aria-describedby': attributes.describedBy }),
    },
    transformPastedHTML: (html: string) => cleanPastedHtml(html, max),
  };
}

export function createRichEditor(options: CreateEditorOptions): RichEditorControl {
  const max = options.profile === 'paragraphs' ? 0 : 3;
  const editor = new Editor({
    element: options.element,
    extensions: [
      Document,
      Paragraph.configure({ HTMLAttributes: { class: 'rt-p' } }),
      Text,
      Bold,
      Italic,
      UndoRedo,
      Placeholder.configure({ placeholder: options.placeholder }),
      Indentation.configure({ max }),
    ],
    content: contentOf(options.doc),
    injectCSS: false,
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: propsOf(options.attributes, max),
    onUpdate: ({ editor: e }) => options.onDoc(docOf(e.getJSON(), max)),
  });

  let caret: CaretState | null = null;
  const follow = () => {
    const parent = editor.state.selection.$from.parent;
    const next: CaretState = {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      level: clampIndent(parent.attrs['indent'], max),
    };
    if (
      caret === null ||
      caret.bold !== next.bold ||
      caret.italic !== next.italic ||
      caret.level !== next.level
    ) {
      caret = next;
      options.onCaret(next);
    }
  };
  editor.on('transaction', follow);
  follow();

  return {
    toggleBold: () => void editor.chain().focus().toggleMark('bold').run(),
    toggleItalic: () => void editor.chain().focus().toggleMark('italic').run(),
    shiftIndent: (delta) => {
      if (max > 0) {
        editor.commands.focus();
        shiftIndent(editor, delta, max);
      }
    },
    setAttributes: (attributes) => editor.setOptions({ editorProps: propsOf(attributes, max) }),
    destroy: () => editor.destroy(),
  };
}
