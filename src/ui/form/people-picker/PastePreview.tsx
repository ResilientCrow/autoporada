'use client';

import type { KeyboardEvent } from 'react';

import { people } from '@/ui/copy';
import { buttonStyles } from '@/ui/kit';

import { CONTROL } from '../control-styles';

import { optionLabel } from './directory-state';
import {
  chosenCount,
  pickRow,
  personOf,
  salutateRows,
  setSalutation,
  swapRow,
  type Preview,
} from './paste-state';
import { SalutationButtons } from './SalutationButtons';
import { NO_SALUTATION, SALUTATION_OPTIONS, salutationOf } from './salutations';

const { paste } = people;

const CELL = 'border-b-2 border-ink px-2 py-1 align-middle';

/** Enter on a checkbox or a select would send an enclosing form; here it does nothing. */
function holdEnter(event: KeyboardEvent) {
  if (event.key === 'Enter') event.preventDefault();
}

/**
 * The preview of a pasted list (design section 5): a table, one row per person
 * read, then the bulk salutation, the lines that could not be read, and the
 * add. It keeps no state and no live region: the owner holds the preview and
 * says what happened. No control has a name, so a form around the field never
 * sends any of it.
 */
export function PastePreview({
  preview,
  onPreview,
  onAdd,
}: {
  readonly preview: Preview;
  readonly onPreview: (next: Preview) => void;
  readonly onAdd: () => void;
}) {
  const count = chosenCount(preview);
  return (
    <div className="flex flex-col gap-3">
      {preview.truncated ? <p>{paste.truncated}</p> : null}
      {preview.rows.length === 0 && preview.rejected.length === 0 ? <p>{paste.nothing}</p> : null}
      {preview.rows.length === 0 ? null : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="pb-1 text-left font-bold">{paste.caption}</caption>
              <thead>
                <tr>
                  {Object.values(paste.columns).map((header) => (
                    <th key={header} scope="col" className={`${CELL} font-bold`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((entry) => (
                  <tr key={entry.key}>
                    <td className={CELL}>
                      <label className="flex min-h-11 min-w-11 items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label={paste.pickLabel(entry.row.source)}
                          checked={entry.checked}
                          onKeyDown={holdEnter}
                          onChange={(event) =>
                            onPreview(pickRow(preview, entry.key, event.target.checked))
                          }
                          className="size-6"
                        />
                      </label>
                    </td>
                    <td className={CELL}>{optionLabel(personOf(entry))}</td>
                    <td className={CELL}>
                      <select
                        aria-label={paste.salutationLabel(entry.row.source)}
                        value={entry.salutation ?? NO_SALUTATION}
                        onKeyDown={holdEnter}
                        onChange={(event) =>
                          onPreview(
                            setSalutation(preview, entry.key, salutationOf(event.target.value)),
                          )
                        }
                        className={CONTROL}
                      >
                        {SALUTATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={CELL}>
                      {entry.row.uncertainOrder ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-bold">{paste.doubt}</span>
                          <button
                            type="button"
                            aria-label={paste.swapLabel(entry.row.source)}
                            onClick={() => onPreview(swapRow(preview, entry.key))}
                            className={buttonStyles('secondary')}
                          >
                            {paste.swap}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SalutationButtons
            label={paste.bulk.label}
            setLabel={paste.bulk.setLabel}
            onPick={(salutation) => onPreview(salutateRows(preview, salutation))}
          />
        </>
      )}
      {preview.rejected.length === 0 ? null : (
        <div>
          <p className="font-bold">{paste.rejected.title}</p>
          <ul className="flex flex-col gap-1">
            {preview.rejected.map((line) => (
              <li key={line.line}>
                <span className="font-bold">{paste.rejected.line(line.line)}</span>{' '}
                {paste.rejected.reason[line.code]} <q>{line.source}</q>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.rows.length === 0 ? null : (
        <div>
          <button
            type="button"
            disabled={count === 0}
            onClick={onAdd}
            className={buttonStyles('primary')}
          >
            {paste.add(count)}
          </button>
        </div>
      )}
    </div>
  );
}
