/**
 * Grammatical gender and number of an event title, as the opening sentence
 * needs it (ADR 0067): proběhl … který / proběhla … kterou / proběhlo … které /
 * proběhly … které / proběhla … která (neuter plural, „Krajská kola SOČ“).
 */
export type TitleGender = 'm' | 'f' | 'n' | 'pl' | 'npl';

/** „proběhl“ and its agreeing forms, for the opening and the placeholder paragraph. */
export const PAST_TENSE: Readonly<Record<TitleGender, string>> = {
  m: 'proběhl',
  f: 'proběhla',
  n: 'proběhlo',
  pl: 'proběhly',
  npl: 'proběhla',
};

/**
 * The kinds of events the school holds, by the gender of their name, all
 * lowercase. A new kind is one more word here, no migration. Nouns in -ání,
 * -ení and -ění (setkání, jednání, představení) and in -iáda (Robotiáda) are
 * not listed: `title-gender.ts` reads them by their ending.
 *
 * Left out on purpose, because they are not kinds of events or clash with
 * names of towns and places: cena, program, kino, volno, tábor, test, účast.
 */
export const TITLE_WORDS: Readonly<Record<TitleGender, readonly string[]>> = {
  m: [
    ...['seminář', 'webinář', 'workshop', 'kurz', 'výcvik', 'trénink', 'lyžák', 'hackathon'],
    ...['gamejam', 'turnaj', 'zápas', 'závod', 'běh', 'pochod', 'maraton', 'přebor', 'pohár'],
    ...['kvíz', 'koncert', 'recitál', 'muzikál', 'festival', 'majáles', 'ples', 'karneval'],
    ...['průvod', 'večer', 'večírek', 'raut', 'piknik', 'oběd', 'jarmark', 'veletrh', 'trh'],
    ...['bazar', 'výlet', 'výjezd', 'zájezd', 'pobyt', 'kemp', 'den', 'týden', 'víkend'],
    ...['ročník', 'cyklus', 'projekt', 'kongres', 'summit', 'panel', 'meetup', 'event'],
    ...['happening', 'teambuilding', 'brainstorming', 'rozhovor', 'podcast', 'stream'],
    ...['přenos', 'zápis', 'nábor', 'konkurz', 'pohovor', 'křest', 'ceremoniál', 'audit'],
    ...['poplach', 'nácvik', 'sraz', 'sběr', 'kroužek', 'klub'],
  ],
  f: [
    ...['akce', 'stáž', 'praxe', 'brigáda', 'porada', 'rada', 'komise', 'schůze', 'schůzka'],
    ...['konference', 'konzultace', 'hospitace', 'inspekce', 'kontrola', 'návštěva'],
    ...['prohlídka', 'exkurze', 'expedice', 'výprava', 'vycházka', 'cesta', 'výměna'],
    ...['mobilita', 'diskuse', 'diskuze', 'debata', 'beseda', 'besídka', 'přednáška'],
    ...['prezentace', 'ukázka', 'lekce', 'hodina', 'výuka', 'dílna', 'simulace', 'soutěž'],
    ...['liga', 'štafeta', 'hra', 'zkouška', 'generálka', 'maturita', 'výstava', 'vernisáž'],
    ...['přehlídka', 'premiéra', 'derniéra', 'show', 'projekce', 'reportáž', 'slavnost'],
    ...['oslava', 'rozlučka', 'akademie', 'imatrikulace', 'noc', 'burza', 'sbírka', 'aukce'],
    ...['dražba', 'tombola', 'kampaň', 'snídaně', 'večeře', 'párty', 'evakuace', 'pouť'],
    ...['mše', 'bohoslužba'],
    // Substantivised adjective: „prodloužená v rámci tanečních“.
    'prodloužená',
  ],
  n: [
    ...['kolo', 'finále', 'semifinále', 'čtvrtfinále', 'fórum', 'sympozium', 'kolokvium'],
    ...['mistrovství', 'výročí', 'divadlo', 'referendum', 'turné'],
  ],
  pl: [
    ...['oslavy', 'slavnosti', 'schůzky', 'porady', 'návštěvy', 'prohlídky', 'dny', 'týdny'],
    ...['volby', 'hry', 'závody', 'zápasy', 'turnaje', 'soutěže', 'zkoušky', 'přijímačky'],
    ...['maturity', 'kurzy', 'semináře', 'workshopy', 'přednášky', 'besedy', 'koncerty'],
    ...['výlety', 'dílny', 'hodiny', 'stáže', 'pohovory', 'konkurzy', 'zápisy', 'trhy'],
    ...['prázdniny', 'narozeniny', 'vánoce', 'velikonoce'],
    // Substantivised adjective: „Taneční“ (the dance classes).
    'taneční',
  ],
  npl: ['kola'],
};

/**
 * Listed words that are adjectives in form. Before a noun they are adjectives
 * („Taneční kurz“), and they name the event only when nothing follows them
 * but a preposition („prodloužená v rámci tanečních“).
 */
export const SUBSTANTIVISED_ADJECTIVES: ReadonlySet<string> = new Set(['prodloužená', 'taneční']);
