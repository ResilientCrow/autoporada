import {
  Document,
  Packer,
  Paragraph,
  SectionType,
  type FileChild,
  type ISectionOptions,
} from 'docx';

import type { DocumentModel, Section } from '../model';
import { renderBlock } from './blocks';
import { pageFooter } from './footer';
import { NUMBERING } from './numbering';
import { ANNEX_COLUMNS, COMPATIBILITY_MODE, DEFAULT_TAB_STOP, PAGE, STYLES } from './styles';
import { studentTable } from './table';

function sectionOptions(section: Section, isFirst: boolean, isLast: boolean): ISectionOptions {
  const children: FileChild[] = [];
  for (const block of section.blocks) {
    if (block.kind === 'studentTable') children.push(studentTable(block.rows));
    else children.push(...renderBlock(block));
  }
  // The section break needs a paragraph of its own, as in the template:
  // docx would otherwise put it into the last spacer, which then disappears.
  if (!isLast) children.push(new Paragraph({}));
  switch (section.layout) {
    case 'single':
      // Only the first section carries the footer; the others inherit it.
      return {
        properties: { page: PAGE },
        ...(isFirst && { footers: { default: pageFooter() } }),
        children,
      };
    case 'twoColumn':
      return {
        properties: { page: PAGE, type: SectionType.CONTINUOUS, column: ANNEX_COLUMNS },
        children,
      };
    case 'nextPage':
      return { properties: { page: PAGE, type: SectionType.NEXT_PAGE }, children };
  }
}

/** The document model as .docx bytes, formatted like the school's template. */
export async function renderDocx(model: DocumentModel): Promise<Uint8Array> {
  const document = new Document({
    title: model.meta.title,
    creator: model.meta.author,
    lastModifiedBy: model.meta.author,
    defaultTabStop: DEFAULT_TAB_STOP,
    styles: STYLES,
    numbering: NUMBERING,
    compatabilityModeVersion: COMPATIBILITY_MODE,
    sections: model.sections.map((s, i, all) => sectionOptions(s, i === 0, i === all.length - 1)),
  });
  return new Uint8Array(await Packer.toBuffer(document));
}
