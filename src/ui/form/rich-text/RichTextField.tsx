'use client';

import { useMemo, useRef, useState } from 'react';

import type { RichDoc, RichProfile } from '@/domain/richtext';
import { richtext } from '@/ui/copy';

import { DocMarkup } from './doc-markup';
import { LevelAnnouncer } from './LevelAnnouncer';
import { Toolbar } from './Toolbar';
import { NativeFieldError, useNativeField } from '../native-field';
import { useRichEditor } from './use-rich-editor';

/** The counter warns from this share of the limit. */
const NEAR = 90;

/**
 * A labelled rich-text field (ADR 0031): the stored text as static markup until the editor chunk is
 * loaded and mounted on its own, empty element; a hidden input named `name` holds the document as JSON
 * for the form, and `richDocOf` reads it. The label, the required marker and the issue come from the
 * form's spec. `maxBytes` is what the server accepts; the counter shows how much of it the text takes.
 */
export function RichTextField({
  name,
  profile,
  defaultValue,
  maxBytes,
  onChange,
}: {
  readonly name: string;
  readonly profile: RichProfile;
  readonly defaultValue: RichDoc;
  readonly maxBytes: number;
  /** Called with the document after every change. */
  readonly onChange?: (doc: RichDoc) => void;
}) {
  const field = useNativeField(name, {});
  const mountRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState(defaultValue);
  const json = useMemo(() => JSON.stringify(doc), [doc]);
  const percent = Math.round((new TextEncoder().encode(json).length / maxBytes) * 100);

  const labelId = `${field.id}-label`;
  const helpId = `${field.id}-help`;
  const counterId = `${field.id}-counter`;
  const describedBy = [helpId, counterId, ...(field.message === null ? [] : [field.errorId])].join(
    ' ',
  );
  const editor = useRichEditor({
    element: mountRef,
    profile,
    doc: defaultValue,
    placeholder: richtext.placeholder,
    attributes: { id: field.id, labelledBy: labelId, describedBy },
    onDoc: (next) => {
      setDoc(next);
      onChange?.(next);
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="font-bold">
        {field.label}
      </span>
      <span id={helpId} className="text-sm">
        {profile === 'outline' ? richtext.help : richtext.helpPlain}
      </span>
      {field.message === null ? null : (
        <NativeFieldError id={field.errorId} message={field.message} />
      )}
      <Toolbar
        caret={editor.caret}
        ready={editor.ready}
        withLevels={profile === 'outline'}
        onBold={editor.toggleBold}
        onItalic={editor.toggleItalic}
        onShift={editor.shiftIndent}
      />
      {profile === 'outline' ? <LevelAnnouncer level={editor.caret.level} /> : null}
      <div className="rt-box">
        <div ref={mountRef} hidden={!editor.ready} />
        {editor.ready ? null : (
          <div id={field.id} tabIndex={-1} className="rt-static">
            <DocMarkup doc={defaultValue} />
          </div>
        )}
      </div>
      <p id={counterId} className={percent >= NEAR ? 'font-bold' : undefined}>
        {percent >= NEAR ? richtext.counterNear(percent) : richtext.counter(percent)}
      </p>
      {editor.failed ? <p role="alert">{richtext.loadFailed}</p> : null}
      <input type="hidden" name={name} value={json} />
    </div>
  );
}
