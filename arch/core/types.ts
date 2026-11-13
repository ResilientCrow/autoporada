import type { Campus, OrganizerRole, Salutation } from '@/domain/cs';
import type { BulletSpec, DraftPerson, PointContent, PointKind } from '@/domain/report';
import type { FutureState, IssueStatus, PointState, ReportState } from '@/domain/review';
import type { Statement, SystemSlot } from '@/domain/outline';
import type { RichDoc } from '@/domain/richtext';
import type { CalDate, WallTime } from '@/domain/time';

export type Role = 'pending' | 'submitter' | 'reviewer' | 'headmaster';
export interface User {
  id: string; salutation: Salutation; givenName: string; familyName: string; titlesBefore?: string;
  email: string; role: Role; isStudent: boolean; status: 'active' | 'blocked'; affiliation?: string; job?: string;
}
export interface Trail { at: string; who: string; what: string; note?: string; parts?: string[]; original?: Record<string, string> }
export interface Point {
  id: string; kind: PointKind; typeId: string | null; authorId: string; akceId: string | null;
  content: PointContent; state: PointState; handInMonday: string | null; submittedAt: string | null;
  /** The porada it is in: the hand-in Monday's, or after a drop the next open one (the server's `poradaMondayOf`). */
  poradaMonday: string | null;
  /** While returned: the reviewer's note and the parts to rework (ADR 0058), either or both. */
  note: string | null; parts: string[] | null; savedAt: string; trail: Trail[];
}
export interface Future {
  id: string; kind: 'jednani' | 'akce'; authorId: string; title: string; date: CalDate; endDate: CalDate | null;
  timeFrom: WallTime | null; timeTo: WallTime | null; campus: Campus | null; place: string; /** Free texts (ADR 0060); `remark` is the Poznámka, `note` is the reviewer's return note. */ organizer: string; /** What the organizer does (ADR 0063); null until chosen, and for an item typed before the role existed. */ organizerRole: OrganizerRole | null; participants: string; remark: string;
  state: FutureState; changed: boolean; /** Approved once, even if back in review since: cancelled, never deleted (ADR 0057). */ wasApproved: boolean; /** The author asked to cancel this approved item; the vedení decides (ADR 0062). */ cancelRequested: boolean; /** When it was asked for: the queue orders by it (ADR 0062 item 5). */ cancelRequestedAt: string | null; /** Why the vedení refused that request, for the author; null otherwise. */ cancelRefusal: string | null; note: string | null; parts: string[] | null; report: ReportState; submittedAt: string | null; savedAt: string; trail: Trail[]; dateSet?: boolean;
}
export interface Row {
  id: string; section: 'pokyny' | 'hospodareni'; slot: SystemSlot | null; persistence: 'standing' | 'once';
  title: string; body: RichDoc; quotes: Statement[]; pointId: string | null; isNew?: boolean;
}
export type AnnexPart =
  | { id: string; kind: 'text'; doc: RichDoc }
  | { id: string; kind: 'table'; rows: string[][] }
  | { id: string; kind: 'image'; src: string; w: number; h: number; alt: string };
export interface Annex { id: string; title: string; parts: AnnexPart[] }
export interface Issue {
  monday: string; meetingDate: string; deadlineAt: string; status: IssueStatus; present: string; guests: string;
  annex2: RichDoc | null; annexes: Annex[]; rows: Row[]; placeholders: Record<string, string>;
  /** What the porada stores itself, not carried or derived: what a drop hands over (ADR 0054). */
  own: { rows: boolean; present: boolean; guests: boolean; annex2: boolean };
  doc?: { at: string; by: string; pdf: 'rendering' | 'ready' | 'failed'; model: unknown; points: number; pdfFailure?: string; left?: { moved: string[]; missed: string[] } };
}
/** The headmaster's check of an akce's missing-report paragraph (ADR 0061): `was` is the paragraph they confirmed. */
export interface PlaceholderCheck { checked: boolean; was: string | null; /** Where the server put the placeholder when it sent the state (`placeholderStatus`); dropped by a local edit that makes it stale. */ status?: 'checked' | 'handed-in' | 'open' | 'to-check' }
export interface RegistryEntry { id: string; givenName: string; familyName: string; classCode: string; isNew: boolean }
export interface RegistryList { key: string; purpose: 'annex1' | 'point4'; docLabel: string; name: string; archived: boolean; entries: RegistryEntry[] }
export interface PointType { id: string; name: string; titleGender: 'm' | 'f' | 'n' | 'pl' | 'npl' | null; bullets: BulletSpec[]; locked: boolean; active: boolean }
export interface AccessReq { id: string; name: string; email: string; reason: string; at: string; state: 'pending' | 'approved' | 'rejected' | 'blocked' | 'cancelled'; decidedAt?: string; userId?: string }
export interface Mail { id: string; at: string; to: string; subject: string; body: string }
export interface Settings { dayOffset: number; time: string; remindSoft: boolean; remindHard: boolean; annex1Heading: string; annex1Intro: RichDoc }
export interface State {
  v: number; now: string; userId: string | null; users: User[]; types: PointType[]; points: Point[]; futures: Future[];
  issues: Issue[]; /** By akce id; the headmaster's only. */ placeholderChecks: Record<string, PlaceholderCheck>; plannedThrough: string; registry: RegistryList[]; requests: AccessReq[]; settings: Settings; mails: Mail[]; stepUpAt: string | null; seq: number; audit: { at: string; who: string; what: string }[];
}
export type { Campus, DraftPerson, PointContent, PointKind, Salutation };
