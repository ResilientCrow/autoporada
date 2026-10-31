'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import type { RichDoc, RichProfile } from '@/domain/richtext';

import type { CaretState, EditorAttributes, RichEditorControl } from './types';

const PLAIN: CaretState = { bold: false, italic: false, level: 0 };

export interface RichEditor {
  /** The editor is mounted; until then the static markup shows the text. */
  readonly ready: boolean;
  /** The chunk did not load; the text stays as it was stored. */
  readonly failed: boolean;
  readonly caret: CaretState;
  readonly toggleBold: () => void;
  readonly toggleItalic: () => void;
  readonly shiftIndent: (delta: 1 | -1) => void;
}

/**
 * Mounts a TipTap editor on `element` after hydration (ADR 0031, items 2 and 3): the editor chunk is
 * loaded with `import()`, so no page ships it in its first load, and the element is one React never
 * fills. `doc` is the starting text only; `onDoc` hears every change. The editor is made once per
 * element and profile; `attributes` is applied again when it changes.
 */
export function useRichEditor({
  element,
  profile,
  doc,
  placeholder,
  attributes,
  onDoc,
}: {
  readonly element: RefObject<HTMLElement | null>;
  readonly profile: RichProfile;
  readonly doc: RichDoc;
  readonly placeholder: string;
  readonly attributes: EditorAttributes;
  readonly onDoc: (doc: RichDoc) => void;
}): RichEditor {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [caret, setCaret] = useState<CaretState>(PLAIN);
  const control = useRef<RichEditorControl | null>(null);
  const start = useRef({ doc, placeholder, attributes, onDoc });
  const latest = useRef(onDoc);
  useEffect(() => {
    latest.current = onDoc;
  });

  useEffect(() => {
    const mount = element.current;
    if (mount === null) return;
    let cancelled = false;
    let made: RichEditorControl | null = null;
    import('./editor').then(
      ({ createRichEditor }) => {
        if (cancelled) return;
        made = createRichEditor({
          element: mount,
          profile,
          doc: start.current.doc,
          placeholder: start.current.placeholder,
          attributes: start.current.attributes,
          onDoc: (next) => latest.current(next),
          onCaret: setCaret,
        });
        control.current = made;
        setReady(true);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      made?.destroy();
      control.current = null;
    };
  }, [element, profile]);

  const { id, labelledBy, describedBy } = attributes;
  useEffect(() => {
    control.current?.setAttributes({ id, labelledBy, describedBy });
  }, [id, labelledBy, describedBy, ready]);

  return {
    ready,
    failed,
    caret,
    toggleBold: () => control.current?.toggleBold(),
    toggleItalic: () => control.current?.toggleItalic(),
    shiftIndent: (delta) => control.current?.shiftIndent(delta),
  };
}
