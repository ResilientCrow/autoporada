/**
 * The static half of the inventory test (ADR 0011): reads source files
 * with the TypeScript parser and reports every entry point that does not
 * have the one allowed shape. Pure: it takes a path and the text.
 */
import ts from 'typescript';

export interface ScanResult {
  readonly file: string;
  /** A file-level "use server": a server action module. */
  readonly serverFile: boolean;
  readonly findings: readonly string[];
}

export const ACTION_MODULE = /^src\/server\/actions\/(?!index\.ts$)[^/]+\.ts$/;
export const ROUTE_FILE = /^src\/app\/(?:.+\/)?route\.tsx?$/;
const METADATA_FILE =
  /^src\/app\/(?:.+\/)?(?:sitemap|robots|manifest|(?:apple-)?icon\d*|(?:opengraph|twitter)-image\d*)\.[a-z]+$/;
/** next.config serves .ts and .tsx only; anything else in src/ would escape this scan. */
const NOT_TYPESCRIPT = /\.[cm]?jsx?$/;
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
/** Every line that looks like a directive; the parser must have seen each one. */
const DIRECTIVE_LINE = /^\s*(['"])use (?:server|cache)[^'"]*\1;?\s*$/gm;
const BIND = '@/server/bind';

/** The directive strings at the start of a file or function body. */
function prologue(statements: ts.NodeArray<ts.Statement>): string[] {
  const directives: string[] = [];
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    directives.push(statement.expression.text);
  }
  return directives;
}

const isEntryDirective = (text: string) => text === 'use server' || text.startsWith('use cache');

const exported = (node: ts.Node) =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Whether `defineAction` is imported, unrenamed, from server/bind. */
function importsDefineAction(source: ts.SourceFile): boolean {
  return source.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === BIND &&
      s.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some(
        (e) => e.name.text === 'defineAction' && e.propertyName === undefined,
      ),
  );
}

/** Problems with the exports of an action module or route file. */
function exportProblems(source: ts.SourceFile, kind: 'action' | 'route'): string[] {
  const problems: string[] = [];
  const definesActions = importsDefineAction(source);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      problems.push('re-exports values (export { … } or export *)');
    } else if (ts.isExportAssignment(statement)) {
      problems.push('has a default export');
    } else if (
      exported(statement) &&
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement))
    ) {
      problems.push('exports a declaration instead of a wrapped const');
    } else if (exported(statement) && ts.isVariableStatement(statement)) {
      if (!(statement.declarationList.flags & ts.NodeFlags.Const)) {
        problems.push('exports a let or var');
      }
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(source);
        if (kind === 'route' && !HTTP_METHODS.has(name)) {
          problems.push(`exports ${name}; a route file exports HTTP methods only`);
        }
        const init = declaration.initializer;
        const wrapped =
          init !== undefined &&
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          init.expression.text === 'defineAction' &&
          definesActions;
        if (kind === 'action' && !wrapped) {
          problems.push(`exports ${name} without defineAction from ${BIND}`);
        }
      }
    }
  }
  return problems;
}

export function scanSource(file: string, text: string): ScanResult {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  const report = (message: string) => findings.push(`${file}: ${message}`);

  const fileDirectives = prologue(source.statements).filter(isEntryDirective);
  let seen = fileDirectives.length;
  const serverFile = fileDirectives.includes('use server');
  if (serverFile && !ACTION_MODULE.test(file)) {
    report('"use server" belongs in src/server/actions/<name>.ts only');
  }

  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && 'body' in node && node.body && ts.isBlock(node.body)) {
      const inline = prologue(node.body.statements).filter(isEntryDirective);
      seen += inline.length;
      for (const directive of inline) report(`inline "${directive}" directive`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const directive of fileDirectives) {
    if (directive.startsWith('use cache')) report(`"${directive}" (cacheComponents is off)`);
  }
  if (ACTION_MODULE.test(file)) {
    if (!serverFile) report('an action module needs a file-level "use server"');
    for (const problem of exportProblems(source, 'action')) report(problem);
  }
  if (ROUTE_FILE.test(file)) {
    for (const problem of exportProblems(source, 'route')) report(problem);
  }
  if (METADATA_FILE.test(file))
    report('metadata routes are not wrapped; list it in the test first');

  if (NOT_TYPESCRIPT.test(file)) report('src/ holds TypeScript only (pageExtensions)');
  if (file.startsWith('src/pages/'))
    report('the Pages Router is not used; entry points live in src/app');

  const lines = text.match(DIRECTIVE_LINE)?.length ?? 0;
  if (lines !== seen) report(`${lines} directive-like lines, but the parser found ${seen}`);
  return { file, serverFile, findings };
}
