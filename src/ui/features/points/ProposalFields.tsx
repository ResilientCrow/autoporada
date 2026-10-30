'use client';

import { POINT_LIMITS } from '@/domain/report';
import { TextField } from '@/ui/form';
import { Notice } from '@/ui/kit';

import { BodyField } from './ReportFields';
import { patchFor } from './report-patch';
import type { ReportEdit } from './use-report-edit';

const NO_MESSAGES: Readonly<Record<string, string>> = {};

/**
 * A finance or pokyn proposal's fields (design section 11): the title and „Text návrhu“, as
 * `useReportEdit` holds them, each refused save's message under its field. The owner wraps them in
 * its form and decides when they save; the bullets, the opening sentence and the statements of a
 * report have no place here, and the edit hook leaves them empty.
 */
export function ProposalFields({
  edit,
  readOnly,
  onBlur,
}: {
  readonly edit: Pick<ReportEdit, 'content' | 'bodyInput' | 'shown' | 'change' | 'changeBody'>;
  readonly readOnly: boolean;
  /** Leaving a field: the autosave saves at once. */
  readonly onBlur: () => void;
}) {
  const { content, shown } = edit;
  const issues = shown?.messages ?? NO_MESSAGES;
  return (
    <>
      <TextField
        name="title"
        value={content.title}
        maxLength={POINT_LIMITS.title}
        autoComplete="off"
        onChange={(value) => edit.change(patchFor('title', value, content))}
        issue={issues['title']}
        readOnly={readOnly}
        onBlur={onBlur}
      />
      <BodyField
        text={edit.bodyInput}
        issue={issues['body']}
        readOnly={readOnly}
        onChange={edit.changeBody}
        onBlur={onBlur}
      />
      {shown?.notice ? <Notice tone="problem">{shown.notice}</Notice> : null}
    </>
  );
}
