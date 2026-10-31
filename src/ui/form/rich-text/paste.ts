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
const BOLD = /font-weight:\s*(?:bold|[6-9]00)/i;
const ITALIC = /font-style:\s*italic/i;

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
 * comments (Word's `mso` conditionals) and every attribute go; bold and italic given by a style
 * become `<strong>` and `<em>`; Word's `mso-list:… levelN` and the depth of a list become
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
