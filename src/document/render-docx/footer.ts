import { AlignmentType, Footer, PageNumber, Paragraph, TextRun } from 'docx';

/** „Stránka 3 z 8“, page and total in bold, plus the template's empty line under it. */
export function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun('Stránka '),
          new TextRun({ children: [PageNumber.CURRENT], bold: true }),
          new TextRun(' z '),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true }),
        ],
      }),
      new Paragraph({}),
    ],
  });
}
