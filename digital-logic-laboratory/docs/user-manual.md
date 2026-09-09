# Digital Logic Laboratory user manual

Digital Logic Laboratory lets you experiment with digital circuits and inspect a small computer while it executes assembly programs. You can start with the examples without knowing assembly or circuit design.

For installation and build commands, see the [README](../README.md#run-locally). Keep the local server running while using the app, and open its HTTP URL in a browser.

## Find your way around

The two top-level modes share the same workbench and instruments:

| Area | What you use it for |
| --- | --- |
| **The Machine** | Run and debug the H16 computer; inspect its ALU, register file, memory, display, and keyboard. |
| **Laboratory** | Change circuit inputs, connect components, test logic, and build reusable circuits. |
| Top toolbar | Run, pause, step, reset, and choose clock speed. Step controls adapt to the mode. |
| Execution panel | Read the current status, what just happened, and the instruction/clock counts. |
| Left sidebar | Navigate the machine or choose circuits from the library. |
| Central workspace | Inspect components and wires; arrange and connect components in an editable laboratory circuit. |
| Right inspector | Read component ports, enter laboratory inputs, inspect registers, and view the framebuffer. |
| Bottom tabs | Open Assembly, Oscilloscope, Memory, Trace, or Truth table. |

Click a component or wire to inspect it. Double-click a component to open its internals; use the breadcrumbs above the workspace to return to a parent. A NAND gate or flip-flop is a primitive, so there is no deeper implementation to open. Clicking the background returns to the circuit-level inspector.

Scroll to zoom, drag the background to pan, and use **Fit** to bring the diagram back into view. The **＋** and **−** controls also zoom. In Laboratory, dragging a component moves it. On narrow screens, scroll the page to reach the instruments below the workspace.

## First run: follow an addition

1. Choose **The Machine**, then open the **Assembly** tab.
2. Select **Addition** and click **Load**. This replaces the editor source and loads a fresh machine. It also clears the previous program's breakpoints.
3. Click **Watch slowly**. The clock changes to 1 Hz and execution starts.
4. Watch the execution panel. It says **Running**, names the last completed phase, describes the data transfer, and highlights the participating hardware. The source highlight and register values follow execution.
5. After 20 clocks, the program stops at `HALT`. The panel says **Finished**, reports four completed instructions, and retains `R1 = 58 (0x003A)`.

The program is:

```asm
LDI R1, 23
LDI R2, 35
ADD R1, R2
HALT
```

`LDI` loads a number into a register. `ADD R1, R2` adds the two registers and writes the result into R1. R2 remains 35. Register tiles use hexadecimal, so R1's final tile reads `003A`, which is 58 in decimal.

To inspect the actual addition at your own pace:

1. Click **Reset**, then **Instruction** twice. R1 is now 23 and R2 is 35; ADD is next.
2. Click **Phase** three times to perform FETCH, DECODE, and EXECUTE for ADD.
3. The execution panel reports the ALU inputs 23 and 35 and result 58. **R1 still holds 23**: the result has not yet been written back.
4. Click **Inspect active ALU**. Double-click through `adder → FullAdder0 → first → sum → shared` to reach a NAND gate. These port values come from the executing circuit.
5. Click **Phase** once for MEMORY, then once for WRITEBACK. R1 becomes 58.

The execution panel describes the **last completed phase**. The instruction inspector's **NEXT** tag names the phase that will execute on the next step. Seeing EXECUTE in the panel and NEXT: MEMORY in the inspector is expected.

## Execution controls and status

| Control | In The Machine |
| --- | --- |
| **Run / Resume** | Execute continuously from the current position. |
| **Pause** | Stop continuous execution so values can be inspected. |
| **Instruction** | Finish the current instruction, or execute one whole instruction when stopped before FETCH. |
| **Phase** | Execute one CPU phase. |
| **Clock** | Execute one CPU phase; a clock and a phase are equivalent for H16. |
| **Reset** | Stop and return registers, flags, counters, and PC to their initial state; clear the display. Keep the loaded program and general RAM. |
| **Run again** | Reset a halted machine and run the loaded program again. |
| **Watch slowly / Replay slowly** | Select 1 Hz and run; reset first if the machine has halted. |

To start with cleared general RAM as well, assemble and load the program again. Reset and replay preserve that RAM, so a program that depends on its old contents can produce different results from a fresh load.

Every H16 instruction uses five clocks: FETCH, DECODE, EXECUTE, MEMORY, WRITEBACK. At 1 Hz, one instruction therefore takes approximately five seconds. **Maximum** favors throughput and samples the visual updates; use slow execution or stepping to see each phase. Target clock rates are not guaranteed wall-clock performance. See [timing and debugger](H16.md#timing-and-debugger) for the exact behavior.

| Status | Meaning and next action |
| --- | --- |
| **Ready** | The machine is loaded and waiting. Run or step. |
| **Running** | The clock is advancing. Pause to inspect a stable state. |
| **Paused** | Execution is stopped without finishing. Resume or step. |
| **Breakpoint** | Execution stopped before the instruction at the breakpoint. Inspect, step, or resume. |
| **Finished** | The program reached HALT. Read its results or replay. |
| **Fault** | Execution stopped on an error, such as stack underflow or a ROM write. Read the reason, fix the program, and assemble again. |
| **Incomplete** | The laboratory circuit cannot compile. Connect or correct the indicated ports, then Validate. Run and stepping are disabled. |

A valid laboratory circuit can say **Paused** while still responding to input changes: combinational logic settles when inputs change; it does not require a running clock.

## Experiment with existing circuits

Choose a circuit in the **Circuit library** selector and click **Open circuit**. This opens a laboratory workbench. It does not replace the machine's ALU or register definitions.

### NAND and unknown values

Open **NAND**. Enter 0 or 1 for A and B, or use the toggle buttons next to the inputs. With A=B=1, OUT is 0; with either input 0, OUT is 1.

`X` means an unknown digital value, not an additional binary digit. Try A=0, B=X: OUT is still 1. With A=1, B=X, OUT is X. Wire colors follow the 0/1/X legend below the workspace. This is digital logic simulation, not a model of voltage or analog delay.

### Full Adder and truth tables

Open **Full Adder** and set A=1, B=1, Cin=0. Expect Sum=0 and Carry=1. Double-click its child components to see how the result is built from smaller gates.

Open **Truth table** and click **Generate truth table**. The full adder produces eight cases. Click a row to apply those inputs to the workbench; the all-ones row produces Sum=1 and Carry=1.

Truth tables support combinational circuits with at most eight total input bits. Clocked circuits depend on stored state, and wide circuits such as ALU16 exceed this table limit.

### ALU and clocked state

Open **ALU16**, set A=`0x0017`, B=`0x0023`, and OP=0. OUT becomes `0x003A`. The inspector lists the OP choices; their exact definitions are in [H16 flags and ALU operations](H16.md#flags).

Open **Counter**, set EN=1 and leave reset inactive, then click **Clock**. Q advances. Set EN=0 and clock again: Q holds its value. Registers and counters require clock edges to update their stored state.

With **Auto settle**, input changes propagate to stable combinational outputs automatically. Click it to switch to **Manual propagation**, change an input, then use **Gate stage** to advance one dependency wave at a time. Use **Clock** to sample sequential state. Laboratory **Run** repeats clock steps; repeatedly clocking a purely combinational circuit with unchanged inputs will not produce new output values. Laboratory **Reset** recompiles the circuit and reinitializes its simulated state.

## Build and reuse a circuit

### Build a NAND circuit from scratch

1. Open a library circuit, return to its root using the breadcrumbs, and click the background to show the circuit inspector.
2. Click **New circuit**. The empty workbench has inputs A and B and output OUT. It is initially Incomplete.
3. Click **NAND** in the palette to place a gate.
4. Drag the boundary A port dot to the gate's A input dot, then boundary B to the gate's B input.
5. Drag the gate's OUT dot to the boundary OUT dot.
6. Click **Validate**. Set A=B=1 and confirm OUT=0.

Connections run from a source output to a target input; the circuit's boundary inputs act as sources inside the workbench. The compiler checks required connections, widths, multiple drivers, and combinational loops. An incomplete edit invalidates the previous simulation until the new circuit compiles.

Select a wire to inspect its source, target, width, and value, or use **Delete wire** to remove it. Select a component to **Duplicate** or **Delete** it. Deleting or adding a component may leave connections to repair.

### Ports, buses, and grouping

**Edit ports** accepts comma-separated declarations such as:

```text
input A:16, input B:16, input OP:3, output OUT:16
```

Supported widths are 1, 3, 4, 8, and 16. Connect matching bus widths directly. For an individual bus bit, use **Connect bit…** and enter a source such as `$in.A[0]` and a target such as `gate.A`, replacing `gate` with the actual component ID shown in the inspector. Bit 0 is the least-significant bit. See [circuit compilation](H16.md#circuit-compilation) for reference syntax and validation rules.

Shift-click multiple components and choose **Group selected** to replace them with a reusable composite. Its boundary ports are inferred from the connections crossing the selection. Choose a new name that is not already in the library.

Use **Save component** to add a valid workbench to the custom library, then **Save** the project to retain it locally. The component library and the project save are separate steps. Export a project if you want a portable backup.

## Write and debug programs

Edit source in **Assembly**, then click **Assemble & load**, or press Cmd/Ctrl+Enter while editing. Changing text alone does not change the executing program. Successful assembly loads a fresh machine; a failed assembly displays the first line/column error and keeps the previously loaded machine intact.

H16 has eight general registers, R0–R7. Numbers may be decimal, hexadecimal (`0x8000`), or binary (`0b1010`). Labels name word addresses. For example:

```asm
LDI R0, 3
LDI R1, 0
loop:
  ADD R1, R0
  DEC R0
  JNZ loop
HALT
```

This sums 3+2+1 into R1, leaving 6 (`0x0006`). DEC updates the zero flag; JNZ repeats while that flag is clear. Consult the [instruction reference](H16.md#instruction-encoding) for all opcodes and [flags](H16.md#flags) for conditional behavior.

Click a source line number to toggle a breakpoint. Breakpoints stop before FETCH, so the marked instruction has not executed when the stop occurs. Resume skips that breakpoint once to allow progress; a loop can reach it again later.

In **Memory**, enter an address such as `0x8000` or an assembled label and click **Go**. Use **PC** or **SP** to navigate to those registers' addresses. **Breakpoint** toggles an absolute address breakpoint at the entered address. The table displays words in hexadecimal and unsigned decimal, with ASCII and source context. Addresses are words, not bytes; use the `0x` prefix when entering hexadecimal.

Select a register tile to inspect its bit cells, or open **Register file** to inspect the decoder and read muxes. Register tiles briefly highlight changes. The CPU overview's active outlines identify hardware involved in the last completed phase.

In **Oscilloscope**, add machine probes such as `CLK`, `PC`, `R0`–`R7`, or `ALU_RESULT`. Select a circuit wire and click **＋ Probe** to add its hierarchical signal. Click a probe's × to remove it. **Trace** provides recent recorded samples. Both views use bounded history; Maximum mode samples updates and is not a complete execution log.

## Display examples and Pong

Select an example in Assembly and click **Load**. Use **Maximum** for programs that draw many pixels and **Pause** when you want to inspect them.

| Example | What to look for |
| --- | --- |
| Addition | R1 finishes at 58. |
| Sum 1…10 | R1 finishes at 55. |
| Fibonacci | The first 12 Fibonacci values are written to RAM starting at address 0. |
| Memory fill | Stripes fill the display through writes to video memory. |
| Counter | A repeating binary count appears in the first display word. |
| Moving pixel / Bouncing square | Animation emerges from repeated video memory writes. |
| Glyphs | A small H16 glyph pattern is drawn from a ROM data table. |
| Pong | A running game exercises arithmetic, subroutines, the stack, display, and keyboard. |

For **Pong**, load it, choose Maximum, and click Run. Click the display to give it keyboard focus, then hold ↑/↓ or W/S to move the left paddle. The right paddle follows the ball. The keyboard device reports whether a key is held, so a very short tap can fall between program polls. Leaving display focus clears the held-key state.

Pause freezes execution and therefore the game. Inspect RAM addresses 0–7 for ball position, direction, paddle positions, and scores. Top-row binary indicators represent scores modulo 16. See [Pong](H16.md#pong) and the [memory map](H16.md#memory-map) for details of the program and framebuffer layout.

## Saving and restoring work

**Save** stores a project in browser local storage. **Export** downloads a versioned JSON project. **Import** reads and validates a project file, restores it, and pauses execution.

Projects contain assembly source, source/address breakpoints, probes, custom circuit definitions, workbench layout, speed preferences, and an H16 machine snapshot. The machine snapshot includes memory and the current phase, so you can save after EXECUTE and continue through WRITEBACK after restoring.

Pause first if you want a precise inspection point. Save or export before replacing a workbench, loading another example, or importing another project when you want to preserve the current work separately. Laboratory input values and its live flip-flop state are not saved; its circuit definition and layout are retained.

Page exit also saves source and layout, but does not capture a fresh machine snapshot. Use Save or Export explicitly for that. Browser saves are specific to the browser and origin, including the server port; they do not sync to an account. Export is the portable copy and the fallback if browser storage is full.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Run seems to finish immediately | Read the Finished summary. Addition is only 20 clocks; choose Replay slowly to see each phase. |
| Run stops before anything executes | Look for Breakpoint at `0x8000`. Resume or remove the address/source breakpoint. |
| An ALU result appears but the destination register has not changed | You may be between EXECUTE and WRITEBACK. Step the remaining phases. |
| Changing assembly has no effect | Click Assemble & load. If it fails, the previous program remains loaded. |
| Circuit Run is disabled | Read the validation error, complete required connections, and click Validate. |
| A circuit input changes but the output does not | Check whether manual propagation needs Gate stage, or sequential state needs Clock and an active enable. |
| Truth table generation fails | Use a combinational circuit with at most eight total input bits. |
| Pong ignores keys | Click the display, ensure execution is running, and hold the key long enough for the program to poll it. |
| The diagram is off-screen | Click Fit; use the breadcrumbs to return to the intended hierarchy level. |
| A saved project seems missing | Check the browser and exact host/port, or import an exported JSON backup. |
| Reset leaves old RAM values | Reset preserves general RAM. Assemble & load initializes memory for a fresh program load. |

The spatial workbench requires WebGL. This app models digital logic; it does not include analog timing, transistors, high-impedance buses, a pipeline, or a C compiler. For implementation boundaries see [what executes](H16.md#what-executes). For tested browser scenarios and unverified areas, see [browser QA results](browser-qa.md).
