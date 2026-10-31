import { access } from './access';
import { app, appError, home, notFound } from './app';
import { autosave } from './autosave';
import { errors, fieldIssues, form, problemActions, rules, stepUpNotice } from './forms';
import { future } from './future';
import { gallery } from './gallery';
import { issues } from './issues';
import { nav } from './nav';
import { people } from './people';
import { pointTypes } from './pointTypes';
import { points } from './points';
import { profile } from './profile';
import { registry } from './registry';
import { privacy } from './privacy';
import { review } from './review';
import { settings } from './settings';
import { shell } from './shell';
import { signIn } from './sign-in';
import { status } from './status';
import { users } from './users';

/**
 * Czech UI copy. Every user-facing string lives in this directory, one file per
 * area, so wording can be reviewed in one place (formal "vy", Czech typography).
 */
export const cs = {
  app,
  signIn,
  notFound,
  appError,
  home,
  access,
  users,
  shell,
  nav,
  gallery,
  issues,
  points,
  profile,
  future,
  pointTypes,
  settings,
  registry,
  review,
  autosave,
  people,
  privacy,
  errors,
  status,
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
