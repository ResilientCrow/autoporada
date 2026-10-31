'use client';

import { useState } from 'react';

import { ANNEX1_MAX_BYTES, isRichDocEmpty, type RichDoc } from '@/domain/richtext';
import { porada } from '@/ui/copy';
import {
  Form,
  LiveStatus,
  RichTextField,
  SubmitButton,
  useActionForm,
  useDirtyGuard,
  type FormSpec,
} from '@/ui/form';
import { Notice } from '@/ui/kit';

import { annex2Input, removeAnnex2Input, type Annex2Action } from './issue-texts';

const { annex2 } = porada;
const SPEC: FormSpec = {
  body: { label: annex2.body },
  monday: { label: annex2.title, messages: { invalid: annex2.stale } },
};

const EMPTY: RichDoc = { type: 'doc', content: [] };

/**
 * „Příloha 2“: the annex text, carried from the latest earlier porada until saved. „Uložit“ stores
 * the editor's document; „Odebrat přílohu“ stores an empty one, which the document prints as no
 * annex. It saves on the buttons and asks before the page is left with changes (ADR 0031, item 8).
 */
export function Annex2Form({
  action,
  monday,
  start,
}: {
  readonly action: Annex2Action;
  readonly monday: string;
  readonly start: {
    readonly version: number | null;
    readonly annex2: RichDoc;
    readonly carried: boolean;
  };
}) {
  const [version, setVersion] = useState(start.version);
  const [doc, setDoc] = useState(start.annex2);
  // The editor takes its text at mount: a new key after „Odebrat přílohu“ empties it.
  const [mounted, setMounted] = useState(0);
  const [carried, setCarried] = useState(start.carried);
  const [dirty, setDirty] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  useDirtyGuard(dirty);

  const saved = (next: number, message: string) => {
    setVersion(next);
    setCarried(false);
    setDirty(false);
    setSaid((s) => ({ message, count: s.count + 1 }));
  };
  const save = useActionForm({
    action,
    toInput: annex2Input(monday, version),
    onSuccess: (done) => saved(done.version, annex2.saved),
  });
  const remove = useActionForm({
    action,
    toInput: removeAnnex2Input(monday, version),
    onSuccess: (done) => {
      setDoc(EMPTY);
      setMounted((n) => n + 1);
      saved(done.version, annex2.removed);
    },
  });

  return (
    <div className="space-y-4">
      {carried && (
        <Notice tone="info" live={false}>
          {annex2.carried}
        </Notice>
      )}
      {!carried && isRichDocEmpty(doc) && <p>{annex2.none}</p>}
      <Form id="priloha-2" spec={SPEC} state={save}>
        <RichTextField
          key={mounted}
          name="body"
          profile="outline"
          defaultValue={doc}
          maxBytes={ANNEX1_MAX_BYTES}
          onChange={(next) => {
            setDoc(next);
            setDirty(true);
          }}
        />
        <div>
          <SubmitButton>{annex2.save}</SubmitButton>
        </div>
      </Form>
      <Form id="priloha-2-odebrat" spec={{}} state={remove}>
        <SubmitButton variant="secondary">{annex2.remove}</SubmitButton>
      </Form>
      <LiveStatus message={said.message} count={said.count} />
    </div>
  );
}
