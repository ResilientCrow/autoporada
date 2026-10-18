/**
 * Masculine names whose 2nd case no suffix rule gets right — mostly the
 * mobile „e“ (Pavel → Pavla) and its absence (Daniel → Daniela). Keys are
 * lower case; values are complete genitive forms.
 */
export const MASCULINE_GENITIVE: Readonly<Record<string, string>> = {
  // mobile e in -el
  pavel: 'pavla',
  karel: 'karla',
  havel: 'havla',
  kozel: 'kozla',
  orel: 'orla',
  vorel: 'vorla',
  kotel: 'kotla',
  // no mobile e where the -el rule would be unsure
  daniel: 'daniela',
  michael: 'michaela',
  samuel: 'samuela',
  gabriel: 'gabriela',
  emanuel: 'emanuela',
  rafael: 'rafaela',
  marcel: 'marcela',
  // mobile e elsewhere
  lev: 'lva',
  švec: 'ševce',
  // established forms
  král: 'krále',
  otto: 'otty',
  mráz: 'mráze',
  klaus: 'klause',
  kraus: 'krause',
  strauss: 'strausse',
};

/** Name particles that stay unchanged: „Ludwiga van Beethovena“. */
export const PARTICLES: ReadonlySet<string> = new Set([
  'van',
  'von',
  'de',
  'da',
  'di',
  'du',
  'del',
  'della',
  'der',
  'den',
  'dos',
  'das',
  'la',
  'le',
  'al',
  'el',
  'ben',
  'bin',
  'ibn',
  'ter',
  'ten',
  'af',
  'zu',
  'y',
]);
