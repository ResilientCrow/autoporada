import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Audit meta carries codes, never text people wrote (ADR 0015, design section 10): no key that
 * names such a value may appear in a meta object written in src/application.
 *
 * The scan reads object literals: one given to a property `meta`, or passed as the `meta`
 * parameter of a helper (a `function`, or an arrow or function expression bound to a const). It
 * does not follow a value through a variable: `const meta = { title }; record({ meta })` passes
 * unseen, so write meta in place.
 */
const FORBIDDEN = new Set([
  'title',
  'note',
  'text',
  'quote',
  'name',
  'body',
  'before',
  'organizer',
  'participants',
  'paragraph',
  'original',
  'confirmedOriginal',
  'place',
]);

/**
 * The same rule for a diff: in an `AuditShape` (the rule per field of a record) a field that
 * holds text a person wrote must be `'omit'`; the event may say that it changed (in meta), never
 * what it says. The scan reads the object literal given to a const typed `AuditShape<…>`.
 */
const TEXT_FIELDS = new Set([
  'title',
  'note',
  'text',
  'quote',
  'name',
  'body',
  'reason',
  'content',
  'label',
  'displayName',
  'email',
  'jobTitle',
  'department',
  'defaultBullets',
  'organizer',
  'participants',
  'paragraph',
  'original',
  'confirmedOriginal',
  'place',
]);

const ROOT = join(__dirname, '..', '..');
const APPLICATION = join(ROOT, 'src', 'application');

interface Source {
  readonly file: string;
  readonly text: string;
}

const parse = ({ file, text }: Source) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function visit(node: ts.Node, each: (node: ts.Node) => void): void {
  each(node);
  ts.forEachChild(node, (child) => visit(child, each));
}

/** A named function: `function name(…)`, or an arrow or function expression bound to a const. */
function namedFunction(node: ts.Node): { name: string; fn: ts.SignatureDeclarationBase } | null {
  if (ts.isFunctionDeclaration(node) && node.name) return { name: node.name.text, fn: node };
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return { name: node.name.text, fn: node.initializer };
  }
  return null;
}

/** Functions taking a parameter named `meta`, by name: the index of that parameter. */
function metaParameters(sources: readonly ts.SourceFile[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const source of sources) {
    visit(source, (node) => {
      const named = namedFunction(node);
      if (!named) return;
      const index = named.fn.parameters.findIndex(
        (p) => ts.isIdentifier(p.name) && p.name.text === 'meta',
      );
      if (index >= 0) found.set(named.name, index);
    });
  }
  return found;
}

/** Every key of an object literal, nested ones too; a spread or a computed key is a problem itself. */
function keysOf(literal: ts.ObjectLiteralExpression, source: ts.SourceFile): string[] {
  const keys: string[] = [];
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property) || !property.name) {
      keys.push(`(spread ${property.getText(source)})`);
      continue;
    }
    if (ts.isComputedPropertyName(property.name)) {
      keys.push(`(computed ${property.name.getText(source)})`);
      continue;
    }
    keys.push(property.name.getText(source).replace(/^['"]|['"]$/g, ''));
    if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
      keys.push(...keysOf(property.initializer, source));
    }
  }
  return keys;
}

/**
 * The meta keys written in `files` that a person's text could stand behind: in an object literal
 * given to a property `meta`, or passed as the `meta` parameter of a helper that builds the event.
 */
function forbiddenMetaKeys(files: readonly Source[]): string[] {
  const sources = files.map(parse);
  const helpers = metaParameters(sources);
  const problems: string[] = [];
  for (const source of sources) {
    const report = (literal: ts.ObjectLiteralExpression) => {
      for (const key of keysOf(literal, source)) {
        if (FORBIDDEN.has(key) || key.startsWith('(')) {
          const { line } = source.getLineAndCharacterOfPosition(literal.getStart(source));
          problems.push(`${source.fileName}:${line + 1}: meta key ${key}`);
        }
      }
    };
    visit(source, (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === 'meta' &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        report(node.initializer);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const index = helpers.get(node.expression.text);
        const argument = index === undefined ? undefined : node.arguments[index];
        if (argument && ts.isObjectLiteralExpression(argument)) report(argument);
      }
    });
  }
  return problems;
}

/** The text fields of every `AuditShape` literal in `files` whose rule is not `'omit'`. */
function shapeTextFields(files: readonly Source[]): string[] {
  const problems: string[] = [];
  for (const source of files.map(parse)) {
    visit(source, (node) => {
      if (
        !ts.isVariableDeclaration(node) ||
        !node.type ||
        !ts.isTypeReferenceNode(node.type) ||
        node.type.typeName.getText(source) !== 'AuditShape' ||
        !node.initializer ||
        !ts.isObjectLiteralExpression(node.initializer)
      ) {
        return;
      }
      for (const property of node.initializer.properties) {
        const name = property.name?.getText(source).replace(/^['"]|['"]$/g, '');
        const omitted =
          ts.isPropertyAssignment(property) &&
          ts.isStringLiteral(property.initializer) &&
          property.initializer.text === 'omit';
        if (name !== undefined && TEXT_FIELDS.has(name) && !omitted) {
          const { line } = source.getLineAndCharacterOfPosition(property.getStart(source));
          problems.push(`${source.fileName}:${line + 1}: audit shape field ${name}`);
        }
      }
    });
  }
  return problems;
}

function applicationSources(dir: string): Source[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return applicationSources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [{ file: relative(ROOT, path), text: readFileSync(path, 'utf8') }];
  });
}

describe('audit meta in src/application', () => {
  it('names no value a person wrote', () => {
    const sources = applicationSources(APPLICATION);
    expect(sources.length).toBeGreaterThan(50);
    expect(forbiddenMetaKeys(sources)).toEqual([]);
  });
});

describe('audit shapes in src/application', () => {
  it('show no text a person wrote', () => {
    expect(shapeTextFields(applicationSources(APPLICATION))).toEqual([]);
  });
});

describe('the audit shape scan itself', () => {
  const file = (text: string) => [{ file: 'x.ts', text }];

  it('passes a shape that omits its text fields and shows the rest', () => {
    const text = `const S: AuditShape<R> = { id: 'omit', name: 'omit', 'label': 'omit', role: 'value' };`;
    expect(shapeTextFields(file(text))).toEqual([]);
  });

  it("reports a text field shown as its value or through a function (a point type's name and bullets)", () => {
    const text = [
      'export const S: AuditShape<R> = {',
      "  name: 'value',",
      '  defaultBullets: (bullets) => bullets.map((b) => ({ ...b })),',
      "  active: 'value',",
      '};',
    ].join('\n');
    expect(shapeTextFields(file(text))).toEqual([
      'x.ts:2: audit shape field name',
      'x.ts:3: audit shape field defaultBullets',
    ]);
  });

  it('ignores an object that is not typed as a shape', () => {
    expect(shapeTextFields(file(`const S = { name: 'value' };`))).toEqual([]);
  });
});

describe('the audit meta scan itself', () => {
  const file = (text: string) => [{ file: 'x.ts', text }];

  it('passes codes, ids and field names', () => {
    expect(
      forbiddenMetaKeys(file(`record({ meta: { fields: edited, kind: 'report', reason } });`)),
    ).toEqual([]);
  });

  it.each([...FORBIDDEN])('reports a meta key %s, written out or shorthand', (key) => {
    expect(forbiddenMetaKeys(file(`record({ meta: { kind, ${key}: x } });`))).toEqual([
      `x.ts:1: meta key ${key}`,
    ]);
    expect(forbiddenMetaKeys(file(`record({ meta: { ${key} } });`))).toEqual([
      `x.ts:1: meta key ${key}`,
    ]);
  });

  it('reports a quoted key, a nested one, a spread and a computed one', () => {
    const text = `record({ meta: { 'note': a, edit: { quote: b }, ...rest, [k]: c } });`;
    expect(forbiddenMetaKeys(file(text))).toEqual([
      'x.ts:1: meta key note',
      'x.ts:1: meta key quote',
      'x.ts:1: meta key (spread ...rest)',
      'x.ts:1: meta key (computed [k])',
    ]);
  });

  it('follows meta given to a helper that builds the event, in another file', () => {
    const helper = {
      file: 'events.ts',
      text: 'export function rejected(id: string, meta: Meta) { return { meta }; }',
    };
    const caller = { file: 'use.ts', text: `record(rejected(id, { reason, title }));` };
    expect(forbiddenMetaKeys([helper, caller])).toEqual(['use.ts:1: meta key title']);
  });

  it.each([
    ['an arrow function', 'export const rejected = (id: string, meta: Meta) => ({ meta });'],
    [
      'a const-bound function',
      'export const rejected = function (id: string, meta: Meta) { return { meta }; };',
    ],
  ])('follows a helper written as %s', (_how, text) => {
    const caller = { file: 'use.ts', text: `record(rejected(id, { reason, title }));` };
    expect(forbiddenMetaKeys([{ file: 'events.ts', text }, caller])).toEqual([
      'use.ts:1: meta key title',
    ]);
  });
});
