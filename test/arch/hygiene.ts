import { z } from 'zod';

/** Output names that suggest a credential: DTOs never carry one. */
const SECRET_NAME = /token|hash|secret|verifier|nonce|cookie/i;

/** Keys whose values are data (a default, an example), not schemas. */
const VALUES = new Set(['default', 'examples', 'const', 'enum']);
/** Keys whose values map names to schemas. */
const MAPS = new Set(['properties', '$defs']);
/** Keys that describe a schema without constraining it. */
const ANNOTATIONS = new Set([
  '$schema',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

type Node = Readonly<Record<string, unknown>>;

/** Visits every schema in a JSON Schema, by structure: never a default value or a name map. */
function walk(node: unknown, path: string, visit: (node: Node, path: string) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, visit));
    return;
  }
  const schema = node as Node;
  visit(schema, path);
  for (const [key, child] of Object.entries(schema)) {
    if (VALUES.has(key)) continue;
    if (MAPS.has(key) && child && typeof child === 'object') {
      for (const [name, sub] of Object.entries(child)) walk(sub, `${path}.${key}.${name}`, visit);
    } else {
      walk(child, `${path}.${key}`, visit);
    }
  }
}

/** z.unknown(), z.any() or z.custom(), with or without a description or default. */
const acceptsAnything = (node: Node) => Object.keys(node).every((key) => ANNOTATIONS.has(key));

/**
 * An input schema accepts only what it names, and only so much of it:
 * every object strict, every string and array bounded (ADR 0011). Zod's
 * types cannot tell strict objects apart, so this reads the JSON Schema.
 */
export function inputProblems(schema: z.ZodType): string[] {
  const problems: string[] = [];
  walk(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }), '$', (node, path) => {
    if (node['type'] === 'object' && node['additionalProperties'] !== false) {
      problems.push(`${path}: object accepts unknown keys`);
    }
    if (acceptsAnything(node)) problems.push(`${path}: accepts anything`);
    const bounded =
      node['maxLength'] !== undefined ||
      node['enum'] !== undefined ||
      node['const'] !== undefined ||
      node['format'] === 'uuid';
    if (node['type'] === 'string' && !bounded) problems.push(`${path}: string without maxLength`);
    if (node['type'] === 'array' && node['maxItems'] === undefined) {
      problems.push(`${path}: array without maxItems`);
    }
  });
  return problems;
}

/**
 * The one closed exception to the credential rule: system use cases that hand
 * protocol state to the sign-in code on the server. defineAction refuses
 * system use cases, so these values never reach a client.
 */
export const PROTOCOL_OUTPUTS: Readonly<Record<string, readonly string[]>> = {};

/** Outputs return only what they name (z.object strips the rest), never a credential. */
export function outputProblems(schema: z.ZodType, allowed: readonly string[] = []): string[] {
  const problems: string[] = [];
  walk(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }), '$', (node, path) => {
    if (node['type'] === 'object' && node['additionalProperties'] !== false) {
      problems.push(`${path}: object passes unnamed keys through`);
    }
    if (acceptsAnything(node)) problems.push(`${path}: returns anything`);
    const properties = node['properties'];
    if (!properties || typeof properties !== 'object') return;
    for (const name of Object.keys(properties)) {
      if (SECRET_NAME.test(name) && !allowed.includes(name)) {
        problems.push(`${path}.${name}: looks like a credential`);
      }
    }
  });
  return problems;
}
