import { z } from 'zod';

/** Output names that suggest a credential: DTOs never carry one. */
const SECRET_NAME = /token|hash|secret|verifier|nonce|cookie/i;

type Node = Readonly<Record<string, unknown>>;

function walk(node: unknown, path: string, visit: (node: Node, path: string) => void): void {
  if (!node || typeof node !== 'object') return;
  const object = node as Node;
  visit(object, path);
  for (const [key, child] of Object.entries(object)) {
    if (Array.isArray(child)) child.forEach((item, i) => walk(item, `${path}.${key}[${i}]`, visit));
    else walk(child, `${path}.${key}`, visit);
  }
}

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

/** Output schemas never name a credential. */
export function outputProblems(schema: z.ZodType): string[] {
  const problems: string[] = [];
  walk(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }), '$', (node, path) => {
    const properties = node['properties'];
    if (!properties || typeof properties !== 'object') return;
    for (const name of Object.keys(properties)) {
      if (SECRET_NAME.test(name)) problems.push(`${path}.${name}: looks like a credential`);
    }
  });
  return problems;
}
