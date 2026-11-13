import { missingForSubmit, type BulletSpec, type PointKind, type Readiness } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { points } from '@/ui/copy';
import { fieldId, type FormSpec } from '@/ui/form';

import { EDITOR_FORM_ID } from './editor-form';
import { pointContentOf, type PointContentWire } from './fields';

/** One line of the list: the control it leads to (null where the path names none) and its text. */
export interface ReadinessItem {
  readonly id: string | null;
  readonly text: string;
}

export interface ReadinessItems {
  readonly problems: readonly ReadinessItem[];
  readonly warnings: readonly ReadinessItem[];
}

const PREFIX = 'content.';
/** A person of a people row is reached through the row's one control. */
const PERSON = /^(bullets\.\d+\.people)\.\d+\.\w+$/;

/** What the submit would ask for, as the server asks it: on the content as typed so far. */
export function readinessOf(
  kind: PointKind,
  content: PointContentWire,
  spec: readonly BulletSpec[],
  today: CalDate,
): Readiness {
  return missingForSubmit(kind, pointContentOf(content), spec, today);
}

/** The name of the editor control a readiness path leads to, or null where the form has none (a removed row, the statements as a whole). */
export function readinessTarget(path: string, form: FormSpec): string | null {
  if (!path.startsWith(PREFIX)) return null;
  const name = path.slice(PREFIX.length);
  const control = PERSON.exec(name)?.[1] ?? name;
  return Object.hasOwn(form, control) ? control : null;
}

/** The problems and warnings in the words of the copy, each linked to its control. */
export function readinessItems(readiness: Readiness, form: FormSpec): ReadinessItems {
  const link = (path: string) => {
    const name = readinessTarget(path, form);
    return name === null ? null : fieldId(EDITOR_FORM_ID, name);
  };
  return {
    problems: readiness.problems.map(({ code, path, params }) => ({
      id: link(path),
      text: points.readiness.problem(code, params),
    })),
    warnings: readiness.warnings.map(({ code, path, params }) => ({
      id: link(path),
      text: points.readiness.warning(code, params),
    })),
  };
}
