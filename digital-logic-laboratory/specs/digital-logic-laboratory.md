# Digital Logic Laboratory / The Machine

## 1. Product Definition

**Digital Logic Laboratory / The Machine** is an interactive digital-electronics and computer-architecture environment implemented entirely in the browser.

The application begins with primitive logic and progressively exposes a complete programmable computer.

The conceptual hierarchy is:

```text
NAND gates
    ↓
logic gates
    ↓
multiplexers
    ↓
adders
    ↓
ALU
    ↓
flip-flops
    ↓
registers
    ↓
memory
    ↓
CPU
    ↓
instruction set
    ↓
assembler
    ↓
program
    ↓
running machine
```

The defining characteristic of the application is that these layers remain inspectable.

A user running a program should be able to move downward through the abstraction stack:

```text
program
→ assembly instruction
→ CPU operation
→ register transfer
→ ALU operation
→ logic network
→ NAND gates
```

The application must therefore not merely display an illustrative CPU while a separate unrelated JavaScript emulator runs the program.

The visual architecture and executable logical architecture must represent the same machine.

---

# 2. Technical Baseline

Use the same technical platform as Orbital Mechanics Laboratory.

## Runtime

* **Bun**
* **TypeScript**
* ES modules

## Rendering

Primary:

* **Three.js**

Optional:

* **Canvas 2D**

## Conventional UI

Use:

* HTML;
* CSS;
* DOM APIs.

Avoid a large frontend framework unless genuinely required.

## Testing

Use:

```text
bun test
```

with:

```ts
import { describe, expect, test } from "bun:test";
```

## Deployment

The complete application must compile into a static browser application.

No backend is required.

---

# 3. Product Goals

The project should demonstrate code-generation capability across:

* graph algorithms;
* digital logic;
* hierarchical composition;
* state machines;
* CPU architecture;
* event-driven simulation;
* parsing;
* assembly;
* debugging;
* 3D visualization;
* signal visualization;
* persistent state;
* performance optimization.

The result should be both:

1. an interactive learning environment;
2. a functioning programmable computer.

---

# 4. Two Application Modes

Provide two closely integrated modes.

## Laboratory

The user constructs and tests digital circuits.

Examples:

```text
NAND
AND
XOR
half adder
full adder
multiplexer
register
counter
ALU
```

## The Machine

The user inspects and runs a complete predefined computer assembled from the same circuit abstractions.

The transition between these modes must be seamless.

A CPU component in **The Machine** can be opened and inspected in **Laboratory** mode.

---

# 5. Canonical Logic Model

Support initially:

```text
0
1
X
```

Where:

```text
0 = logical low
1 = logical high
X = unknown / unresolved
```

The architecture should allow later extension to:

```text
Z = high impedance
```

Signals must not be represented only as JavaScript booleans.

Example:

```ts
type LogicValue = 0 | 1 | "X";
```

---

# 6. Circuit Model

Core entities:

```ts
interface Port {
  id: string;
  name: string;

  direction: "INPUT" | "OUTPUT";

  width: number;
}

interface Component {
  id: string;
  type: string;

  inputs: Port[];
  outputs: Port[];

  position: {
    x: number;
    y: number;
    z: number;
  };
}

interface Net {
  id: string;

  width: number;

  sources: PortReference[];
  targets: PortReference[];
}
```

Circuits must be represented as graphs.

---

# 7. Primitive Gate

The conceptual primitive is:

```text
NAND
```

Truth table:

```text
A B | OUT
----|----
0 0 | 1
0 1 | 1
1 0 | 1
1 1 | 0
```

Other logic gates may be implemented as composite circuits.

Example:

```text
NOT(A) = NAND(A,A)
```

The user should be able to inspect this relationship.

---

# 8. Composite Components

A composite component is itself a circuit.

Example:

```text
XOR
 ├ NAND
 ├ NAND
 ├ NAND
 └ NAND
```

Use hierarchical composition.

Example:

```ts
interface CircuitDefinition {
  id: string;
  name: string;

  inputs: PortDefinition[];
  outputs: PortDefinition[];

  components: ComponentInstance[];
  nets: NetDefinition[];
}
```

This allows recursive inspection.

---

# 9. Hierarchical Navigation

Users must be able to double-click a component and enter it.

Example:

```text
CPU
 ↓
ALU
 ↓
16-bit Adder
 ↓
Full Adder
 ↓
Half Adder
 ↓
XOR
 ↓
NAND
```

Provide breadcrumb navigation:

```text
Machine > CPU > ALU > Adder16 > FullAdder7
```

The transition should visually zoom into the selected subsystem where practical.

---

# 10. Circuit Compiler

Do not simulate the editable object graph directly for every clock transition.

Create a circuit compilation stage:

```text
Editable circuit
       ↓
Validation
       ↓
Flatten / index
       ↓
Compiled netlist
       ↓
Simulation engine
```

The compiled representation should use compact arrays.

Example:

```ts
interface CompiledNetlist {
  gateTypes: Uint8Array;

  inputA: Int32Array;
  inputB: Int32Array;

  output: Int32Array;

  signalValues: Uint8Array;
}
```

This is important for performance.

---

# 11. Simulation Worker

Run the logic simulator in a Web Worker.

Architecture:

```text
Main Thread
│
├ UI
├ Three.js
├ Editor
├ Oscilloscope
└ Simulation Client
      │
      ▼
Web Worker
│
├ Netlist Compiler
├ Logic Simulator
├ Clock
├ CPU
└ Signal Trace Recorder
```

Simulation must not depend on rendering frame rate.

---

# 12. Simulation Modes

Provide:

### Continuous

Run the clock continuously.

### Clock step

Advance one full CPU clock.

### Half-step

Optional:

```text
rising edge
falling edge
```

### Instruction step

Advance until one complete CPU instruction has executed.

### Micro-step

Advance a predefined internal CPU phase.

### Gate propagation step

For laboratory debugging, propagate one logical evaluation stage.

---

# 13. Combinational Logic

The engine must:

* calculate dependency order;
* detect invalid combinational cycles;
* propagate changes efficiently.

Use graph algorithms rather than repeatedly scanning every gate.

Where possible:

```text
changed signal
→ dependent gates
→ changed outputs
→ dependent gates
```

This creates an event-driven simulation.

---

# 14. Sequential Logic

Implement sequential state explicitly.

Required components:

* D flip-flop;
* register;
* program counter;
* counter;
* RAM;
* clock.

A sequential component updates state only at the appropriate clock event.

---

# 15. Clock

Provide configurable clock frequency.

The simulated clock does not need to correspond to wall-clock frequency.

For example:

```text
1 Hz
10 Hz
100 Hz
1 kHz
Maximum
```

At low clock speeds, signal changes should visibly propagate.

At maximum speed, visualization may sample state instead of displaying every transition.

---

# 16. Laboratory Workspace

Use a spatial Three.js work surface.

The layout can resemble an abstract electronics bench rather than a realistic breadboard.

Users can:

* place components;
* move components;
* connect ports;
* delete components;
* duplicate components;
* group components;
* save circuits;
* create reusable composite components.

---

# 17. Connections

Connections should have direction.

Dragging:

```text
output port
→ input port
```

creates a net.

Invalid connections must be rejected.

Examples:

```text
OUTPUT → INPUT        valid
INPUT → INPUT         invalid
OUTPUT → OUTPUT       invalid unless explicitly modelled bus
16-bit → 1-bit        invalid without adapter
```

---

# 18. Bus Support

Support multi-bit signals.

Typical widths:

```text
1 bit
4 bit
8 bit
16 bit
```

Render buses differently from single wires.

Selecting a bus should show values as:

```text
binary
hexadecimal
unsigned decimal
signed decimal
```

Example:

```text
Binary:  0011 1010 1100 0001
Hex:     3AC1
Unsigned 15041
Signed   15041
```

---

# 19. Visual Signal State

Signals should be visually readable without relying entirely on colour.

Possible representation:

```text
0    thin/static wire
1    emphasized wire
X    dashed/pulsing wire
```

Signal direction may be animated while stepping.

Do not create continuous decorative particle flows during high-speed execution.

---

# 20. Oscilloscope

Canvas 2D is well suited to the oscilloscope.

The user can attach probes to:

* wires;
* ports;
* buses;
* clock;
* register outputs.

Display waveforms over simulation time.

Example:

```text
CLK  ┌─┐ ┌─┐ ┌─┐
     ┘ └─┘ └─┘ └

A    ────┐
         └────────

OUT  ────────┐
             └────
```

For buses display hexadecimal transitions.

---

# 21. Truth Table Tool

For combinational circuits with a manageable number of inputs, automatically generate the truth table.

Example:

```text
A B Cin | Sum Carry
--------|----------
0 0  0  |  0    0
0 0  1  |  1    0
...
```

The user may select a row and apply it to the live circuit.

---

# 22. Required Laboratory Components

Provide at minimum:

```text
NAND
NOT
AND
OR
XOR

MUX
DEMUX

Half Adder
Full Adder

Adder16

D Flip-Flop
Register16
Counter

ALU16
```

Composite implementations should reuse lower-level components.

---

# 23. The Reference Machine

The application must ship with a complete reference computer.

Name:

# H16

A deliberately compact educational 16-bit computer.

Architecture:

```text
16-bit word
16-bit address
64K-word address space
8 general-purpose registers
program counter
stack pointer
flags
ALU
RAM
memory-mapped display
memory-mapped keyboard
```

---

# 24. Registers

Provide:

```text
R0
R1
R2
R3
R4
R5
R6
R7

PC
SP
FLAGS
```

All main data registers are 16-bit.

---

# 25. Flags

At minimum:

```text
Z    zero
N    negative
C    carry
V    overflow
```

---

# 26. Memory

Address space:

```text
0x0000 – 0xFFFF
```

Use 16-bit words.

Provide:

```text
RAM
ROM/program region
memory-mapped I/O
```

The precise map should be defined centrally.

Example:

```text
0x0000–0x7FFF RAM
0x8000–0xBFFF program ROM
0xC000–0xDFFF video memory
0xE000 keyboard/input
0xE001 timer
```

The exact boundaries may be adjusted during implementation but must be documented.

---

# 27. CPU Architecture

Use a simple multi-cycle CPU.

Recommended phases:

```text
FETCH
DECODE
EXECUTE
MEMORY
WRITEBACK
```

Not every instruction needs every phase.

Display the active phase during execution.

---

# 28. Instruction Format

Use fixed 16-bit instructions where possible.

Example conceptual structure:

```text
15          12 11        9 8         6 5               0
+-------------+------------+-----------+----------------+
|   OPCODE    |   REG A    |   REG B   |   OPERAND      |
+-------------+------------+-----------+----------------+
```

Some instructions may use alternate encoding for immediate values.

The final encoding must be formally documented and tested.

---

# 29. Minimum Instruction Set

Arithmetic:

```text
ADD
SUB
INC
DEC
```

Logic:

```text
AND
OR
XOR
NOT
```

Movement:

```text
MOV
LD
ST
LDI
```

Control flow:

```text
JMP
JZ
JNZ
JC
CALL
RET
```

Stack:

```text
PUSH
POP
```

Other:

```text
NOP
HALT
```

---

# 30. ALU

The ALU must be constructed hierarchically from digital logic.

Operations:

```text
ADD
SUB
AND
OR
XOR
NOT
PASS A
PASS B
```

Outputs:

```text
result
zero
negative
carry
overflow
```

The Three.js visualization should expose active ALU pathways.

---

# 31. Register File

Implement eight 16-bit registers.

Expose:

```text
two read paths
one write path
register select
write enable
```

Display register values continuously.

---

# 32. CPU Data Path

The CPU overview should visually represent:

```text
              ┌────────────┐
              │    RAM     │
              └─────┬──────┘
                    │
             ┌──────▼──────┐
             │ Instruction │
             │  Register   │
             └──────┬──────┘
                    │
              ┌─────▼─────┐
              │  Decoder  │
              └─────┬─────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
┌──────▼─────┐ ┌────▼─────┐ ┌────▼─────┐
│ Register   │ │    ALU   │ │   PC     │
│ File       │◄►           │◄►          │
└────────────┘ └──────────┘ └──────────┘
```

Signal routes should become visible when active.

---

# 33. CPU Visualization

The user should be able to watch an instruction execute.

Example:

```asm
ADD R1, R2
```

Visual sequence:

```text
R1 selected
R2 selected
values enter ALU
ADD operation selected
ALU produces result
flags calculated
result bus activates
R1 write-enable activates
R1 changes value
```

At slow simulation speed this should be visibly inspectable.

---

# 34. Instruction Inspector

For the current instruction display:

```text
PC:      0x812C

Binary:
0010 001 010 000000

Decoded:
ADD R1, R2

Phase:
EXECUTE

Inputs:
R1 = 0x002A
R2 = 0x0010

Result:
0x003A
```

---

# 35. Assembler

Implement a real assembler.

Input:

```asm
start:
    LDI R0, 10
    LDI R1, 0

loop:
    ADD R1, R0
    DEC R0
    JNZ loop

    HALT
```

Output:

* machine code;
* symbol table;
* address mapping;
* diagnostics.

---

# 36. Assembly Parser

Do not parse assembly with a collection of fragile regex replacements.

Implement:

```text
lexer
→ parser
→ intermediate representation
→ symbol resolution
→ encoder
```

Suggested AST:

```ts
type Statement =
  | LabelStatement
  | InstructionStatement
  | DataStatement;
```

---

# 37. Assembler Diagnostics

Errors should include:

```text
line
column
message
```

Example:

```text
Line 14: unknown register R9
Line 21: undefined label "draw_loop"
Line 37: immediate value exceeds instruction range
```

---

# 38. Program Editor

Provide an integrated assembly editor.

Required:

* line numbers;
* syntax highlighting;
* assemble button;
* error markers;
* breakpoint gutter;
* current instruction highlight.

A sophisticated code editor library is optional.

A purpose-built editor is acceptable.

---

# 39. Debugger

Support:

```text
Run
Pause
Step instruction
Step CPU phase
Step clock
Reset
```

Breakpoints:

```text
address
source line
```

Optional:

```text
conditional breakpoint
```

---

# 40. Register Inspector

Continuously show:

```text
R0  000A
R1  001F
...
PC  812C
SP  7FFE

Z 0
N 0
C 1
V 0
```

Highlight changed values.

---

# 41. Memory Inspector

Provide:

```text
address
hex
decimal
ASCII where meaningful
```

Example:

```text
8120  102A
8121  3010
8122  7004
```

Allow navigation to:

```text
PC
SP
specific address
label
```

---

# 42. Memory-Mapped Display

Provide a small framebuffer.

Recommended initial resolution:

```text
256 × 144 monochrome
```

or:

```text
128 × 128
```

depending on performance.

Canvas 2D should render the display.

Writing to video memory modifies pixels.

The CPU must not call JavaScript drawing APIs directly.

The only interface between CPU and display is memory.

---

# 43. Keyboard Input

Map keyboard state through memory-mapped I/O.

Example:

```text
0xE000 = key code
0xE001 = key state
```

Programs can therefore react to input without special JavaScript hooks.

---

# 44. Demo Program

The machine must ship with at least one graphical program.

Preferred:

# Pong

The program runs on the H16 CPU.

It should implement:

* paddle movement;
* ball movement;
* collisions;
* scoring;
* framebuffer output.

The game should not run in JavaScript application logic.

JavaScript provides:

```text
CPU simulation
memory
input devices
display device
```

The H16 machine code provides the game.

---

# 45. Alternative Simple Demo Programs

Also include:

```text
Fibonacci
memory fill
counter
moving pixel
bouncing square
text-like glyph rendering
```

These provide progressively more complex examples.

---

# 46. Source-to-Hardware Navigation

A central feature of the application is cross-layer traceability.

When execution is paused on:

```asm
ADD R2, R3
```

the application should allow:

```text
Instruction
    ↓
CPU control signals
    ↓
ALU
    ↓
Adder16
    ↓
FullAdder
    ↓
XOR
    ↓
NAND
```

A breadcrumb should preserve context.

---

# 47. Signal Tracing

Selecting a signal should expose:

```text
current value
source
destinations
bit width
recent transitions
```

Example:

```text
Signal: ALU_RESULT

Width: 16

Current:
0x003A

Source:
ALU.output

Targets:
RegisterFile.writeData
FlagLogic.input
```

---

# 48. Dependency Highlighting

Selecting a component should optionally highlight:

### Upstream

Everything that can influence it.

### Downstream

Everything it can influence.

This requires graph traversal over the circuit.

---

# 49. Visual Abstraction Levels

Three.js rendering should adjust by zoom level.

At high level:

```text
CPU
RAM
Display
Input
```

Zooming into CPU reveals:

```text
control unit
register file
ALU
PC
instruction register
buses
```

Zooming into ALU reveals:

```text
adder
logic units
multiplexers
flag logic
```

Do not display thousands of individual NAND gates simultaneously unless requested.

---

# 50. Physical Layout

Circuit layout does not need to imitate silicon.

Use a clean spatial schematic.

Objectives:

* clear flow;
* understandable hierarchy;
* minimal wire crossings;
* predictable placement.

Automatic layout may use:

* layers;
* graph depth;
* component grouping;
* orthogonal routing approximations.

---

# 51. Wire Routing

Use Three.js curves or line segments.

Connections must remain readable.

For dense components, group multiple signals into buses.

At higher abstraction levels, render logical buses rather than individual bit wires.

---

# 52. Animated Execution

At slow clock speeds, briefly animate signal activation.

Example:

```text
PC
→ address bus
→ RAM
→ instruction register
→ decoder
```

Animation duration is visual only.

It must not determine simulation timing.

---

# 53. Performance Strategy

The simulator must handle thousands of primitive gates.

Important techniques:

* compiled netlists;
* typed arrays;
* event-driven propagation;
* Web Worker execution;
* hierarchical visual culling;
* batched rendering;
* instanced Three.js meshes.

For gates of the same shape use:

```ts
THREE.InstancedMesh
```

rather than thousands of individual mesh objects.

---

# 54. Fast and Inspectable Execution Modes

Provide two execution modes.

## Inspectable

Designed for teaching and debugging.

Characteristics:

```text
low clock speed
signal animation
full trace
detailed instrumentation
```

## Fast

Designed for running programs.

Characteristics:

```text
maximum simulation throughput
reduced trace recording
sampled visualization
batched updates
```

Both modes execute the same logical machine.

---

# 55. Circuit Validation

Before compilation validate:

* unconnected mandatory input;
* output connected incorrectly;
* width mismatch;
* combinational loop;
* duplicate component ID;
* invalid hierarchy;
* recursively defined component;
* unsupported multi-driver net.

Report actionable errors.

---

# 56. Persistence

Save:

```text
custom circuits
workspace layout
machine state
program source
breakpoints
oscilloscope probes
preferences
```

Use browser storage.

Allow explicit JSON export/import.

---

# 57. Suggested Project Structure

```text
src/
  app/
    App.ts
    StateStore.ts

  logic/
    LogicValue.ts
    Port.ts
    Net.ts
    Component.ts
    Circuit.ts

    gates/
      Nand.ts

    composites/
      Not.ts
      And.ts
      Or.ts
      Xor.ts
      Mux.ts
      HalfAdder.ts
      FullAdder.ts
      Adder16.ts
      Register16.ts

  compiler/
    CircuitValidator.ts
    NetlistCompiler.ts
    CompiledNetlist.ts

  simulator/
    Simulator.ts
    EventQueue.ts
    Clock.ts
    TraceRecorder.ts
    worker.ts

  machine/
    H16.ts
    InstructionSet.ts
    Decoder.ts
    MemoryMap.ts
    Devices.ts

  assembler/
    Lexer.ts
    Parser.ts
    Ast.ts
    SymbolTable.ts
    Encoder.ts
    Assembler.ts

  rendering/
    SceneRenderer.ts
    WorkspaceRenderer.ts
    ComponentRenderer.ts
    WireRenderer.ts
    SignalAnimator.ts
    Selection.ts
    CameraController.ts

  layout/
    GraphLayout.ts
    WireRouter.ts

  ui/
    Inspector.ts
    Breadcrumbs.ts
    Toolbar.ts
    RegisterPanel.ts
    MemoryPanel.ts
    InstructionPanel.ts
    Editor.ts

  scope/
    Oscilloscope.ts

  devices/
    Framebuffer.ts
    Keyboard.ts

  persistence/
    ProjectSerializer.ts
    LocalStorage.ts

  examples/
    circuits/
    programs/

  tests/
```

---

# 58. Automated Tests

Use Bun test extensively.

Digital logic is exceptionally suitable for automated verification.

---

# 59. Primitive Logic Tests

Required:

```text
NAND truth table
NOT truth table
AND truth table
OR truth table
XOR truth table
```

---

# 60. Arithmetic Tests

Verify:

```text
HalfAdder
FullAdder
Adder16
```

Examples:

```text
0 + 0
1 + 1
0x0001 + 0x0001
0x7FFF + 0x0001
0xFFFF + 0x0001
```

Validate carry and overflow separately.

---

# 61. Register Tests

Verify:

* load;
* hold;
* reset;
* clock behaviour.

---

# 62. ALU Tests

For every operation, compare against a reference arithmetic implementation.

Include edge cases.

---

# 63. CPU Instruction Tests

Every opcode requires an isolated execution test.

Example:

```ts
test("ADD R1,R2", () => {
  // initialize machine
  // execute instruction
  // verify R1
  // verify flags
  // verify PC
});
```

---

# 64. Assembler Tests

Test:

```text
lexing
parsing
labels
forward references
immediate encoding
syntax errors
range errors
machine-code output
```

---

# 65. Program-Level Tests

Run complete programs.

Examples:

```text
sum 1..10
Fibonacci
memory copy
subroutine CALL/RET
stack PUSH/POP
```

Verify final machine state.

---

# 66. Circuit-vs-Reference Validation

For critical components, compare the circuit output with a straightforward TypeScript reference model.

Examples:

```text
Adder16 circuit
vs
(a + b) & 0xFFFF
```

The reference implementation is a test oracle, not the runtime implementation.

---

# 67. Main Application Layout

Suggested:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Laboratory | The Machine     Run Pause Step Clock      100 Hz     │
├───────────────┬────────────────────────────────────┬───────────────┤
│               │                                    │               │
│ Hierarchy     │                                    │ Inspector     │
│               │          THREE.JS VIEW             │               │
│ Machine       │                                    │ Signal        │
│ ├ CPU         │                                    │ Register      │
│ ├ RAM         │                                    │ Instruction   │
│ └ Display     │                                    │               │
│               │                                    │               │
├───────────────┴────────────────────────────────────┴───────────────┤
│ Code Editor / Oscilloscope / Memory / Trace                        │
└────────────────────────────────────────────────────────────────────┘
```

---

# 68. Required Demonstration Sequence

The project should support a short demonstration that progressively reveals complexity.

## Scene 1 — NAND

Open one NAND gate.

Toggle inputs:

```text
A = 1
B = 1
```

Observe:

```text
OUT = 0
```

---

## Scene 2 — Full Adder

Zoom out.

Show that multiple NAND-derived gates implement a full adder.

Apply:

```text
A   = 1
B   = 1
Cin = 0
```

Observe:

```text
Sum   = 0
Carry = 1
```

---

## Scene 3 — 16-bit ALU

Zoom out again.

Enter:

```text
A = 0x0017
B = 0x0023
```

Select:

```text
ADD
```

Observe:

```text
Result = 0x003A
```

---

## Scene 4 — CPU

Zoom out.

Load:

```asm
LDI R1, 23
LDI R2, 35
ADD R1, R2
HALT
```

Step instruction by instruction.

Watch register and ALU state change.

---

## Scene 5 — Inspect ADD

Pause during:

```asm
ADD R1, R2
```

Drill into:

```text
CPU
→ ALU
→ Adder16
→ FullAdder
→ NAND
```

Show that the active low-level logic corresponds to the instruction currently executing.

---

## Scene 6 — Run Pong

Switch to maximum execution speed.

Run the bundled Pong program.

The framebuffer shows the game.

Use keyboard controls.

Then pause the machine.

The game freezes because the CPU stopped.

Inspect:

```text
PC
registers
video memory
current instruction
```

This is the strongest demonstration moment:

> What appeared to be a simple graphical game is actually executing on the digital machine visible inside the application.

---

# 69. Advanced Optional Feature: Cache Simulation

After the base machine works, add an optional cache layer.

Example:

```text
CPU
 ↓
L1 cache
 ↓
RAM
```

Configurable:

```text
cache size
line size
associativity
replacement policy
```

Show:

```text
hit
miss
eviction
```

This is an extension, not an MVP requirement.

---

# 70. Advanced Optional Feature: Pipeline

A later version may introduce a pipelined CPU.

Stages:

```text
IF
ID
EX
MEM
WB
```

Visualize:

* multiple instructions simultaneously;
* dependencies;
* stalls;
* forwarding;
* branch flushes.

Again, this is deliberately outside the initial implementation.

The first machine should favour clarity and correctness over architectural sophistication.

---

# 71. Advanced Optional Feature: Mini Compiler

A future extension could compile a small C-like language:

```c
let sum = 0;

for (let i = 0; i < 10; i++) {
    sum = sum + i;
}
```

into H16 assembly.

This would create:

```text
source language
→ compiler
→ assembly
→ machine code
→ CPU
→ logic gates
```

Do not attempt this before the assembler, CPU and logic simulator are stable.

---

# 72. Visual Style

The application should resemble a technical instrument rather than a futuristic movie interface.

Use:

* clean geometric components;
* compact typography;
* readable wires;
* clear bus representation;
* subtle depth;
* controlled animation.

The scene should be attractive, but comprehensibility has priority.

---

# 73. Explicit Non-Goals

The first release should not attempt to implement:

* transistor-level electronics;
* analog voltage simulation;
* electromagnetic effects;
* realistic semiconductor timing;
* FPGA synthesis;
* Verilog compatibility;
* modern x86;
* speculative execution;
* superscalar processing;
* realistic DRAM timing;
* a production compiler.

The objective is a logically consistent educational digital computer.

---

# 74. Correctness Principle

Never implement a visual shortcut that breaks causal consistency.

For example, do not:

```text
execute ADD in JavaScript
then animate the ALU afterward
```

as two unrelated mechanisms.

Instead:

```text
instruction decoding
→ control signals
→ ALU network
→ output
→ register write
```

must form a coherent simulation pathway.

Optimization may compile that circuit into a more efficient netlist, but the compiled representation must remain equivalent to the visible circuit.

---

# 75. Definition of Done

The project is complete when:

* it runs with Bun;
* it builds into a static application;
* circuits are editable;
* NAND is the primitive conceptual gate;
* composite components are hierarchical;
* circuits compile into an executable netlist;
* simulation runs independently of rendering;
* combinational and sequential logic work;
* buses work;
* an oscilloscope can probe signals;
* a 16-bit ALU works;
* registers and memory work;
* the H16 CPU runs real instructions;
* the assembler converts source code to machine code;
* instruction stepping works;
* register and memory inspection work;
* source lines map to executing instructions;
* components can be opened recursively;
* the user can inspect an instruction down to its underlying gates;
* the framebuffer is memory mapped;
* keyboard input is memory mapped;
* a graphical program runs on the simulated machine;
* stopping the CPU stops that program;
* automated tests verify gates, arithmetic, CPU instructions and assembler behaviour;
* thousands of primitive gates can be simulated without making the interface unusable.

The result should make a simple point visible:

> Software is running because instructions change a machine, and the machine works because networks of elementary logical operations produce those state changes.

The application should let the user inspect that chain rather than merely describe it.
