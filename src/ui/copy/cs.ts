import { app, appError, home, notFound } from './app';
import { errors, fieldIssues, form, rules } from './forms';
import { gallery } from './gallery';
import { nav } from './nav';
import { shell } from './shell';
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
  home,
  shell,
  nav,
  gallery,
  errors,
  rules,
  fieldIssues,
  form,
} as const;

/** A page's `<title>`: the page name, then the app's. */
export function pageTitle(title: string): string {
  return `${title} – ${app.name}`;
}
