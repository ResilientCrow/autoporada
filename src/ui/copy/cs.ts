import { app, appError, home, notFound } from './app';
import { errors, fieldIssues, rules } from './forms';
import { gallery } from './gallery';
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
  gallery,
  errors,
  rules,
  fieldIssues,
} as const;
