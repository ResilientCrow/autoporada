export {
  formatAgendaTimeRange,
  formatClock,
  formatClose,
  formatDayMonth,
  formatLongDate,
  formatLongRange,
  formatNumericDate,
  formatNumericRange,
  formatProseTimeRange,
  formatTitleDate,
  formatWeekdayNumeric,
  formatWindow,
  onWeekday,
  schoolYear,
  weekdayName,
} from './dates/format';
export { countWord, type PluralForms } from './numbers/plural';
export { typographize, typographizeText } from './typography/typography';
export { declineToken, type Confidence, type DeclinedToken } from './names/decline';
export { splitFullName, suggestGenitive, type GenitiveSuggestion } from './names/genitive';
export {
  formatName,
  PERSON_FIELD_MAX,
  SALUTATION,
  SALUTATIONS,
  type PersonName,
  type Salutation,
  type Sex,
} from './names/person';
export {
  compareClass,
  compareStudents,
  csCollator,
  normalizeClass,
  parseClass,
  type ClassKey,
  type ClassOrder,
  type SortableStudent,
} from './sort/class-code';
export { foldForSearch, matchesWordPrefixes, searchWords } from './sort/fold';
export {
  renderPeople,
  renderPerson,
  withAffiliation,
  type ListOptions,
  type Person,
} from './people/list';
export {
  parsePeopleList,
  PASTE_MAX_CHARS,
  PASTE_MAX_LINES,
  type KnownName,
  type PasteRejected,
  type PasteResult,
  type PasteRow,
} from './people/paste';
export {
  openingSentence,
  responsibleVerb,
  organiserVerb,
  roomLocative,
  type Campus,
  type OpeningInput,
  type ResponsibleVerb,
  TITLE_GENDERS,
  type TitleGender,
} from './sentence/opening';
export { placeholderParagraph, type PlaceholderInput } from './sentence/placeholder';
