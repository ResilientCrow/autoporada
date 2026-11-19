export {
  formatAgendaTimeRange,
  formatClock,
  formatClose,
  formatDayMonth,
  formatLongDate,
  formatAgendaDays,
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
  headedName,
  PERSON_HEADS,
  type HeadedPerson,
  type NameCase,
  type PersonHead,
} from './names/heads';
export {
  formatName,
  PERSON_FIELD_MAX,
  SALUTATION,
  SALUTATIONS,
  salutationsFor,
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
  withAffiliation,
  type ListOptions,
  type OneLabelOptions,
  type Person,
  type UnaddressedPerson,
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
export { openingSentence, organiserVerb, type Campus, type OpeningInput } from './sentence/opening';
export { placePhrase } from './place/place-phrase';
export type { TitleGender } from './sentence/title-words';
export {
  ORGANIZER_ROLES,
  organizerOnOneLine,
  organizerPhrase,
  type OrganizerRole,
} from './sentence/organizer';
export {
  PARTICIPANTS_ADDRESSES,
  participantsAgenda,
  participantsFits,
  participantsLabel,
  participantsPastLead,
  participantsSeveral,
  participantsWomen,
  type ParticipantsAddress,
} from './sentence/participants';
export { campusLabel, placeholderParagraph, type PlaceholderInput } from './sentence/placeholder';
