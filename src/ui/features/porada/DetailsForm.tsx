'use client';

import { useState } from 'react';

import { ISSUE_TEXT_MAX } from '@/contracts';
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
import { Notice } from '@/ui/kit';

import { detailsInput, type DetailsAction } from './issue-texts';

const { details } = porada;
const SPEC: FormSpec = {
  present: { label: details.present },
  guests: { label: details.guests },
  monday: { label: details.title, messages: { invalid: details.stale } },
};

/**
 * „Údaje“: Přítomni and Hosté, each carried from the latest earlier porada until saved. Both are
 * sent whole; an empty one clears the text. It saves on „Uložit“ and asks before the page is left
 * with changes (ADR 0031, item 8).
 */
export function DetailsForm({
  action,
  monday,
  start,
}: {
  readonly action: DetailsAction;
  readonly monday: string;
  readonly start: {
    readonly version: number | null;
    readonly present: string;
    readonly guests: string;
    readonly carried: boolean;
  };
}) {
  const [version, setVersion] = useState(start.version);
  const [present, setPresent] = useState(start.present);
  const [guests, setGuests] = useState(start.guests);
  const [carried, setCarried] = useState(start.carried);
  const [dirty, setDirty] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  useDirtyGuard(dirty);

  const state = useActionForm({
    action,
    toInput: detailsInput(monday, version),
    onSuccess: (done) => {
      setVersion(done.version);
      setCarried(false);
      setDirty(false);
      setSaid((s) => ({ message: details.saved, count: s.count + 1 }));
    },
  });
  const edited = (set: (text: string) => void) => (text: string) => {
    set(text);
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      {carried && (
        <Notice tone="info" live={false}>
          {details.carried}
        </Notice>
      )}
      <Form id="udaje" spec={SPEC} state={state}>
        <TextField
          name="present"
          multiline
          maxLength={ISSUE_TEXT_MAX}
          value={present}
          onChange={edited(setPresent)}
        />
        <TextField
          name="guests"
          multiline
          maxLength={ISSUE_TEXT_MAX}
          value={guests}
          onChange={edited(setGuests)}
        />
        <div>
          <SubmitButton>{details.save}</SubmitButton>
        </div>
      </Form>
      <LiveStatus message={said.message} count={said.count} />
    </div>
  );
}
