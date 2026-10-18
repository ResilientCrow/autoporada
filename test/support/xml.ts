/**
 * Pretty-prints OOXML so golden diffs are readable: one element per line,
 * indented by depth. Text content is kept byte for byte.
 */
export function prettyXml(xml: string): string {
  const tokens = xml.replace(/>\s*</g, '><').split(/(?=<)|(?<=>)/);
  let depth = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('</')) depth = Math.max(0, depth - 1);
    const line = `${'  '.repeat(depth)}${token}`;
    if (!token.startsWith('<')) {
      // Attach text to the previous opening tag: <w:t>text</w:t> stays on one line.
      lines[lines.length - 1] += token;
      continue;
    }
    const previous = lines[lines.length - 1] ?? '';
    if (token.startsWith('</') && /<w:t[ >][^<]*$|<w:instrText[ >][^<]*$/.test(previous)) {
      lines[lines.length - 1] = previous + token;
      depth = Math.max(0, depth);
      continue;
    }
    lines.push(line);
    if (!token.startsWith('</') && !token.endsWith('/>') && !token.startsWith('<?')) depth++;
  }
  return `${lines.join('\n')}\n`;
}
