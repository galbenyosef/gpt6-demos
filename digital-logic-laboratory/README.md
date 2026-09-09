# Digital Logic Laboratory / The Machine

A browser circuit workbench and inspectable H16 computer, built with Bun, TypeScript, Three.js, DOM controls, and Canvas instruments. No backend is needed.

Use **Laboratory** to build and test digital circuits, from a NAND gate to adders and clocked registers. Use **The Machine** to assemble programs, run them on the H16 computer, and follow their data through its circuit-backed ALU and registers. Opening a library circuit creates an editable workbench; inspecting the machine shows its live datapath.

## Documentation

| Document | What it covers |
| --- | --- |
| [User manual](docs/user-manual.md) | Guided first run, execution controls, circuit editing, debugging, display examples, saving, and troubleshooting. Start here if you are new to the app. |
| [H16 architecture](docs/H16.md) | Exact instruction syntax and encoding, flags, memory map, five-phase timing, and circuit compilation. Use this when writing programs or studying the implementation. |
| [Browser QA results](docs/browser-qa.md) | Browser scenarios that were checked, fixes from the visual test pass, and remaining coverage limits. |
| [Project specification](specs/digital-logic-laboratory.md) | Original design requirements and intended scope. See the implementation limits below and QA results for the current state. |

## Run locally

```sh
bun install
bun run dev
```

Open the URL printed by the server (default `http://localhost:3000`). To use a different port: `PORT=3001 bun run dev`.

```sh
bun test
bun run typecheck
bun run build
```

The static application is in `dist/`. Serve that directory over HTTP(S); it includes `worker.js`. Opening `index.html` with `file://` will not work because the browser needs a worker origin. Fonts have local system fallbacks if Google Fonts is unavailable.

## Try the demonstration

For the clearest first run, select **Addition** in the Assembly panel, click **Load**, then **Watch slowly**. The execution panel explains one CPU phase per second and outlines the participating hardware. After four instructions and 20 clocks, it shows `R1 = 58 (0x003A)`. At higher speeds this program can finish before you can follow the highlights; the result remains visible. Follow the [step-by-step Addition walkthrough](docs/user-manual.md#first-run-follow-an-addition) to inspect the intermediate values.

1. In the Circuit library selector choose **NAND → Open circuit**. Toggle A and B to 1; OUT becomes 0.
2. Open **Full Adder**. Set A=1, B=1, Cin=0. Sum=0, Carry=1. Double-click a half adder, then its XOR, then a NAND. Breadcrumbs return to each level. The Truth table panel can generate and apply all eight cases.
3. Open **ALU16**. Set A=`0x0017`, B=`0x0023`, OP=0. OUT=`0x003A`.
4. Switch to **The Machine**. The Addition program is loaded initially. Use **Instruction** to load R1=23 and R2=35. Step FETCH, DECODE, EXECUTE for ADD; then use **Inspect active ALU**. Drill down through `adder → FullAdder0 → first → sum → shared`. The values are from the executing ALU's actual compiled netlist.
5. Click a register to inspect its bit cells. Open the Register file to inspect the write decoder and two read mux trees. PC/SP/IR also open into clocked registers.
6. Load **Pong**, select **Maximum**, and Run. Focus the display and use ↑/↓ (or W/S). Pause to freeze the game and inspect its CPU, stack, video memory, and source line.

## Editing circuits

- **Open circuit** loads a library definition as an editable workbench. **New circuit** creates an empty one.
- Palette buttons place components into a non-primitive workbench. Drag components to move them.
- Drag an output port dot to an input port dot. Directions, mandatory inputs, and widths are checked by the compiler. Building an incomplete graph is allowed; simulation reports missing connections until they are completed.
- Select a component to duplicate/delete it. Shift-click several components, then **Group selected** to create a reusable composite with inferred boundary ports.
- Click the background to return to the circuit inspector. **Edit ports** configures input/output names and widths. **Connect bit…** creates explicit bit adapters such as `$in.A[0] → gate.A`.
- **Save component** stores a valid circuit in the custom library. Save the project to retain it on this device.
- Toggle **Auto settle** to manual propagation, change an input, then use **Gate stage** to observe the combinational waves. **Clock** samples sequential state.
- Selecting a wire exposes its value, width, source and target. Add it as a scope probe. Upstream/Outputs highlights traverse circuit dependencies.

The main machine topology is fixed, while its actual circuit internals are inspectable. The laboratory works on editable copies so experiments do not silently change a loaded CPU. Custom primitive redefinition is rejected.

## Programs and debugging

The execution panel remains visible above the workbench. It distinguishes Ready, Running, Paused, Breakpoint, Finished, Fault, and Incomplete circuit states. **Watch slowly** runs at one phase per second; after HALT, **Replay slowly** resets and replays the program. The panel explains the last completed phase, highlights the hardware involved, and retains a register-result summary when a short program finishes. The instruction inspector separately labels the next phase. **Run again** restarts a halted machine.

A saved breakpoint at `0x8000` stops before the first instruction: the panel explains this explicitly, and **Resume** advances past it. Circuit Run is disabled until the edited graph validates, so an earlier circuit cannot keep running behind an incomplete one.

The assembler includes syntax highlighting, line numbers, diagnostic markers, clickable source breakpoints, source/address mapping, and immediate encoding. Program examples include addition, sum, Fibonacci, memory fill, counter, moving pixel, bouncing square, glyphs, and Pong. Select an example and click **Load**; edits require **Assemble & load** (or Cmd/Ctrl+Enter). Failed assembly preserves the loaded machine.

Memory navigation accepts a numeric address or assembled label, with shortcuts for PC/SP. **Breakpoint** toggles an absolute address breakpoint. All arithmetic instructions update Z/N/C/V; subtraction carry means no borrow. See [the exact ISA and architecture](docs/H16.md).

The scope retains a bounded recent history. Machine probes include `CLK`, `PC`, `R0`–`R7`, and `ALU_RESULT`; selecting a circuit wire creates a hierarchical port probe. Fast mode samples; inspectable mode records each phase. Gate propagation and unknown states are digital, not analog timing simulation.

## Persistence

**Save** stores the source, breakpoints, probes, custom circuits, layout, preferences, and a full 64K-word machine snapshot in browser local storage. **Export** creates a versioned JSON project; **Import** validates it before restoring. The snapshot includes the current microphase and pending write so execution can resume mid-instruction. Source/layout also save on page exit; machine snapshots are explicit via Save/Export. Browser storage is device-local, not an account sync service.

Pause before Save or Export when you want to preserve a particular inspection point. Export before replacing a workbench or loading another project if you want a separate backup. Local saves belong to the browser origin, so changing browser, host, or port can show a different saved project. Laboratory circuit definitions and layout are retained, but its current input values and flip-flop simulation state are not included in the project snapshot. See [saving and restoring work](docs/user-manual.md#saving-and-restoring-work).

## Source structure

- `src/logic`: public model and hierarchical standard library.
- `src/compiler`: validation, recursive flattening, alias indexing, topological sorting and dependency traversal.
- `src/simulator`: event-driven typed-array simulator, bounded trace recorder and independent worker scheduler.
- `src/machine`: circuit-backed ALU/register bank, control FSM, memory map and ISA.
- `src/assembler`: lexer, parser, AST, labels, diagnostics and encoder.
- `src/rendering`: Three.js instanced component workbench with routed nets and DOM interaction labels.
- `src/ui`, `src/app.ts`: instruments, editor, debugger, navigation and controls.
- `src/persistence`: schema checks, export/import and grouping.
- `src/tests`: Bun logic, CPU, assembler, programs, persistence, worker and tool-contract tests.

## Validation and limits

Tests exhaust gate truth tables and one-bit adders, compare Adder16/ALU circuits against independent arithmetic oracles, exercise every opcode and both conditional outcomes, check sequential hold/reset/edge behavior, run whole programs, test worker breakpoints, round-trip mid-instruction state, and compile an 8,000-plus-gate circuit. Pong tests execute actual machine instructions for framebuffer output, paddle input, wall/paddle behavior and scoring.

WebGL is needed for the spatial workbench; conventional debugger controls remain available if renderer creation fails. Complex circuits use hierarchy and reduced labels when zoomed out. No transistor/analog simulation, pipeline, cache, high-impedance buses, or C compiler is included. CPU control and memory are explicit behavioral devices; the arithmetic/register datapath is circuit-backed.

Optional WebMCP tools are feature-detected: read the H16 state, assemble source, and step execution. Their input/delegation contracts are unit-tested. No supported live WebMCP context was available for end-to-end registration validation. Chrome interaction and visual checks now cover the main execution/editor flows and desktop, tablet and mobile layouts. See [browser QA results](docs/browser-qa.md) for the tested scenarios and remaining coverage limits.
