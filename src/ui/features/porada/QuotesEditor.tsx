'use client';

import { OUTLINE_LIMITS } from '@/domain/outline';
import { POINT_LIMITS } from '@/domain/report';
import { porada } from '@/ui/copy';
import { TextField } from '@/ui/form';
import { Button } from '@/ui/kit';

import { EMPTY_QUOTE, type QuoteDraft } from './item-editor';

const { quotes: copy } = porada.outline.editor;

/** The names of one quote's fields in the form (they are the paths of its field issues). */
export const quoteField = (i: number, field: keyof QuoteDraft) => `quotes.${i}.${field}`;

/**
 * The statements of Ohlasy sociálních partnerů (the partners slot): a speaker in the 2nd case, an
 * optional class or role and the quote, up to the slot's limit. The fields are controlled, so the
 * preview follows them; the form's spec has a row of entries per quote (`quoteField`).
 */
export function QuotesEditor({
  quotes,
  onChange,
}: {
  readonly quotes: readonly QuoteDraft[];
  readonly onChange: (quotes: readonly QuoteDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<QuoteDraft>) =>
    onChange(quotes.map((q, at) => (at === i ? { ...q, ...patch } : q)));
  return (
    <div className="flex flex-col gap-4">
      {quotes.length === 0 ? <p>{copy.none}</p> : null}
      {quotes.map((quote, i) => (
        <fieldset key={i} className="flex flex-col gap-4 rounded-brand border-2 border-ink p-4">
          <legend className="px-1 font-bold">{copy.group(i + 1)}</legend>
          <TextField
            name={quoteField(i, 'speakerGenitive')}
            description={copy.speakerHint}
            maxLength={POINT_LIMITS.speakerGenitive}
            value={quote.speakerGenitive}
            onChange={(speakerGenitive) => set(i, { speakerGenitive })}
          />
          <TextField
            name={quoteField(i, 'affiliation')}
            maxLength={POINT_LIMITS.statementAffiliation}
            value={quote.affiliation}
            onChange={(affiliation) => set(i, { affiliation })}
          />
          <TextField
            name={quoteField(i, 'quote')}
            multiline
            maxLength={POINT_LIMITS.quote}
            value={quote.quote}
            onChange={(text) => set(i, { quote: text })}
          />
          <div>
            <Button
              variant="secondary"
              onPress={() => onChange(quotes.filter((_, at) => at !== i))}
            >
              {copy.remove(i + 1)}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          variant="secondary"
          isDisabled={quotes.length >= OUTLINE_LIMITS.quotes}
          onPress={() => onChange([...quotes, EMPTY_QUOTE])}
        >
          {copy.add}
        </Button>
      </div>
    </div>
  );
}
