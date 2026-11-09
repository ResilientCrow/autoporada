/**
 * Branch arch-ui only: the whole state the Arch UI renders, read for one signed-in user.
 * Visibility follows the policy: the same scope SQL the repos use for points and future
 * items, staff-only parts (registry, outline, archive) behind `can`. Writes never pass
 * here: they go through the use cases (`run.ts`).
 */
import type { UseCase } from '@/application/core';
import type { UserPrincipal } from '@/application/ports';
import { readIssueTexts, readOutline, readOutlineItem } from '@/application/use-cases';
import { SETTINGS } from '@/contracts';
import { issueSlots, workingSlot, type IssueRow } from '@/domain/calendar';
import { can } from '@/domain/policy';
import { instantToWallClock, parseIsoDate, parseWallTime, toIsoDate } from '@/domain/time';
import { composeDocument } from '@/document/compose';
import { parseIssueSnapshot } from '@/snapshot';

import type { WebContainer } from '../container';
import { runRegistered } from '../pipeline';
import { archItems } from './arch-items';
import { peopleFor } from './arch-people';

type Json = Record<string, unknown>;

async function call<In, Out>(
  c: WebContainer,
  principal: UserPrincipal,
  useCase: UseCase<In, Out>,
  input: In,
  requestId = 'arch.state',
): Promise<Out | null> {
  const r = await runRegistered(c, useCase, { principal, requestId, input });
  return r.ok ? r.value : null;
}

/** Arch's `State` for this viewer; `vers` holds the versions the writes must send back. */
export async function archState(
  c: WebContainer,
  principal: UserPrincipal,
  requestId: string,
): Promise<Json> {
  const db = c.arch;
  const actor = principal.actor;
  const ctx = { principal, now: c.app.clock.now(), requestId };
  const staff = can(actor, { action: 'issue.preview' });
  const head = can(actor, { action: 'issue.edit' });
  const now = c.app.clock.now();
  const today = instantToWallClock(now).date;
  const vers: Record<string, number> = {};

  // ---- settings ----
  const stored = new Map(
    (await db.settings()).map((r) => [r.key, { value: r.value, version: r.version }]),
  );
  const setting = <K extends keyof typeof SETTINGS>(k: K) => {
    const row = stored.get(k);
    vers[`settings:${k}`] = row?.version ?? 0;
    const parsed = row ? SETTINGS[k].schema.safeParse(row.value) : null;
    return (parsed?.success ? parsed.data : SETTINGS[k].default) as (typeof SETTINGS)[K]['default'];
  };
  const deadline = setting('deadline');
  const reminders = setting('reminders');
  const annex1 = setting('texts.annex1');
  const rule = { dayOffset: deadline.dayOffset, time: parseWallTime(deadline.time) };

  // ---- points and future items, as the policy lets this viewer see them ----
  const pointRows = await db.points(ctx);
  const futureRows = await db.futures(ctx);
  const pIds = pointRows.map((p) => p.id);
  const fIds = futureRows.map((f) => f.id);
  const pEvents = await db.pointEvents(pIds);
  const fEvents = await db.futureEvents(fIds);
  const { archPoints, archFutures } = archItems({
    pointRows,
    futureRows,
    pEvents,
    fEvents,
    vers,
    today,
    viewerId: actor.id,
    staff,
  });

  // ---- people ----
  const userRows = await db.users(null);
  const archUsers = peopleFor({
    rows: userRows,
    actorId: actor.id,
    head,
    staff,
    named: new Set<string>([
      actor.id,
      ...pointRows.map((p) => p.authorId),
      ...futureRows.map((f) => f.authorId),
      ...(staff ? [...pEvents, ...fEvents].flatMap((e) => (e.actorId ? [e.actorId] : [])) : []),
    ]),
    vers,
  });

  // ---- types ----
  const typeRows = await db.types();
  const archTypes = typeRows.map((t) => {
    vers[t.id] = t.version;
    return {
      id: t.id,
      name: t.name,
      titleGender: t.titleGender,
      bullets: t.defaultBullets,
      locked: t.locked,
      active: t.active,
    };
  });

  // ---- issues ----
  const issueRows = await db.issues();
  const calRows: IssueRow[] = issueRows.map((i) => ({
    monday: parseIsoDate(i.monday),
    meetingDate: parseIsoDate(i.meetingDate),
    deadlineAt: i.deadlineAt,
    status: i.status,
  }));
  const slots = issueSlots(calRows, today, rule);
  const work = workingSlot(today, slots) ?? slots[0];
  const placeholderRows = staff ? await db.placeholders(fIds) : [];
  const placeholders: Record<string, string> = {};
  for (const r of placeholderRows) {
    placeholders[r.futureItemId] = r.paragraph;
    vers[`ph:${r.futureItemId}`] = r.version;
  }
  const docs = staff ? await db.documents() : [];
  const annexRows = new Map<string, unknown>(
    staff ? (await db.annexes()).map((r) => [r.monday, r.annexes]) : [],
  );
  const annexSetting = (m: string): unknown[] => {
    const v = annexRows.get(m);
    return Array.isArray(v) ? (v as unknown[]) : [];
  };

  const issueOut = async (
    monday: string,
    row: (typeof issueRows)[number] | undefined,
    slot: { meetingDate: unknown; deadlineAt: Date; status: string } | undefined,
  ) => {
    if (row) vers[`issue:${monday}`] = row.version;
    const open = (row?.status ?? 'open') === 'open';
    // Without the outline, the two generated slots still frame a preview of one's own report.
    let rows: Json[] = staff
      ? []
      : (['meetings', 'events'] as const).map((slot) => ({
          id: `slot-${slot}`,
          section: 'pokyny',
          slot,
          persistence: 'standing',
          title: slot === 'meetings' ? 'Zatím známá jednání' : 'Zatím známé akce',
          body: { type: 'doc', content: [] },
          quotes: [],
          pointId: null,
        }));
    // Texts of a porada are staff's until it is published (issue.preview).
    let present = staff ? (row?.presentText ?? '') : '';
    let guests = staff ? (row?.guestsText ?? '') : '';
    let annex2: unknown = staff ? (row?.annex2 ?? null) : null;
    if (staff && open) {
      const items = row ? await db.issueItems(row.id) : [];
      if (items.length) {
        rows = items.map((it) => ({
          id: it.lineageId,
          section: it.section,
          slot: it.slot,
          persistence: it.persistence,
          title: it.title ?? '',
          body: it.body ?? { type: 'doc', content: [] },
          quotes: it.quotes,
          pointId: it.sourcePointId,
        }));
      } else {
        const outline = await call(c, principal, readOutline, { monday });
        if (outline) {
          for (const section of ['pokyny', 'hospodareni'] as const) {
            for (const r of outline[section]) {
              const item = r.proposal
                ? null
                : await call(c, principal, readOutlineItem, { monday, lineageId: r.lineageId });
              rows.push({
                id: r.lineageId,
                section,
                slot: r.slot,
                persistence: r.persistence,
                title: r.title,
                body: item?.body ?? { type: 'doc', content: [] },
                quotes: item?.quotes ?? [],
                pointId: r.proposal?.pointId ?? null,
                ...(r.proposal?.isNew && { isNew: true }),
              });
            }
          }
        }
      }
      const texts = await call(c, principal, readIssueTexts, { monday });
      if (texts) {
        present = texts.present;
        guests = texts.guests;
        annex2 = texts.annex2.content.length ? texts.annex2 : null;
      }
    }
    const doc =
      row && docs.filter((d) => d.issueId === row.id).sort((a, b) => b.version - a.version)[0];
    let docOut: Json | undefined;
    if (doc) {
      const parsed = parseIssueSnapshot(doc.snapshot);
      const model = parsed.ok ? composeDocument(parsed.snapshot) : null;
      docOut = {
        at: doc.generatedAt.toISOString(),
        by: '',
        pdf:
          doc.pdfStatus === 'ready' ? 'ready' : doc.pdfStatus === 'failed' ? 'failed' : 'rendering',
        model,
        points: model
          ? model.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'point').length
          : 0,
        ...(doc.pdfFailure && { pdfFailure: doc.pdfFailure }),
      };
    }
    return {
      monday,
      meetingDate: row?.meetingDate ?? (slot ? toIsoDate(slot.meetingDate as never) : monday),
      deadlineAt: (row?.deadlineAt ?? slot?.deadlineAt ?? now).toISOString(),
      status: row?.status ?? slot?.status ?? 'open',
      present,
      guests,
      annex2,
      annexes: staff ? annexSetting(monday) : [],
      rows,
      placeholders,
      ...(docOut && { doc: docOut }),
    };
  };
  const archIssues: Json[] = [];
  for (const r of issueRows) archIssues.push(await issueOut(r.monday, r, undefined));
  // The working porada and the one a point handed in now goes to, when they have no row yet.
  const handIn = slots.find((x) => x.status === 'open' && x.deadlineAt.getTime() > now.getTime());
  // Earlier open ones too: the preflight sends the headmaster to close them first.
  const last =
    [work, handIn]
      .filter(Boolean)
      .map((x) => toIsoDate(x!.monday))
      .sort()
      .at(-1) ?? '';
  for (const sl of slots) {
    const m = toIsoDate(sl.monday);
    if (!sl.stored && m <= last) archIssues.push(await issueOut(m, undefined, sl));
  }
  archIssues.sort((a, b) => String(a['monday']).localeCompare(String(b['monday'])));

  // ---- registry ----
  let registry: Json[] = [];
  if (can(actor, { action: 'registry.view' })) {
    const { lists, entries } = await db.registry();
    registry = lists.map((l) => {
      vers[l.id] = l.version;
      return {
        key: l.key,
        id: l.id,
        purpose: l.purpose,
        docLabel: l.docLabel,
        name: l.title,
        archived: !l.active,
        entries: entries
          .filter((e) => e.listId === l.id)
          .map((e) => ({
            id: e.id,
            givenName: e.givenName,
            familyName: e.familyName,
            classCode: e.classCode,
            isNew: e.firstPublishedIssueId === null,
          })),
      };
    });
  }

  // ---- access requests ----
  const reqRows = await db.accessRequests(head ? null : actor.id);
  const byId = new Map(userRows.map((u) => [u.id, u]));
  const requests = reqRows.map((r) => {
    vers[r.id] = r.version;
    const u = byId.get(r.userId);
    return {
      id: r.id,
      name: u?.displayName ?? '',
      email: u?.email ?? '',
      reason: r.reason,
      at: r.createdAt.toISOString(),
      state: r.state,
      ...(r.decidedAt && { decidedAt: r.decidedAt.toISOString() }),
      userId: r.userId,
    };
  });

  return {
    v: 0,
    now: now.toISOString(),
    userId: actor.id,
    users: archUsers,
    types: archTypes,
    points: archPoints,
    futures: archFutures,
    issues: archIssues,
    registry,
    requests,
    settings: {
      dayOffset: deadline.dayOffset,
      time: deadline.time,
      remindSoft: reminders.soft,
      remindHard: reminders.hard,
      annex1Heading: annex1.heading,
      annex1Intro: annex1.intro,
    },
    mails: [],
    stepUpAt: principal.authTime.toISOString(),
    seq: Date.now(),
    audit: [],
    vers,
  };
}
