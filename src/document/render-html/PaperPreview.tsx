import type { ReactNode } from 'react';

import type { Block, DocumentModel, Run, StudentRow } from '../model';
import styles from './paper.module.css';

function Runs({ runs }: { readonly runs: readonly Run[] }): ReactNode {
  return runs.map((r, i) => {
    let node: ReactNode = r.text;
    if (r.italic) node = <i>{node}</i>;
    if (r.bold) node = <b>{node}</b>;
    return <span key={i}>{node}</span>;
  });
}

const boldItalic = (text: string) => (
  <b>
    <i>{text}</i>
  </b>
);

const RICH = [styles['rich0'], styles['rich1'], styles['rich2']] as const;

function StudentTable({ rows }: { readonly rows: readonly StudentRow[] }): ReactNode {
  // Two newspaper columns; each starts with the header, as in the document.
  const half = Math.ceil(rows.length / 2);
  const columns = rows.length > 0 ? [rows.slice(0, half), rows.slice(half)] : [[]];
  return (
    <div className={styles['students']}>
      {columns.map((column, c) => (
        <table key={c}>
          <thead>
            <tr>
              <th>Jméno a příjmení</th>
              <th>Třída</th>
            </tr>
          </thead>
          <tbody>
            {column.map((r, i) => (
              <tr key={i} className={r.isNew ? styles['new'] : undefined}>
                <td>{r.name}</td>
                <td>{r.classCode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function BlockView({ block }: { readonly block: Block }): ReactNode {
  switch (block.kind) {
    case 'title':
      return <p className={styles['title']}>{block.text}</p>;
    case 'label':
      return (
        <p>
          <b>{block.label}</b> {block.text}
        </p>
      );
    case 'section':
      return <h2 className={styles['section']}>{block.text}</h2>;
    case 'point':
      return (
        <h3 className={styles['point']}>
          <span className={styles['number']}>{`${block.number}).`}</span>
          {block.text}
        </h3>
      );
    case 'body':
      return (
        <p className={styles['body']}>
          <Runs runs={block.runs} />
        </p>
      );
    case 'reportLine':
      return (
        <p className={styles['reportLine']}>
          {boldItalic(`- ${block.label}`)}
          <Runs runs={block.runs} />
        </p>
      );
    case 'dash':
      return (
        <p className={`${styles['item']} ${styles['dash']}`}>
          {boldItalic(block.label)}
          <Runs runs={block.runs} />
        </p>
      );
    case 'bullet':
      return (
        <p className={`${styles['item']} ${styles['bullet']}`}>
          <Runs runs={block.runs} />
        </p>
      );
    case 'rich':
      return (
        <p className={`${styles['item']} ${RICH[block.level]}`}>
          <Runs runs={block.runs} />
        </p>
      );
    case 'partner':
      return (
        <p className={`${styles['item']} ${RICH[0]}`}>
          {boldItalic(block.label)} {block.quote}
        </p>
      );
    case 'spacer':
      return <p />;
    case 'pageBreak':
      return <hr className={styles['pageBreak']} />;
    case 'closing':
      return (
        <>
          <p className={styles['left']}>{block.place}</p>
          <p className={styles['left']}>{block.signature}</p>
        </>
      );
    case 'annex':
      return <h2 className={styles['annex']}>{block.text}</h2>;
    case 'annexTitle':
      return <h3 className={styles['annexTitle']}>{block.text}</h3>;
    case 'studentTable':
      return <StudentTable rows={block.rows} />;
  }
}

function Blocks({ blocks }: { readonly blocks: readonly Block[] }): ReactNode {
  return blocks.map((block, i) => <BlockView key={i} block={block} />);
}

/** Blocks without the page: for the live preview of a single point. */
export function PaperBlocks({ blocks }: { readonly blocks: readonly Block[] }): ReactNode {
  return (
    <div className={styles['blocks']}>
      <Blocks blocks={blocks} />
    </div>
  );
}

/** The whole document as it will print. `label` names it for screen readers. */
export function PaperPreview({
  model,
  label,
}: {
  readonly model: DocumentModel;
  readonly label: string;
}): ReactNode {
  return (
    <article className={`${styles['paper']} ${styles['blocks']}`} aria-label={label}>
      {model.sections.map((section, s) => (
        <section key={s}>
          {/* Příloha 2 starts a new page in Word; show the same break here. */}
          {section.layout === 'nextPage' && <hr className={styles['pageBreak']} />}
          <Blocks blocks={section.blocks} />
        </section>
      ))}
    </article>
  );
}
