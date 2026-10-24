import { access } from './access';
import { app, appError, home, notFound } from './app';
import { errors, fieldIssues, form, problemActions, rules } from './forms';
import { gallery } from './gallery';
import { nav } from './nav';
import { privacy } from './privacy';
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
  privacy,
  errors,
  status,
  problemActions,
  rules,
  fieldIssues,
  form,
} as const;

/** A page's `<title>`: the page name, then the app's. */
export function pageTitle(title: string): string {
  return `${title} – ${app.name}`;
}
