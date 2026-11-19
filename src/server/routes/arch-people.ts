/** Branch arch-ui only: how Arch shows people and trail entries the real model keeps differently. */

import { isStudentTier, type Tier } from '@/domain/actor';

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

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  const familyName = parts.length > 1 ? parts.pop()! : '';
  return { givenName: parts.join(' ') || displayName, familyName };
}

/**
 * Entra sends no salutation. Arch puts the author into the organisers with one, so it is guessed
 * the way the prototype's „Doplnit oslovení podle jmen“ does: -ová/-á or a given name in -a reads
 * as a woman; a student woman is „slečna“.
 */
function guessSalutation(
  { givenName, familyName }: { givenName: string; familyName: string },
  student: boolean,
) {
  const woman =
    /(ová|á)$/i.test(familyName) ||
    (/a$/i.test(givenName) && !/^(jan|honz|mich|luk|nikol|jir|kub|mis|sas)a$/i.test(givenName));
  return !woman ? 'pan' : student ? 'slecna' : 'pani';
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
  readonly jobTitle: string | null;
  readonly department: string | null;
}

/**
 * The people a viewer's state holds: the headmaster sees the directory (`users.view`); anyone else
 * only the names their own view already mentions, and role, status and contact of nobody but
 * themselves. Who of the vedení returned or edited a point is not shown to its author (`points.get`):
 * they see „Vedení“.
 */
export function peopleFor(input: {
  readonly rows: readonly UserRow[];
  readonly actorId: string;
  readonly head: boolean;
  readonly staff: boolean;
  readonly named: ReadonlySet<string>;
  readonly vers: Record<string, number>;
}) {
  const { rows, actorId, head, staff, named, vers } = input;
  const people = rows
    .filter((u) => u.status !== 'deactivated' && (head || named.has(u.id)))
    .map((u) => {
      vers[u.id] = u.version;
      const name = splitName(u.displayName);
      const full = head || u.id === actorId;
      const student = isStudentTier(u.tier);
      return {
        id: u.id,
        salutation: guessSalutation(name, student) as string,
        ...name,
        email: full ? (u.email ?? '') : '',
        role: full ? u.role : 'submitter',
        isStudent: full ? student : false,
        ...(full && { tier: u.tier }),
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
