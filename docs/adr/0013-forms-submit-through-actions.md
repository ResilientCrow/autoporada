# 0013 — Forms submit through actions

## Context

ADR 0012 §8 fixed the principles of forms and left open how a form calls a
server action and maps the result. M6 builds the first real forms (an access
request, a decision on a request, a change of role). This record completes
§8 without editing it. It changes no fence and no React Aria subpath.

Constraints:

- **Actions take plain objects** (ADR 0011), so a form cannot be a native
  POST. A function `<form action>` is still refused (ADR 0012 §8).
- **Every outcome has a code.** An action answers `ok` or a typed error, and
  a rejected promise is a failure the server never saw.
- **WCAG 2.2 AA, Czech, mobile first.** Focus, announcements and the page
  title must follow a submit without surprises.
- **The nonce CSP.** No inline styles, scripts or handlers in server HTML.

## Decision

1. **`useActionForm` lives in the component that owns the form.**
   - It takes the action, a `toInput` that maps `FormData` to the input, and
     an `onSuccess` callback.
   - It returns the form state: issues, problem, an attempt counter and the
     value of the pressed button. `Form` receives that state; it has no
     `action` prop.
   - The host above the forms owns `LiveStatus` and the focus targets, so
     both outlive any form that unmounts after success. Success effects reach
     the host through `onSuccess`.
   - Forms are keyed by the version of what they edit, so a refreshed payload
     resets them.
2. **Every result is settled into one of three cases.** `settle` turns an
   action result, or a rejected promise (`network`), into `ok`, `issues` or
   `problem`. It switches over every error code with no default, and the
   code list is checked for exhaustiveness at type level and in a test.
3. **`FormProblem` says what to do, per code.**
   - It shows once at the top of the form, never together with the error
     summary, and takes focus after a failed submit.
   - `conflict` and `not-found` keep the problem in the form with a link
     „Načíst aktuální stav“, so nothing typed is lost before the user decides.
   - `unauthenticated` and `step-up-required` show a sign-in link that opens
     in a new tab, with that warning in its text and a hint to come back and
     submit again. The step-up callback replaces the shared session, so the
     first tab then works. The proactive step-up link, shown before any
     typing, opens in the same tab.
   - `rate-limited` names the wait; `unavailable` shows the request id.
4. **`refresh()` runs after a successful write only.** `defineAction` calls
   it when a write use case returns `ok`. Reads, failures and exceptions do
   not refresh: a refresh would reset the form that is showing the problem.
5. **A submit needs JavaScript.**
   - The submit button is disabled in the server HTML until the page has
     hydrated, which also stops implicit Enter submission without scripts.
   - `NoScriptNotice` says so once per host.
   - A second press while a submit is in flight is ignored. The pressed
     button stays enabled and shows its pending state, so it keeps focus.
     Every other button is disabled.
   - A stray native POST to a page renders it and has no effect.
6. **The title prefix „Chyba:“ shows only while the form has field issues.**
   Problems do not set it, and it is restored on success and on unmount.
7. **Focus and announcements after success.**
   - Each section of a host has a heading with `tabIndex={-1}`.
   - After success focus moves to the heading of the section that was sent;
     if it is gone, to the next section, otherwise to the page heading.
   - A repeated message is announced again: `LiveStatus` is always mounted
     and renders a new node for each message.
8. **Native controls for choices.**
   - `SelectField` and `CheckboxField` are native elements in `ui/form`, with
     the label, description and error wired like `TextField`. They need no
     React Aria import, so the audited list of ADR 0012 §5 stays as it is.
   - There are no radios and no placeholder option: a select always has a
     value, and the current value is its default.
   - A checkbox row is at least 44 px high.
9. **Search is a native GET form.** `SearchForm` works without JavaScript,
   because a search changes nothing.
10. **Destructive actions have no dialog.**
    - They sit in a visually separated section with a confirmation checkbox.
    - The server checks the confirmation itself; the checkbox only sets
      `confirmed: true` in the input.
    - Typed confirmation is kept for irreversible bulk actions.
11. **`ui/status` is created.** It holds the maps from domain status to tone
    and label, and one `Chip`. Features never map a status themselves
    (ADR 0012 §4). `ui/status` was already reserved, so no fence changes.

## Consequences

- A new form needs one `toInput`, one `FormSpec` and one host for its
  announcements; the error handling comes with `Form`.
- Adding an error code to `contracts/` fails the build until `settle` and
  the copy table handle it.
- Pressing a submit before hydration does nothing. On a very slow connection
  the button is visibly disabled for a moment.
- A reactive sign-in costs the user a second tab, and the page asks them to
  submit again. The text they typed stays in the first tab.
- Forms keyed by version lose unsaved edits when the data under them changes.
  That is deliberate: they would otherwise submit a stale version.
- `/vzornik` shows every problem and every control state, so axe, the
  screenshot, reflow and focus checks cover the copy without a real screen
  producing each error.
