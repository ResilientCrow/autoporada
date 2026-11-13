import { app, appError, notFound } from './app';
import { autosave } from './autosave';
import { errors, fieldIssues, form, problemActions, rules, stepUpNotice } from './forms';
import { failures } from './failures';
import { future } from './future';
import { points } from './points';
import { signIn } from './sign-in';

/**
 * Czech UI copy. Every user-facing string lives in this directory, one file per
 * area, so wording can be reviewed in one place (formal "vy", Czech typography).
 */
export const cs = {
  app,
  signIn,
  notFound,
  appError,
  points,
  future,
  autosave,
  errors,
  failures,
  problemActions,
  rules,
  fieldIssues,
  form,
  stepUpNotice,
} as const;

/** A page's `<title>`: the page name, then the app's. */
export function pageTitle(title: string): string {
  return `${title} – ${app.name}`;
}
