import { AlignmentType, LevelFormat, type INumberingOptions } from 'docx';

import { FONT } from './styles';

/** Numbering references used by the block renderers. */
export const NUMBERING_REF = {
  points: 'points',
  bullet: 'bullet',
  rich: 'rich',
  dash: 'dash',
  partners: 'partners',
} as const;

type Level = INumberingOptions['config'][number]['levels'][number];

const bullet = (
  level: number,
  text: string,
  font: string,
  left: number,
  run: { bold?: boolean; italics?: boolean } = {},
): Level => ({
  level,
  format: LevelFormat.BULLET,
  text,
  alignment: AlignmentType.LEFT,
  style: { run: { font, ...run }, paragraph: { indent: { left, hanging: 360 } } },
});

/** Symbol „•“ and Wingdings „■“ are Private Use Area code points, as in the template. */
const BULLET = '';
const SQUARE = '';

/**
 * The template's numbering definitions (numIds 5, 1, 2, 3, 8). Points use one
 * definition everywhere, so numbering never restarts between sections.
 */
export const NUMBERING: INumberingOptions = {
  config: [
    {
      reference: NUMBERING_REF.points,
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1).',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
    { reference: NUMBERING_REF.bullet, levels: [bullet(0, BULLET, 'Symbol', 720)] },
    {
      reference: NUMBERING_REF.rich,
      levels: [
        // Bold here; italic comes from the paragraph mark, exactly as in the template.
        bullet(0, 'o', 'Courier New', 1068, { bold: true }),
        bullet(1, 'o', 'Courier New', 1788),
        bullet(2, SQUARE, 'Wingdings', 2345),
      ],
    },
    {
      reference: NUMBERING_REF.dash,
      levels: [bullet(0, '-', FONT, 1065, { bold: true, italics: true })],
    },
    {
      reference: NUMBERING_REF.partners,
      levels: [
        bullet(0, 'o', 'Courier New', 1068, { bold: true }),
        bullet(1, 'o', 'Courier New', 1788),
        bullet(2, SQUARE, 'Wingdings', 2508),
      ],
    },
  ],
};
