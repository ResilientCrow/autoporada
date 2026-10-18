import {
  AlignmentType,
  BorderStyle,
  HeightRule,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

import type { StudentRow } from '../model';
import { SIZE, TABLE_FONT } from './styles';

const GRID = [3399, 961] as const;
const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE } as const;

function cell(
  text: string,
  width: number,
  bold: boolean,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment,
        children: [
          new TextRun({ text, bold, font: TABLE_FONT, size: SIZE.table, color: '000000' }),
        ],
      }),
    ],
  });
}

function row(name: string, classCode: string, bold: boolean, header: boolean): TableRow {
  return new TableRow({
    tableHeader: header,
    cantSplit: true,
    height: { value: header ? 315 : 300, rule: HeightRule.ATLEAST },
    children: [
      cell(name, GRID[0], bold, AlignmentType.LEFT),
      cell(classCode, GRID[1], bold, AlignmentType.CENTER),
    ],
  });
}

/** Příloha 1: „Jméno a příjmení | Třída“, new students bold in both cells, no padding rows. */
export function studentTable(rows: readonly StudentRow[]): Table {
  return new Table({
    width: { size: 4360, type: WidthType.DXA },
    columnWidths: [...GRID],
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { top: 0, bottom: 0, left: 108, right: 108 },
    rows: [
      row('Jméno a příjmení', 'Třída', true, true),
      ...rows.map((r) => row(r.name, r.classCode, r.isNew, false)),
    ],
  });
}
