import { failures, people } from '@/ui/copy';

import { causeOfNotice, isFailureNotice, type FailureNotice, type Notice } from './directory-state';

const { notice: text } = people.search;

const TEXT: Readonly<Record<Exclude<Notice, FailureNotice>, string>> = {
  off: text.off,
  down: text.down,
  unavailable: text.unavailable,
  timeout: text.timeout,
  denied: text.denied,
  'rate-limited': text.rateLimited,
  'signed-out': text.signedOut,
};

function textOf(notice: Notice): string {
  return isFailureNotice(notice) ? text.failed(failures[causeOfNotice(notice)]) : TEXT[notice];
}

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
      {notice === null ? null : textOf(notice)}
    </p>
  );
}
