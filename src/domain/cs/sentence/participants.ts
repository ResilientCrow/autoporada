import { severalPeople } from '../names/several';

/**
 * How the author addresses the participants of an akce as one group (ADR 0071): all of them are
 * „slečny a pánové“, or „slečny“, or „pánové“, or none of these. The app never knows anyone's gender.
 */
export const PARTICIPANTS_ADDRESSES = [
  'slecny-a-panove',
  'slecny',
  'panove',
  'bez-osloveni',
] as const;
export type ParticipantsAddress = (typeof PARTICIPANTS_ADDRESSES)[number];

/** A label by number; „bez oslovení“ has none. */
const LABELS: Readonly<Record<ParticipantsAddress, { one: string; many: string } | null>> = {
  'slecny-a-panove': { one: 'slečny a pánové', many: 'slečny a pánové' },
  slecny: { one: 'slečna', many: 'slečny' },
  panove: { one: 'pan', many: 'pánové' },
  'bez-osloveni': null,
};

/** The past verb that agrees with the label. */
const PAST: Readonly<Record<ParticipantsAddress, { one: string; many: string }>> = {
  'slecny-a-panove': { one: 'zúčastnili', many: 'zúčastnili' },
  slecny: { one: 'zúčastnila', many: 'zúčastnily' },
  panove: { one: 'zúčastnil', many: 'zúčastnili' },
  'bez-osloveni': { one: 'zúčastnili', many: 'zúčastnili' },
};

/** The label in the right number; null for no address or „bez oslovení“. */
export function participantsLabel(
  address: ParticipantsAddress | null,
  several: boolean,
): string | null {
  const label = address === null ? null : LABELS[address];
  return label ? (several ? label.many : label.one) : null;
}

/** Whether the label speaks of women only, so the names under it are read as women's. */
export const participantsWomen = (address: ParticipantsAddress): boolean => address === 'slecny';

/** „Slečny a pánové“ needs several people; every other choice fits one or many. */
export const participantsFits = (address: ParticipantsAddress | null, several: boolean): boolean =>
  address !== 'slecny-a-panove' || several;

/**
 * The participants as the agenda line prints them (ADR 0071): „zúčastní se slečny a pánové: Eva
 * Malá (3.B), Jan Novák (2.A)“, „zúčastní se slečna: Eva Malá (3.B)“. The names print as typed;
 * no address or „bez oslovení“ prints them alone. Empty names print nothing.
 */
export function participantsAgenda(address: ParticipantsAddress | null, names: string): string {
  const typed = names.trim();
  const label = typed === '' ? null : participantsLabel(address, severalPeople(typed));
  return label === null ? typed : `zúčastní se ${label}: ${typed}`;
}

/**
 * The lead-in of the missing report's sentence, after „Za Smíchovskou střední“: „se zúčastnili
 * slečny a pánové“, „se zúčastnila slečna“, „se zúčastnil pan“; no address or „bez oslovení“ keeps
 * „se zúčastnili“ for any number.
 */
export function participantsPastLead(
  address: ParticipantsAddress | null,
  several: boolean,
): string {
  const label = participantsLabel(address, several);
  const verb = PAST[address ?? 'bez-osloveni'][several ? 'many' : 'one'];
  return label === null ? `se ${verb}` : `se ${verb} ${label}`;
}
