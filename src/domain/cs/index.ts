export {
  formatAgendaTimeRange,
  formatLongDate,
  formatLongRange,
  formatNumericDate,
  formatNumericRange,
  formatProseTimeRange,
  formatTime,
  formatTitleDate,
  formatWeekdayNumeric,
  formatWindow,
  onWeekday,
  schoolYear,
  weekdayName,
} from './dates/format';
export { typographize, typographizeText } from './typography/typography';
export { declineToken, type Confidence, type DeclinedToken } from './names/decline';
export { splitFullName, suggestGenitive, type GenitiveSuggestion } from './names/genitive';
export { formatName, SALUTATION, type PersonName, type Salutation, type Sex } from './names/person';
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
export { foldForSearch } from './sort/fold';
export {
  renderPeople,
  renderPerson,
  withAffiliation,
  type ListOptions,
  type Person,
} from './people/list';
export {
  openingSentence,
  responsibleVerb,
  organiserVerb,
  roomLocative,
  type Campus,
  type OpeningInput,
  type ResponsibleVerb,
  type TitleGender,
} from './sentence/opening';
