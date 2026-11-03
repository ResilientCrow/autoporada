'use client';

import { useState } from 'react';

import { POINT_LIMITS } from '@/domain/report';
import { porada } from '@/ui/copy';
import {
  Form,
  LiveStatus,
  SubmitButton,
  TextField,
  useActionForm,
  useDirtyGuard,
  type FormSpec,
} from '@/ui/form';
import { BulletList, Meta, Stack } from '@/ui/kit';

import { resetPlaceholderInput, savePlaceholderInput, type PlaceholderAction } from './placeholder';

const { missing } = porada;
const SPEC: FormSpec = {
  paragraph: { label: missing.paragraph, required: true },
  monday: { label: missing.title, messages: { invalid: missing.stale } },
  itemId: { label: missing.title, messages: { invalid: missing.stale } },
};

/** One akce as the page read it: the paragraph that prints, the system's own and the row's version. */
export interface MissingReportStart {
  readonly id: string;
  readonly paragraph: string;
  readonly original: string;
  readonly own: boolean;
  readonly version: number;
}

/**
 * The paragraph a missing report prints, to rewrite or to take back to the system's (ADR 0049). It
 * saves on „Uložit“ and „Obnovit původní text“, which is there only while the text is the
 * headmaster's own, and asks before the page is left with changes. The two fixed lines the document
 * adds are shown under the field, read-only.
 */
export function MissingReportForm({
  action,
  monday,
  start,
  lines,
}: {
  readonly action: PlaceholderAction;
  readonly monday: string;
  readonly start: MissingReportStart;
  /** The fixed lines the document adds, read by the server from the document's own words. */
  readonly lines: readonly string[];
}) {
  const [version, setVersion] = useState(start.version);
  const [own, setOwn] = useState(start.own);
  const [text, setText] = useState(start.paragraph);
  const [dirty, setDirty] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  useDirtyGuard(dirty);

  const done = (message: string) => {
    setDirty(false);
    setSaid((s) => ({ message, count: s.count + 1 }));
  };
  const save = useActionForm({
    action,
    toInput: savePlaceholderInput(monday, start.id, version),
    onSuccess: (written) => {
      setVersion(written.version);
      setOwn(true);
      done(missing.saved);
    },
  });
  const reset = useActionForm({
    action,
    toInput: resetPlaceholderInput(monday, start.id, version),
    onSuccess: () => {
      setVersion(0);
      setOwn(false);
      setText(start.original);
      done(missing.resetDone);
    },
  });

  return (
    <Stack>
      <Form id={`zprava-${start.id}`} spec={SPEC} state={save}>
        <TextField
          name="paragraph"
          multiline
          maxLength={POINT_LIMITS.opening}
          value={text}
          onChange={(next) => {
            setText(next);
            setDirty(true);
          }}
        />
        <Meta>{own ? missing.own : missing.original}</Meta>
        <Stack gap="item">
          <Meta>{missing.fixed}</Meta>
          <BulletList>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </BulletList>
        </Stack>
        <div>
          <SubmitButton>{missing.save}</SubmitButton>
        </div>
      </Form>
      {own && (
        <Form id={`zprava-${start.id}-obnovit`} spec={SPEC} state={reset}>
          <div>
            <SubmitButton variant="secondary">{missing.reset}</SubmitButton>
          </div>
        </Form>
      )}
      <LiveStatus message={said.message} count={said.count} />
    </Stack>
  );
}
