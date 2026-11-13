'use client';

import type { RecentPerson } from '@/domain/people';
import type { CalDate } from '@/domain/time';
import type { Directory } from '@/ui/form';
import { Notice } from '@/ui/kit';

import { Bullets } from './Bullets';
import { OpeningSentence } from './OpeningSentence';
import { BodyField, ReportFields } from './ReportFields';
import { Statements } from './Statements';
import type { ReportEdit } from './use-report-edit';

const NO_MESSAGES: Readonly<Record<string, string>> = {};

/**
 * A report's fields in page order (design sections 6 and 7), as `useReportEdit` holds them: the
 * facts, the bullets, the opening sentence, the body and the statements, each refused save's
 * message under its field and the content-wide one after them. The owner wraps them in its form
 * and decides when they save.
 */
export function ReportForm({
  edit,
  readOnly,
  today,
  recents,
  directory,
  onBlur,
}: {
  readonly edit: ReportEdit;
  readonly readOnly: boolean;
  /** The day the people's classes are worked out for. */
  readonly today: CalDate;
  /** The people the editing user named lately, to offer first. */
  readonly recents: readonly RecentPerson[];
  /** Whether the school directory is searched at all (`DIRECTORY=off` is `off`). */
  readonly directory: Directory;
  /** Leaving a field: the autosave saves at once; an explicit save ignores it. */
  readonly onBlur: () => void;
}) {
  const { content, shown } = edit;
  const issues = shown?.messages ?? NO_MESSAGES;
  return (
    <>
      <ReportFields
        content={content}
        issues={issues}
        today={today}
        readOnly={readOnly}
        onChange={edit.change}
        onBlur={onBlur}
      />
      <Bullets
        bullets={edit.bullets}
        spec={edit.spec}
        issues={issues}
        readOnly={readOnly}
        today={today}
        recents={recents}
        directory={directory}
        onChange={edit.changeBullets}
        onBlur={onBlur}
      />
      <OpeningSentence
        text={content.opening}
        stale={edit.stale}
        asking={edit.asking}
        issue={issues['opening']}
        readOnly={readOnly}
        onType={edit.typeOpening}
        onAsk={edit.askOpening}
        onReplace={edit.replaceOpening}
        onKeep={edit.keepOpening}
        onBlur={onBlur}
      />
      <BodyField
        text={edit.bodyInput}
        issue={issues['body']}
        readOnly={readOnly}
        onChange={edit.changeBody}
        onBlur={onBlur}
      />
      <Statements
        bullets={content.bullets}
        statements={content.statements}
        issues={issues}
        readOnly={readOnly}
        today={today}
        recents={recents}
        directory={directory}
        onChange={edit.changeStatements}
        onBlur={onBlur}
      />
      {shown?.notice ? <Notice tone="problem">{shown.notice}</Notice> : null}
    </>
  );
}
