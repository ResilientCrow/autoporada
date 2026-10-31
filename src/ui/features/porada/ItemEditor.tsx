'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OUTLINE_LIMITS } from '@/domain/outline';
import { LIMITS } from '@/domain/richtext';
import { porada } from '@/ui/copy';
import {
  Form,
  LiveStatus,
  RadioGroupField,
  RichTextField,
  SubmitButton,
  TextField,
  useActionForm,
  useDirtyGuard,
  type FormSpec,
} from '@/ui/form';
import { ArrowLink } from '@/ui/kit';

import {
  draftOf,
  isGenerated,
  newInput,
  persistenceOf,
  saveInput,
  type ItemActions,
  type ItemContext,
  type ItemView,
  type QuoteDraft,
} from './item-editor';
import { ItemPreview } from './ItemPreview';
import type { OutlineSectionKey } from './outline';
import { quoteField, QuotesEditor } from './QuotesEditor';

const { editor, fields, persistence: persistenceCopy } = porada.outline;

function specOf(quotes: number): FormSpec {
  const rows = Array.from({ length: quotes }, (_, i) => [
    [quoteField(i, 'speakerGenitive'), { label: editor.quotes.speaker(i + 1), required: true }],
    [quoteField(i, 'affiliation'), { label: editor.quotes.affiliation(i + 1) }],
    [quoteField(i, 'quote'), { label: editor.quotes.quote(i + 1), required: true }],
  ]);
  return {
    title: { label: editor.name, required: true },
    persistence: { label: editor.persistence, required: true },
    body: { label: editor.body },
    ...Object.fromEntries(rows.flat()),
    monday: { label: porada.outline.title, messages: { invalid: fields.stale } },
  };
}

/** A new item: an empty text in a section, and the id the form makes once. */
const BLANK = (section: OutlineSectionKey): ItemView => ({
  lineageId: '',
  section,
  slot: null,
  persistence: 'once',
  title: '',
  body: { type: 'doc', content: [] },
  quotes: [],
});

/**
 * The editor of one item of Pokyny a hospodaření, new (`item` null, in `section`) or existing: its
 * title, how long it stays, and its text (the partners slot: its quotes), with the item as the document
 * prints it beside the form. It saves on „Uložit“, never on its own, and asks before the page is left
 * with changes (ADR 0031, item 8). A new item goes back to the list; a saved one stays and says so.
 */
export function ItemEditor({
  context,
  section,
  item,
  actions,
}: {
  readonly context: ItemContext;
  readonly section: OutlineSectionKey;
  readonly item: ItemView | null;
  readonly actions: ItemActions;
}) {
  const router = useRouter();
  const start = item ?? BLANK(section);
  const [newId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(start.title);
  const [persistence, setPersistence] = useState<'standing' | 'once'>(start.persistence);
  const [doc, setDoc] = useState(start.body);
  const [quotes, setQuotes] = useState<readonly QuoteDraft[]>(() => start.quotes.map(draftOf));
  const [version, setVersion] = useState(context.version);
  const [dirty, setDirty] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  useDirtyGuard(dirty);

  const created = item === null;
  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };
  const onDone = (next: number) => {
    setDirty(false);
    if (created) {
      router.push(`/porada/${context.monday}/pokyny`);
      return;
    }
    setVersion(next);
    setSaid((s) => ({ message: editor.saved, count: s.count + 1 }));
  };
  const add = useActionForm({
    action: actions.add,
    toInput: newInput(context, section, newId),
    onSuccess: (done) => onDone(done.version),
  });
  const save = useActionForm({
    action: actions.save,
    toInput: saveInput(context, version, start, quotes),
    onSuccess: (done) => onDone(done.version),
  });

  const back = <ArrowLink href={`/porada/${context.monday}/pokyny`}>{editor.back}</ArrowLink>;
  if (isGenerated(start.slot)) {
    return (
      <div className="space-y-4">
        <p>{editor.generated}</p>
        {back}
      </div>
    );
  }
  const partners = start.slot === 'partners';
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <Form id="bod" spec={specOf(quotes.length)} state={created ? add : save}>
          <TextField
            name="title"
            maxLength={OUTLINE_LIMITS.title}
            value={title}
            onChange={edited(setTitle)}
          />
          {start.slot === null ? (
            <RadioGroupField
              name="persistence"
              value={persistence}
              onChange={edited((value: string) => setPersistence(persistenceOf(value)))}
              options={[
                { value: 'once', label: persistenceCopy.once },
                { value: 'standing', label: persistenceCopy.standing },
              ]}
            />
          ) : null}
          {partners ? (
            <QuotesEditor quotes={quotes} onChange={edited(setQuotes)} />
          ) : (
            <RichTextField
              name="body"
              profile="outline"
              defaultValue={start.body}
              maxBytes={LIMITS.maxBytes}
              onChange={edited(setDoc)}
            />
          )}
          <div>
            <SubmitButton>{created ? editor.add : editor.save}</SubmitButton>
          </div>
        </Form>
        <LiveStatus message={said.message} count={said.count} />
        {back}
      </div>
      <ItemPreview
        title={title}
        slot={start.slot}
        body={doc}
        quotes={quotes}
        schoolYear={context.schoolYear}
      />
    </div>
  );
}
