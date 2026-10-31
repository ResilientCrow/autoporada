import type { RichDoc } from '@/domain/richtext';

/**
 * The stored document as static markup, in the shape the editor renders (`<p class="rt-p rt-lN"
 * data-indent="N">`): the server render and the first paint, until the editor is ready (ADR 0031,
 * item 3). It holds no state and the editor never mounts on it.
 */
export function DocMarkup({ doc }: { readonly doc: RichDoc }) {
  return (
    <>
      {doc.content.map((paragraph, i) => {
        const level = paragraph.attrs.indent;
        const runs = paragraph.content ?? [];
        return (
          <p key={i} className={`rt-p rt-l${level}`} data-indent={level}>
            {runs.length === 0 ? (
              <br />
            ) : (
              runs.map((run, j) => {
                const marks = new Set(run.marks?.map((m) => m.type));
                let node = <>{run.text}</>;
                if (marks.has('italic')) node = <em>{node}</em>;
                if (marks.has('bold')) node = <strong>{node}</strong>;
                return <span key={j}>{node}</span>;
              })
            )}
          </p>
        );
      })}
    </>
  );
}
