import { AlignmentType, HeadingLevel, PageBreak, Paragraph, TextRun } from 'docx';

import type { Block, Run } from '../model';
import { NUMBERING_REF } from './numbering';
import { INDENT, SIZE } from './styles';

const runs = (list: readonly Run[]) =>
  list.map(
    (r) =>
      new TextRun({
        text: r.text,
        ...(r.bold && { bold: true }),
        ...(r.italic && { italics: true }),
      }),
  );

const boldItalic = (text: string) => new TextRun({ text, bold: true, italics: true });

/** Paragraph-mark formatting that also styles the list glyph (bold italic „o“). */
const BOLD_ITALIC_MARK = { bold: true, italics: true } as const;

/** One block → its paragraphs. The Příloha 1 table is rendered separately. */
export function renderBlock(block: Exclude<Block, { kind: 'studentTable' }>): Paragraph[] {
  switch (block.kind) {
    case 'title':
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, bold: true, size: SIZE.title })],
        }),
      ];
    case 'label':
      return [
        new Paragraph({
          children: [new TextRun({ text: block.label, bold: true }), new TextRun(` ${block.text}`)],
        }),
      ];
    case 'section':
      return [
        new Paragraph({
          keepNext: true,
          children: [new TextRun({ text: block.text, bold: true, size: SIZE.section })],
        }),
      ];
    case 'point':
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          numbering: { reference: NUMBERING_REF.points, level: 0 },
          indent: INDENT.point,
          children: [new TextRun(block.text)],
        }),
      ];
    case 'body':
      return [
        new Paragraph({ indent: { firstLine: INDENT.firstLine }, children: runs(block.runs) }),
      ];
    case 'reportLine':
      return [
        new Paragraph({
          indent: { left: INDENT.reportLine },
          children: [boldItalic(`- ${block.label}`), ...runs(block.runs)],
        }),
      ];
    case 'dash':
      return [
        new Paragraph({
          numbering: { reference: NUMBERING_REF.dash, level: 0 },
          run: BOLD_ITALIC_MARK,
          children: [boldItalic(block.label), ...runs(block.runs)],
        }),
      ];
    case 'bullet':
      return [
        new Paragraph({
          numbering: { reference: NUMBERING_REF.bullet, level: 0 },
          children: runs(block.runs),
        }),
      ];
    case 'rich':
      return [
        new Paragraph({
          numbering: { reference: NUMBERING_REF.rich, level: block.level },
          ...(block.level === 0 && { run: BOLD_ITALIC_MARK }),
          children: runs(block.runs),
        }),
      ];
    case 'partner':
      return [
        new Paragraph({
          // The template's partner glyph is bold upright: no paragraph-mark italic here.
          numbering: { reference: NUMBERING_REF.partners, level: 0 },
          children: [boldItalic(block.label), new TextRun(` ${block.quote}`)],
        }),
      ];
    case 'spacer':
      return [new Paragraph(block.keepNext ? { keepNext: true } : {})];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'closing':
      return [
        new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun(block.place)] }),
        new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun(block.signature)] }),
      ];
    case 'annex':
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, bold: true, size: SIZE.annex })],
        }),
      ];
    case 'annexTitle':
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, bold: true, size: SIZE.annexTitle })],
        }),
      ];
  }
}
