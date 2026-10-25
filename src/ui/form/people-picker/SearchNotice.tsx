import { people } from '@/ui/copy';

import type { Notice } from './directory-state';

const { notice: text } = people.search;

const TEXT: Readonly<Record<Notice, string>> = {
  off: text.off,
  down: text.down,
  'rate-limited': text.rateLimited,
  'signed-out': text.signedOut,
};

/**
 * What the directory search says beside the box. The status region is always
 * on the page, so a screen reader hears a notice put into it. It is text beside
 * the box, never a listbox's empty state: the box still takes a typed name.
 * While the list is open React Aria hides the rest of the page from assistive
 * technology, and a notice usually arrives while the reader types with the list
 * open: `data-live-announcer` is the mark that keeps this region out of the
 * hiding. The box also points at the text with aria-describedby.
 */
export function SearchNotice({
  id,
  notice,
}: {
  readonly id?: string;
  readonly notice: Notice | null;
}) {
  return (
    <p id={id} role="status" data-live-announcer="true">
      {notice === null ? null : TEXT[notice]}
    </p>
  );
}
