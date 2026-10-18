import {
  AlignmentType,
  Footer,
  Paragraph,
  TextRun,
  XmlAttributeComponent,
  XmlComponent,
} from 'docx';

class FieldCharType extends XmlAttributeComponent<{ readonly type: string }> {
  protected override readonly xmlKeys = { type: 'w:fldCharType' };
}

/** <w:fldChar w:fldCharType="begin|separate|end"/> */
class FieldChar extends XmlComponent {
  constructor(type: 'begin' | 'separate' | 'end') {
    super('w:fldChar');
    this.root.push(new FieldCharType({ type }));
  }
}

class PreserveSpace extends XmlAttributeComponent<{ readonly space: string }> {
  protected override readonly xmlKeys = { space: 'xml:space' };
}

/** <w:instrText xml:space="preserve"> PAGE </w:instrText> */
class InstructionText extends XmlComponent {
  constructor(code: string) {
    super('w:instrText');
    this.root.push(new PreserveSpace({ space: 'preserve' }));
    this.root.push(code);
  }
}

const boldRun = (child: XmlComponent) => new TextRun({ bold: true, children: [child] });

/**
 * A field written the way the template writes it: one bold run per part and
 * a cached result. LibreOffice drops the bold of a field packed into a
 * single run, so the page numbers would print regular in the PDF.
 */
function field(instruction: 'PAGE' | 'NUMPAGES'): TextRun[] {
  return [
    boldRun(new FieldChar('begin')),
    boldRun(new InstructionText(` ${instruction} `)),
    boldRun(new FieldChar('separate')),
    new TextRun({ text: '1', bold: true }),
    boldRun(new FieldChar('end')),
  ];
}

/** „Stránka 3 z 8“, page and total in bold, plus the template's empty line under it. */
export function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun('Stránka '),
          ...field('PAGE'),
          new TextRun(' z '),
          ...field('NUMPAGES'),
        ],
      }),
      new Paragraph({}),
    ],
  });
}
