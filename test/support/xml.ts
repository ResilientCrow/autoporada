/**
 * Pretty-prints OOXML and static HTML so golden diffs are readable: one
 * element per line, indented by depth. Text content — including runs that are
 * only spaces or no-break spaces — is kept byte for byte. The inputs carry no
 * formatting whitespace of their own, so nothing between tags is dropped.
 */
export function prettyXml(xml: string): string {
  const tokens = xml.split(/(?=<)|(?<=>)/).filter((t) => t !== '');
  let depth = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    const isTag = token.startsWith('<');
    const isClosing = token.startsWith('</');
    if (!isTag) {
      // Text joins the line of the element that holds it: <w:t>text</w:t>.
      lines[lines.length - 1] = `${lines[lines.length - 1] ?? ''}${token}`;
      continue;
    }
    if (isClosing) depth = Math.max(0, depth - 1);
    const previous = lines[lines.length - 1] ?? '';
    if (isClosing && /<[^/!?][^>]*>[^<]*$/.test(previous) && !previous.trimEnd().endsWith('/>')) {
      // Close a text element on the same line it opened.
      lines[lines.length - 1] = previous + token;
      continue;
    }
    lines.push(`${'  '.repeat(depth)}${token}`);
    if (!isClosing && !token.endsWith('/>') && !token.startsWith('<?') && !token.startsWith('<!'))
      depth++;
  }
  return `${lines.join('\n')}\n`;
}
