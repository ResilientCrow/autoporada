import { Document, Packer, SectionType, type FileChild, type ISectionOptions } from 'docx';

import type { DocumentModel, Section } from '../model';
import { renderBlock } from './blocks';
import { pageFooter } from './footer';
import { NUMBERING } from './numbering';
import { ANNEX_COLUMNS, COMPATIBILITY_MODE, PAGE, STYLES } from './styles';
import { studentTable } from './table';

function sectionOptions(section: Section, isFirst: boolean): ISectionOptions {
  const children: FileChild[] = [];
  for (const block of section.blocks) {
    if (block.kind === 'studentTable') children.push(studentTable(block.rows));
    else children.push(...renderBlock(block));
  }
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
    styles: STYLES,
    numbering: NUMBERING,
    compatabilityModeVersion: COMPATIBILITY_MODE,
    sections: model.sections.map((s, i) => sectionOptions(s, i === 0)),
  });
  return new Uint8Array(await Packer.toBuffer(document));
}
