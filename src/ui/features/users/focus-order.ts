const SECTIONS = ['request', 'role', 'account'] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * Where focus goes after `sent` was written, in order of preference: the
 * section's own heading, else the next section's, else the page title. The host
 * takes the first one that is still on the page.
 */
export function focusOrder(sent: Section): readonly (Section | 'title')[] {
  return [...SECTIONS.slice(SECTIONS.indexOf(sent)), 'title'];
}
