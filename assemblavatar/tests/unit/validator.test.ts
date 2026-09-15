import { describe, expect, test } from "bun:test";
import { validateProgram } from "../../src/backend/sandbox/ProgramValidator";
const wrap = (body: string) => `export function buildModel(ctx: ModelBuildContext): ModelBuildOutput { ${body}; return {root:ctx.runtime.create.box()}; }`;
describe("program validation", () => {
  test("accepts typed procedural construction", () => { expect(validateProgram(wrap("const x = ctx.runtime.create.sphere({radius: 1})")).javascript).toContain("function buildModel"); });
  for (const code of ["fetch('https://example.com')", "process.env.OPENAI_API_KEY", "Bun.file('secret')", "eval('1')", "new Function('return 1')", "const x = Math.random()", "while(true) {}", "for(;;) {}", "const x = globalThis", "const x = ctx.runtime.constructor", "const x = import('node:fs')"]) test(`rejects ${code}`, () => expect(() => validateProgram(wrap(code))).toThrow());
  test("rejects external imports", () => expect(() => validateProgram(`import { readFile } from 'node:fs'; ${wrap("")}`)).toThrow());
  test("actually checks types and the return contract", () => { expect(() => validateProgram(wrap("ctx.runtime.create.box({width:'wide'})"))).toThrow(); expect(() => validateProgram("export function buildModel(ctx: ModelBuildContext) { return 42; }")).toThrow(); });
  test("rejects over-budget sources", () => expect(() => validateProgram(wrap(""), 10)).toThrow("size limit"));
  test("rejects compiler filesystem directives", () => expect(() => validateProgram(`/// <reference path="/etc/passwd" />\n${wrap("")}`)).toThrow("reference directives"));
  test("transpilation preserves source strings containing export keywords", () => expect(validateProgram(wrap('const text = "export const x = 1"')).javascript).toContain('"export const x = 1"'));
  test("rejects excessive nesting", () => expect(() => validateProgram(wrap("for(let a=0;a<2;a++){for(let b=0;b<2;b++){for(let c=0;c<2;c++){for(let d=0;d<2;d++) {}}}}"))).toThrow());
});
