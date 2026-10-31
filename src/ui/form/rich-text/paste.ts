const STYLE_BLOCK = /<style\b[\s\S]*?<\/style\s*>/gi;
const TAG = /<[a-z][^>]*>/gi;
const STYLE_ATTRIBUTE = /(\s)style(\s*=)/gi;

/**
 * The page's CSP (no `'unsafe-inline'`) reports every `<style>` block and `style=` attribute the HTML
 * parser meets, even in an inert document: Word's clipboard has dozens. The blocks go before parsing
 * and the attributes are renamed to `data-style`, which the cleaner below reads as it read `style`.
 */
function defang(html: string): string {
  return html
    .replace(STYLE_BLOCK, '')
    .replace(TAG, (tag) => tag.replace(STYLE_ATTRIBUTE, '$1data-style$2'));
}

/** Elements that never reach the editor: styles, scripts, images and the like. */
const DROPPED = 'style, script, img, picture, svg, meta, link, title, object, iframe, head';
const MSO_LEVEL = /mso-list:[^;"]*\blevel(\d+)/i;
// Anchored to a declaration's start, so Word's `mso-bidi-font-weight` and `mso-bidi-font-style` don't count.
const BOLD = /(?:^|;)\s*font-weight:\s*(?:bold|[6-9]00)\b/i;
const ITALIC = /(?:^|;)\s*font-style:\s*italic\b/i;
const NOT_BOLD = /(?:^|;)\s*font-weight:\s*(?:normal|[1-4]00)\b/i;
const NOT_ITALIC = /(?:^|;)\s*font-style:\s*normal\b/i;

/** A bold or italic tag whose own style undoes it: Google Docs wraps a whole paste in `<b style="font-weight:normal">`. */
function undone(element: Element): boolean {
  const style = element.getAttribute('data-style') ?? '';
  const bold = element.tagName === 'B' || element.tagName === 'STRONG';
  return (bold ? NOT_BOLD : NOT_ITALIC).test(style);
}

function wrapChildren(element: Element, tag: 'strong' | 'em') {
  const wrapper = element.ownerDocument.createElement(tag);
  wrapper.append(...element.childNodes);
  element.append(wrapper);
}

/** How many lists an element sits in: the level of a list item. */
function listDepth(element: Element): number {
  let depth = 0;
  for (let up = element.parentElement; up; up = up.parentElement) {
    if (up.tagName === 'UL' || up.tagName === 'OL') depth += 1;
  }
  return depth;
}

/**
 * Pasted HTML, cleaned before ProseMirror parses it (ADR 0031, item 6). The input is parsed by
 * `DOMParser` into an inert document: nothing runs and no image loads (`defang` runs first, so the
 * CSP sees no style). Styles, scripts, images,
 * comments (Word's `mso` conditionals) and every attribute go; a bold or italic tag its own style
 * undoes is unwrapped, and bold and italic given by a style become `<strong>` and `<em>`; Word's `mso-list:… levelN` and the depth of a list become
 * `data-indent` (at most `maxIndent`). What is left is paragraphs with bold and italic.
 */
export function cleanPastedHtml(html: string, maxIndent: number): string {
  const doc = new DOMParser().parseFromString(defang(html), 'text/html');
  const comments = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
  const found: Node[] = [];
  while (comments.nextNode()) found.push(comments.currentNode);
  for (const comment of found) comment.parentNode?.removeChild(comment);
  for (const element of doc.querySelectorAll(DROPPED)) element.remove();
  // Word's list bullet or number, written as text in a span it marks to be ignored.
  for (const element of doc.querySelectorAll('[data-style*="mso-list:Ignore" i]')) element.remove();
  for (const element of doc.body.querySelectorAll('b, strong, i, em')) {
    if (undone(element)) element.replaceWith(...element.childNodes);
  }

  for (const element of doc.body.querySelectorAll('*')) {
    const style = element.getAttribute('data-style') ?? '';
    if (BOLD.test(style)) wrapChildren(element, 'strong');
    if (ITALIC.test(style)) wrapChildren(element, 'em');
    const level = MSO_LEVEL.exec(style)?.[1];
    if (level !== undefined) element.setAttribute('data-indent', level);
    else if (element.tagName === 'LI')
      element.setAttribute('data-indent', String(listDepth(element)));
  }
  for (const item of doc.body.querySelectorAll('li')) {
    const paragraph = doc.createElement('p');
    paragraph.setAttribute('data-indent', item.getAttribute('data-indent') ?? '1');
    paragraph.append(...item.childNodes);
    item.replaceWith(paragraph);
  }
  for (const element of doc.body.querySelectorAll('*')) {
    const indent = element.getAttribute('data-indent');
    for (const name of element.getAttributeNames()) element.removeAttribute(name);
    if (indent !== null && element.tagName === 'P') {
      const level = Math.min(Number.parseInt(indent, 10) || 0, maxIndent, 3);
      element.setAttribute('data-indent', String(level));
    }
  }
  return doc.body.innerHTML;
}
