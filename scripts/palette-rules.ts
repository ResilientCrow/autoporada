// The colour manual and the Tailwind rules as pure checks on one file's text
// (scripts/check-palette.ts walks src and reads the manual from the theme):
//  - colours are defined once, as tokens in src/ui/theme/;
//  - "Primární – Print" (#004D8C) is for print only and never appears in the app;
//  - class names stay inside the theme: no arbitrary values or properties, no
//    default palette, the accent only as a StatusChip background, no outline removal.

const THEME_DIR = 'src/ui/theme/';
const THEME_CSS = 'src/ui/theme/theme.css';
/** Its black and white are the printed document (ADR 0005). */
const PAPER_CSS = 'src/document/render-html/paper.module.css';
/** ADR 0012: the accent only as a StatusChip background; branch arch-ui adds the primary button and the tile count. */
const ACCENT_BACKGROUND_FILE = 'src/ui/kit/StatusChip.tsx';
const ACCENT_FILES = new Set([
  ACCENT_BACKGROUND_FILE,
  'src/ui/kit/button-styles.ts',
  'src/ui/shell/Tiles.tsx',
]);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** The print blue, any case. */
const PRINT_ONLY = /004d8c/i;
/** `--color-name: #hex` tokens of the theme. */
const TOKEN = /--color-[\w-]+:\s*(#[0-9a-fA-F]{3,8})\b/g;
/** CSS colour functions. */
const COLOUR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/;
/** `bg-[red]`, `!bg-[red]/50`, `-mt-[3px]`, `bg-(--x)`, but not the variant `data-[x=y]:`. */
const ARBITRARY_VALUE =
  /(?<![\w-])-?[a-z][a-z0-9-]*-(?:\[[^\]\s]+\]|\([^)\s]+\))(?:\/[\w.]+)?!?(?![\w:-])/;
/** `[color:red]`, `hover:[--tw-x:1]`; not `[key: string]` (space) or `[a-z:]` (empty value). */
const ARBITRARY_PROPERTY = /(?<![\w\]])\[-{0,2}[a-z][\w-]*:[^\s\]]+\]/;
/** Colour utilities with a side or compound part: `border-t-`, `ring-offset-`, `drop-shadow-`. */
const COLOUR_PREFIX =
  'bg|text|border(?:-(?:x|y|t|r|b|l|s|e))?|ring-offset|ring|inset-ring|inset-shadow|text-shadow|drop-shadow|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow';
/** Utilities of the removed default palette: they silently generate nothing. */
const DEAD_PALETTE = new RegExp(
  `(?<![\\w-])(?:${COLOUR_PREFIX})-` +
    '(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-(?:50|[1-9]00|950))?)(?![\\w-])',
);
/** The accent on anything but a background. */
const ACCENT_ELSEWHERE = new RegExp(
  `(?<![\\w-])(?:${COLOUR_PREFIX.replace('bg|', '')})-accent(?![\\w-])`,
);
const ACCENT_BACKGROUND = /(?<![\w-])bg-accent(?![\w-])/;
/** The base layer owns the focus outline. */
const FOCUS_REMOVAL = /(?<![\w-])outline-(?:none|hidden|0)(?![\w-])/;
/** SVG paint other than currentColor, none, inherit. */
const SVG_PAINT = /\b(?:fill|stroke)="(?!(?:currentColor|none|inherit)")[^"]*"/;

/** The lowercase hex of the `--color-*` tokens in the theme stylesheet. */
export function manualColours(themeCss: string): ReadonlySet<string> {
  return new Set([...themeCss.matchAll(TOKEN)].map((m) => m[1]!.toLowerCase()));
}

/** Problems in one file, as `<file>:<line>  <reason>`; `file` is repo-relative with `/`. */
export function paletteProblems(file: string, text: string, manual: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const isCss = file.endsWith('.css');
  const isTest = /\.test\.tsx?$/.test(file);
  const isTs = /\.tsx?$/.test(file);
  const inTheme = file.startsWith(THEME_DIR);

  if (isCss && file !== THEME_CSS && file !== PAPER_CSS) {
    problems.push(`${file}:1  stray stylesheet — styles live in ${THEME_CSS}`);
  }

  text.split('\n').forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    const report = (reason: string) => problems.push(`${at}  ${reason}`);

    if (PRINT_ONLY.test(line)) {
      report('#004D8C is a print-only colour');
    } else {
      for (const hex of line.match(HEX) ?? []) {
        if (!inTheme) report('hex colour outside src/ui/theme — use a token');
        else if (!manual.has(hex.toLowerCase())) report(`${hex} is not in the colour manual`);
      }
    }
    if (isTest) return;

    if ((isTs || isCss) && !inTheme && COLOUR_FUNCTION.test(line)) {
      report('colour function — use a token');
    }
    if (isTs) {
      if (ARBITRARY_VALUE.test(line)) report('arbitrary value — use a token or a scale step');
      if (ARBITRARY_PROPERTY.test(line)) report('arbitrary property — use a utility');
      if (DEAD_PALETTE.test(line)) report('default palette name — it generates nothing');
      if (file !== 'src/ui/kit/button-styles.ts' && ACCENT_ELSEWHERE.test(line)) {
        report('the accent is a StatusChip background only');
      }
      if (!ACCENT_FILES.has(file) && ACCENT_BACKGROUND.test(line)) {
        report(`bg-accent is for ${ACCENT_BACKGROUND_FILE} only`);
      }
      if (FOCUS_REMOVAL.test(line)) report('do not remove the outline — the base layer owns focus');
    }
    if (file.endsWith('.tsx') && SVG_PAINT.test(line)) {
      report('SVG paint must be currentColor, none or inherit');
    }
  });
  return problems;
}
