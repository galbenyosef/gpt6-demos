import ts from "typescript";
import { readFileSync } from "node:fs";
const contract = readFileSync(new URL("../../shared/modelling-contract.ts", import.meta.url), "utf8");
export const runtimeContract = contract;
const banned = new Set(["eval", "Function", "AsyncFunction", "GeneratorFunction", "fetch", "XMLHttpRequest", "WebSocket", "Worker", "SharedWorker", "importScripts", "require", "process", "Bun", "global", "globalThis", "window", "document", "self", "Deno", "console", "Date", "crypto", "performance", "setTimeout", "setInterval", "WebAssembly", "Proxy", "Reflect", "constructor", "prototype", "__proto__"]);
export function validateProgram(code: string, maxBytes = 500 * 1024): { javascript: string; diagnostics: string[] } {
  if (typeof code !== "string" || new TextEncoder().encode(code).length > maxBytes) throw Error("Source exceeds size limit");
  const source = ts.createSourceFile("/model.ts", code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (source.referencedFiles.length || source.typeReferenceDirectives.length || source.libReferenceDirectives.length) throw Error("Compiler reference directives are forbidden");
  const errors: string[] = []; let nodeCount = 0, entry = 0;
  const fail = (node: ts.Node, message: string) => { const p = source.getLineAndCharacterOfPosition(node.getStart(source)); errors.push(`${p.line + 1}:${p.character + 1} ${message}`); };
  for (const s of source.statements) {
    if (ts.isFunctionDeclaration(s) && s.name?.text === "buildModel" && s.modifiers?.some(x => x.kind === ts.SyntaxKind.ExportKeyword)) {
      entry++; if (s.parameters.length !== 1) fail(s, "buildModel must accept exactly one ModelBuildContext");
    }
    if (ts.isImportDeclaration(s)) { if (!s.importClause?.isTypeOnly || (s.moduleSpecifier as ts.StringLiteral).text !== "@assemblavatar/runtime") fail(s, "Only type imports from @assemblavatar/runtime are allowed; use ctx.runtime for operations"); }
    else if (!ts.isFunctionDeclaration(s) && !ts.isVariableStatement(s) && !ts.isTypeAliasDeclaration(s) && !ts.isInterfaceDeclaration(s)) fail(s, "Only functions, constants and types are allowed at module scope");
  }
  function walk(n: ts.Node, loopDepth = 0, depth = 0) {
    if (++nodeCount > 50000 || depth > 120) throw Error("Program complexity limit exceeded");
    if (ts.isIdentifier(n) && (banned.has(n.text) || n.text.startsWith("__"))) fail(n, `Forbidden identifier: ${n.text}`);
    if (ts.isStringLiteral(n) && (banned.has(n.text) || n.text.startsWith("__"))) fail(n, "Forbidden property key");
    if (ts.isElementAccessExpression(n) && !(ts.isNumericLiteral(n.argumentExpression) || ts.isIdentifier(n.argumentExpression))) fail(n, "Computed property access must use a numeric index or typed variable");
    if (ts.isPropertyAccessExpression(n) && n.expression.getText(source) === "Math" && n.name.text === "random") fail(n, "Use runtime.utility.random(seed) for reproducible randomness");
    if (n.kind === ts.SyntaxKind.ImportKeyword || ts.isExportDeclaration(n) || ts.isExportAssignment(n) || ts.isNewExpression(n) || ts.isClassDeclaration(n) || ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isForInStatement(n) || ts.isDeleteExpression(n)) fail(n, "Unsupported syntax in model program");
    const loop = ts.isForStatement(n) || ts.isForOfStatement(n);
    if (loop && loopDepth >= 3) fail(n, "At most three nested loops are allowed");
    if (ts.isForStatement(n) && !n.condition) fail(n, "Loops require an explicit condition");
    if (ts.isArrayLiteralExpression(n) && n.elements.length > 20000) fail(n, "Literal array exceeds budget");
    if (ts.isNumericLiteral(n) && Math.abs(Number(n.text)) > 1000000) fail(n, "Numeric literal exceeds budget");
    ts.forEachChild(n, child => walk(child, loopDepth + Number(loop), depth + 1));
  }
  walk(source);
  if (entry !== 1) errors.push("Export exactly one function buildModel(ctx: ModelBuildContext): ModelBuildOutput");
  if (errors.length) throw Error(errors.slice(0, 15).join("\n"));
  const importedNames = new Set(source.statements.filter(ts.isImportDeclaration).flatMap(s => s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings) ? s.importClause.namedBindings.elements.map(e => e.name.text) : []));
  const types = ["ModelBuildContext", "ModelBuildOutput", "ModelObject", "ModellingRuntime", "Vec3", "MaterialSpec", "PrimitiveOptions", "Deformation"].filter(name => !importedNames.has(name));
  const preamble = `import type { ${types.join(", ")} } from '@assemblavatar/runtime';\n`;
  const programText = preamble + code + "\nconst __contractCheck: (ctx: ModelBuildContext) => ModelBuildOutput | Promise<ModelBuildOutput> = buildModel;";
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], lib: ["lib.es2022.d.ts"], skipLibCheck: true, baseUrl: "/", paths: { "@assemblavatar/runtime": ["/contract.ts"] } };
  const host = ts.createCompilerHost(options); const originalGet = host.getSourceFile.bind(host), originalExists = host.fileExists.bind(host);
  host.fileExists = name => name === "/model.ts" || name === "/contract.ts" || originalExists(name);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => name === "/model.ts" ? ts.createSourceFile(name, programText, languageVersion, true) : name === "/contract.ts" ? ts.createSourceFile(name, contract, languageVersion, true) : originalGet(name, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram(["/model.ts", "/contract.ts"], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).map(d => { const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0; return `Line ${line}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`; });
  if (diagnostics.length) throw Error(diagnostics.slice(0, 15).join("\n"));
  const javascript = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return { javascript, diagnostics: [] };
}
