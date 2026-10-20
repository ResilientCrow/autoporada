import { describe, expect, it } from 'vitest';

import { cspMarkupProblems } from './markup';

describe('cspMarkupProblems', () => {
  it.each([
    ['<p class="a">text</p>', []],
    ['<a href="/x?style=1">x</a>', []],
    ['<p style="color:red">x</p>', ['style attribute']],
    ['<style>a{}</style>', ['style element']],
    ['<script>1</script>', ['script element']],
    ['<button onclick="x()">x</button>', ['event handler attribute']],
    ['<a href="javascript:void(0)">x</a>', ['javascript: URL']],
    ['<img src="data:image/png;base64,AA">', ['data: URL']],
  ])('%s -> %j', (html, expected) => {
    expect(cspMarkupProblems(html)).toEqual(expected);
  });
});
