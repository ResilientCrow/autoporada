import { Notice } from '@/ui/kit';

/**
 * A status region that is always mounted, so a screen reader hears what is put
 * into it. `count` keys the notice: a repeated message is a new node and is
 * announced again.
 */
export function LiveStatus({
  message,
  count,
}: {
  readonly message: string;
  readonly count: number;
}) {
  return (
    <div role="status">
      {message === '' ? null : (
        <Notice key={count} tone="info" live={false}>
          {message}
        </Notice>
      )}
    </div>
  );
}
