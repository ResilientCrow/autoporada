import { StatusChip } from '@/ui/kit';
import type { Block, PrivacyCopy, Review, Rich } from '@/ui/copy';

type Labels = Pick<PrivacyCopy, 'reviewLabel' | 'reviewBy'>;

/** The text of a `Rich`, without its links: a stable React key. */
function plain(value: Rich): string {
  if (typeof value === 'string') return value;
  return value.map((part) => (typeof part === 'string' ? part : part.text)).join('');
}

/** Running text; links to other sites are plain anchors. */
function RichText({ value }: { readonly value: Rich }) {
  if (typeof value === 'string') return value;
  return value.map((part) =>
    typeof part === 'string' ? (
      part
    ) : (
      <a key={part.href} href={part.href}>
        {part.text}
      </a>
    ),
  );
}

/** What a reviewer has to confirm before the notice is approved. */
function ReviewNote({ review, labels }: { readonly review?: Review; readonly labels: Labels }) {
  if (review === undefined) return null;
  const task = `${labels.reviewBy[review.by]} ${review.note}`;
  return (
    <p className="flex flex-wrap items-center gap-2">
      <StatusChip tone="waiting">{labels.reviewLabel}</StatusChip>
      <span>{task}</span>
    </p>
  );
}

/** A bulleted list of running text. */
export function Bullets({ items }: { readonly items: readonly Rich[] }) {
  return (
    <ul className="list-disc pl-6">
      {items.map((item) => (
        <li key={plain(item)}>
          <RichText value={item} />
        </li>
      ))}
    </ul>
  );
}

function blockKey(block: Block): string {
  if (block.kind === 'p') return plain(block.text);
  if (block.kind === 'list') return block.items.map(plain).join();
  return block.rows.map((row) => row.term).join();
}

function Body({ block, labels }: { readonly block: Block; readonly labels: Labels }) {
  if (block.kind === 'p') {
    return (
      <p>
        <RichText value={block.text} />
      </p>
    );
  }
  if (block.kind === 'list') {
    return <Bullets items={block.items} />;
  }
  return (
    <dl className="flex flex-col gap-2">
      {block.rows.map((row) => (
        <div key={row.term}>
          <dt className="font-bold">{row.term}</dt>
          <dd>
            <RichText value={row.value} />
            <ReviewNote review={row.review} labels={labels} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One section's blocks; facts are a description list so they reflow at 320 px. */
export function Blocks({
  blocks,
  labels,
}: {
  readonly blocks: readonly Block[];
  readonly labels: Labels;
}) {
  return blocks.map((block) => (
    <div key={blockKey(block)} className="flex flex-col gap-2">
      <Body block={block} labels={labels} />
      <ReviewNote review={block.review} labels={labels} />
    </div>
  ));
}
