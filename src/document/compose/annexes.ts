import { isRichDocEmpty } from '@/domain/richtext';

import type { Block, Section } from '../model';
import type { ComposeContext } from './context';
import { studentRows } from './students';
import { finalText, richBlocks, spacer } from './text';

/** The end of the main section: page break, „PŘÍLOHA 1“, its heading and intro. */
export function annex1Intro(ctx: ComposeContext): Block[] {
  const { heading, intro } = ctx.snapshot.annex1;
  return [
    { kind: 'pageBreak' },
    ...spacer(2),
    { kind: 'annex', text: 'PŘÍLOHA 1' },
    ...spacer(2),
    { kind: 'annexTitle', text: finalText(heading) },
    ...richBlocks(intro, ctx.tokens),
    ...spacer(),
  ];
}

/** The two-column section holding only the Příloha 1 table. */
export function annex1Table(ctx: ComposeContext): Section {
  const lists = ctx.snapshot.registry.filter((l) => l.purpose === 'annex1');
  return { layout: 'twoColumn', blocks: [{ kind: 'studentTable', rows: studentRows(lists) }] };
}

/** Further annexes, numbered from `first`, each on a page of its own. */
export function extraAnnexes(ctx: ComposeContext, first: number): Section[] {
  return ctx.snapshot.annexes.map((a, i) => ({
    layout: 'nextPage' as const,
    blocks: [
      { kind: 'annex' as const, text: `PŘÍLOHA ${first + i}` },
      ...spacer(),
      ...(a.title.trim()
        ? [{ kind: 'annexTitle' as const, text: finalText(a.title) }, ...spacer()]
        : []),
      ...a.parts.flatMap((p): Block[] => {
        if (p.kind === 'text') return [...richBlocks(p.doc, ctx.tokens), ...spacer()];
        if (p.kind === 'table') {
          const cols = Math.max(0, ...p.rows.map((r) => r.length));
          return [
            {
              kind: 'dataTable',
              rows: p.rows.map((r) =>
                Array.from({ length: cols }, (_, j) => finalText(r[j] ?? '')),
              ),
            },
            ...spacer(),
          ];
        }
        return [{ kind: 'image', src: p.src, width: p.w, height: p.h, alt: p.alt }, ...spacer()];
      }),
    ],
  }));
}

/** Příloha 2 on a page of its own, or nothing when it is empty. */
export function annex2(ctx: ComposeContext): Section[] {
  const doc = ctx.snapshot.annex2;
  if (!doc || isRichDocEmpty(doc)) return [];
  return [
    {
      layout: 'nextPage',
      blocks: [{ kind: 'annex', text: 'PŘÍLOHA 2' }, ...spacer(), ...richBlocks(doc, ctx.tokens)],
    },
  ];
}
