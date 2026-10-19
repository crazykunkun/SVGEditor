import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

/** Static, repeatable checks for the documented module boundaries and OO layout. */
class ArchitectureCheck {
  private readonly root = resolve(process.cwd(), "src");
  private readonly failures: string[] = [];
  private readonly layers = new Map<string, ReadonlySet<string>>([
    ["domain", new Set(["domain"])],
    ["ports", new Set(["ports", "domain"])],
    ["application", new Set(["application", "domain", "ports"])],
    ["cli", new Set(["cli", "application", "domain", "ports"])],
    ["infrastructure", new Set(["infrastructure", "domain", "ports"])],
  ]);
  private readonly terminalModules = new Set(["node:readline", "node:readline/promises", "node:process", "node:stream"]);

  run(): void {
    const files = this.files(this.root);
    for (const file of files) this.checkFile(file);
    // The checking tool follows the same class-per-file discipline as production.
    this.checkLayout(resolve(process.cwd(), "tools", "ArchitectureCheck.ts"));
    if (this.failures.length) {
      for (const failure of this.failures) console.error(`architecture: ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Architecture checks passed (${files.length} source files; imports, class layout, no free functions).`);
  }

  private files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? this.files(path) : entry.name.endsWith(".ts") ? [path] : [];
    });
  }

  private source(file: string): ts.SourceFile {
    return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  }

  private checkFile(file: string): void {
    const source = this.source(file);
    this.checkLayout(file, source);
    this.checkNodes(source, file);
  }

  private checkLayout(file: string, source = this.source(file)): void {
    const classes: Array<ts.ClassDeclaration | ts.ClassExpression> = [];
    this.collectClasses(source, classes);
    if (classes.length > 1) this.fail(file, "one class per file is required");
    for (const declaration of classes) {
      if (declaration.name?.text !== basename(file, ".ts")) {
        this.fail(file, `class ${declaration.name?.text ?? "<anonymous>"} must match its filename`);
      }
    }
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement)) this.fail(file, "free functions belong in a class");
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
            this.fail(file, "free function variables belong in a class");
          }
        }
      }
    }
  }

  private collectClasses(node: ts.Node, classes: Array<ts.ClassDeclaration | ts.ClassExpression>): void {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) classes.push(node);
    ts.forEachChild(node, (child) => this.collectClasses(child, classes));
  }

  private checkNodes(node: ts.Node, file: string): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      this.checkSpecifier(node.moduleSpecifier, file);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
      this.checkSpecifier(node.moduleReference.expression, file);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const specifier = node.arguments[0];
      if (!specifier) this.fail(file, "dependency target must be a static string");
      else this.checkSpecifier(specifier, file);
    }
    ts.forEachChild(node, (child) => this.checkNodes(child, file));
  }

  private checkSpecifier(node: ts.Expression, file: string): void {
    if (!ts.isStringLiteralLike(node)) {
      this.fail(file, "dependency target must be a static string");
      return;
    }
    const owner = relative(this.root, file).split(sep)[0]!;
    if (owner === "main.ts") return; // The composition root wires concrete adapters.
    const allowed = this.layers.get(owner);
    if (!allowed) {
      this.fail(file, `unknown source layer: ${owner}`);
      return;
    }
    const dependency = node.text;
    if (dependency.startsWith(".")) {
      const destination = relative(this.root, resolve(dirname(file), dependency));
      const target = destination.split(sep)[0]!;
      if (destination.startsWith(`..${sep}`) || !allowed.has(target)) {
        this.fail(file, `${owner} must not depend on ${dependency}`);
      }
    } else if (!(owner === "infrastructure" && (dependency.startsWith("node:") || dependency === "fast-xml-parser"))
      && !(owner === "cli" && this.terminalModules.has(dependency))) {
      this.fail(file, `${owner} must not depend on external module ${dependency}`);
    }
  }

  private fail(file: string, message: string): void {
    this.failures.push(`${relative(process.cwd(), file)}: ${message}`);
  }
}

new ArchitectureCheck().run();
