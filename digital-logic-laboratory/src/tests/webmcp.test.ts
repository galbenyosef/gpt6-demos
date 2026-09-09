import { expect, test } from "bun:test";
import { registerLabTools, type Tool } from "../ui/webmcp";
test("structured tool contracts validate input and delegate to application actions", async () => {
  const registered: Tool[] = [];
  let code = "";
  let count = 0;
  const cleanup = registerLabTools(
    {
      registerTool: (tool) => {
        registered.push(tool);
      },
    },
    {
      read: () => ({ pc: 0x8000 }),
      assemble: async (s) => {
        code = s;
        return { words: 1 };
      },
      step: async (c) => {
        count += c;
        return { instructions: count };
      },
    },
  );
  expect(registered.map((t) => t.name)).toEqual([
    "read_h16_machine",
    "assemble_h16_program",
    "step_h16_machine",
  ]);
  expect(registered[0].execute({})).toEqual({ pc: 0x8000 });
  expect(await registered[1].execute({ source: "HALT" })).toEqual({ words: 1 });
  expect(code).toBe("HALT");
  expect(() => registered[1].execute({ source: 42 })).toThrow();
  expect(await registered[2].execute({ count: 3, kind: "phase" })).toEqual({
    instructions: 3,
  });
  expect(() =>
    registered[2].execute({ count: 0, kind: "instruction" }),
  ).toThrow();
  expect(count).toBe(3);
  cleanup();
});
