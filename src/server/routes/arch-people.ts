/** Branch arch-ui only: how Arch shows people and trail entries the real model keeps differently. */

import { isStudentTier, type Tier, type UserFunction } from '@/domain/actor';
import { beforeName, splitFullName, type BeforeName, type Salutation } from '@/domain/cs';

export const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const WHAT: Record<string, string> = {
  submit: 'Odesláno',
  approve: 'Schváleno',
  return: 'Vráceno k úpravě',
  reject: 'Zamítnuto',
  retract: 'Vzato zpět',
  withdraw: 'Zrušeno',
  cancel: 'Zrušeno',
  edit: 'Upraveno vedením',
  revise: 'Upraveno',
  publish: 'Vydáno',
  'request-cancel': 'Požádáno o zrušení',
  'refuse-cancel': 'Zrušení zamítnuto',
  'retract-cancel': 'Žádost o zrušení vzata zpět',
};

/**
 * The directory's display name as given and family name, its degrees dropped like a typed
 * name's (ADR 0076): „Mgr. Jana Nováková, Ph.D.“ is Jana Nováková. A lone word stays the given
 * name, as before. The salutation passed is unused by the split.
 */
function splitName(displayName: string) {
  const { givenName, familyName } = splitFullName(displayName, 'pan');
  return givenName
    ? { givenName, familyName }
    : { givenName: familyName || displayName.trim(), familyName: '' };
}

/** A reviewer's edit keeps the previous fields; Arch shows them as text. */
export function flatBefore(before: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (before && typeof before === 'object') {
    for (const [k, v] of Object.entries(before))
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

interface UserRow {
  readonly id: string;
  readonly version: number;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: string;
  readonly status: string;
  readonly tier: Tier | null;
  readonly salutation: Salutation | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
}

/**
 * The people a viewer's state holds: the headmaster sees the directory (`users.view`); anyone else
 * only the names their own view already mentions, and role, status and contact of nobody but
 * themselves, and their tier, functions, salutation (ADR 0072); what prints in a
 * document comes from the cards (`cardsFor`). Who of the vedení returned or edited a point is not
 * shown to its author (`points.get`): they see „Vedení“.
 */
export function peopleFor(input: {
  readonly rows: readonly UserRow[];
  readonly actorId: string;
  readonly head: boolean;
  readonly staff: boolean;
  readonly named: ReadonlySet<string>;
  /** Each user's functions in order (`UserRepo.functions`); a user with none is absent. */
  readonly functions: ReadonlyMap<string, readonly UserFunction[]>;
  readonly vers: Record<string, number>;
}) {
  const { rows, actorId, head, staff, named, functions, vers } = input;
  const people = rows
    .filter((u) => u.status !== 'deactivated' && (head || named.has(u.id)))
    .map((u) => {
      vers[u.id] = u.version;
      const name = splitName(u.displayName);
      const full = head || u.id === actorId;
      const student = isStudentTier(u.tier);
      return {
        id: u.id,
        // The person's own answer, never guessed (ADR 0072 item 6): none yet comes without one.
        // Only they and the headmaster see it; a document gets it from the cards.
        salutation: full ? (u.salutation as string | null) : null,
        ...name,
        email: full ? (u.email ?? '') : '',
        role: full ? u.role : 'submitter',
        isStudent: full ? student : false,
        ...(full && { tier: u.tier }),
        ...(full && { functions: functions.get(u.id) ?? [] }),
        status: full && u.status === 'blocked' ? 'blocked' : 'active',
        ...(full && u.jobTitle && { job: u.jobTitle }),
        ...(full && u.department && { affiliation: u.department }),
      };
    });
  if (staff) return people;
  return [
    ...people,
    {
      id: 'vedeni',
      salutation: 'pan',
      givenName: 'Vedení',
      familyName: '',
      email: '',
      role: 'submitter',
      isStudent: false,
      status: 'active',
    },
  ];
}

/**
 * A person as a people row copies them (ADR 0072 item 7): the name, the person's own salutation,
 * and what prints before the name. Nothing else: no email, role, status, tier or
 * function list, so a colleague's card tells a submitter no more than a printed document would.
 */
export interface Card extends BeforeName {
  readonly id: string;
  readonly salutation: Salutation | null;
  readonly givenName: string;
  readonly familyName: string;
}

/**
 * The cards a viewer may copy from: someone who may write points and is not a student gets every
 * user who can sign in (not pending, blocked or deactivated); a student only their own, since a
 * student's colleagues are not theirs to name; anyone else none. A salutation is never guessed.
 */
export function cardsFor(input: {
  readonly rows: readonly UserRow[];
  readonly actorId: string;
  readonly viewer: 'staff' | 'student' | 'none';
  /** Each user's functions in order (`UserRepo.functions`); a user with none is absent. */
  readonly functions: ReadonlyMap<string, readonly UserFunction[]>;
}): Card[] {
  const { rows, actorId, viewer, functions } = input;
  if (viewer === 'none') return [];
  return rows
    .filter((u) =>
      viewer === 'student' ? u.id === actorId : u.role !== 'pending' && u.status === 'active',
    )
    .map((u) => ({
      id: u.id,
      salutation: u.salutation,
      ...splitName(u.displayName),
      ...beforeName(u.tier, functions.get(u.id) ?? []),
    }));
}
