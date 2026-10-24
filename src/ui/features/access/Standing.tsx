import { access } from '@/ui/copy';
import { ArrowLink, Notice } from '@/ui/kit';
import { ACCESS_LOOK, Chip } from '@/ui/status';

/** The page's model: the standing, with its dates written out. */
export type AccessView =
  | { readonly kind: 'member' }
  | { readonly kind: 'open'; readonly previous: 'rejected' | 'cancelled' | null }
  | {
      readonly kind: 'pending';
      readonly requestId: string;
      readonly version: number;
      readonly sent: string;
      readonly reason: string;
    }
  | { readonly kind: 'cooldown'; readonly decided: string; readonly from: string }
  | { readonly kind: 'blocked' };

/** The heading of the state: it stays one element and only its text changes. */
export function headingOf(view: AccessView): string {
  switch (view.kind) {
    case 'member':
      return access.member.title;
    case 'open':
      return access.open.title;
    case 'pending':
      return access.pending.title;
    case 'cooldown':
      return access.cooldown.title;
    case 'blocked':
      return access.blocked.title;
  }
}

/** Whether the state asks for or changes something by a form. */
export function hasForm(view: AccessView): boolean {
  return view.kind === 'open' || view.kind === 'pending';
}

/** What the standing says, under the heading. */
export function Standing({ view }: { readonly view: AccessView }) {
  switch (view.kind) {
    case 'member':
      return <ArrowLink href="/">{access.member.overview}</ArrowLink>;
    case 'open':
      return (
        <>
          {view.previous !== null && (
            // Part of the page as it loads: the host's status region announces changes.
            <Notice tone="info" live={false}>
              {view.previous === 'cancelled'
                ? access.open.previousCancelled
                : access.open.previousRejected}
            </Notice>
          )}
          <p>{access.open.text}</p>
        </>
      );
    case 'pending':
      return (
        <>
          <p>
            <Chip look={ACCESS_LOOK.pending} />
          </p>
          <p>
            {access.pending.sent(view.sent)} {access.pending.afterApproval}
          </p>
          <h3 className="text-lg">{access.pending.reason}</h3>
          <p className="break-words whitespace-pre-line">{view.reason}</p>
        </>
      );
    case 'cooldown':
      return (
        <>
          <p>
            <Chip look={ACCESS_LOOK.rejected} />
          </p>
          <p>{access.cooldown.text(view.decided, view.from)}</p>
        </>
      );
    case 'blocked':
      return (
        <>
          <p>
            <Chip look={ACCESS_LOOK.blocked} />
          </p>
          <p>{access.blocked.text}</p>
        </>
      );
  }
}
