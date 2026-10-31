import { cooldownEnd } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';
import type { TemplateName, TemplateViews } from '@/notify';

import type { MailSubjects } from './subjects';

const none = () => ({});

/** What each template says about its subject; pure. The variables are one day: when a rejected requester may ask again, the meeting a reminder is for, or the counts of a digest. */
const VIEWS: {
  readonly [T in TemplateName]: (subject: MailSubjects[T]) => TemplateViews[T];
} = {
  'access.approved': none,
  'access.rejected': (request) => ({
    retryFrom: instantToWallClock(cooldownEnd(request.decidedAt ?? request.createdAt)).date,
  }),
  'access.blocked': none,
  'access.granted': none,
  'mail.check': none,
  'point.returned': none,
  'point.approved': none,
  'point.rejected': none,
  'report.prompt': none,
  'reminder.soft': ({ monday }) => ({ meetingDate: monday }),
  'reminder.hard': ({ monday }) => ({ meetingDate: monday }),
  'reviewer.digest': (counts) => counts,
  'headmaster.summary': ({ monday, ...counts }) => ({ meetingDate: monday, ...counts }),
};

/** The template's variables, read from its subject. */
export function viewOf<T extends TemplateName>(
  template: T,
  subject: MailSubjects[T],
): TemplateViews[T] {
  const view: (subject: MailSubjects[T]) => TemplateViews[T] = VIEWS[template];
  return view(subject);
}
