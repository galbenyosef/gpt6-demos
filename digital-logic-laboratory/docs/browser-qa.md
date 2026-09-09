# Browser interaction and visual checks

Checked on 9 September 2026 using the local Bun application in Chrome. The application remains local; no hosting/publishing is part of this pass.

## Verified in the browser

| Flow                               | Evidence / result                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run the Addition program at 100 Hz | Finishes with `HALT · 4 instructions completed`, `R1 = 58 (0x003A)`, and 20 clocks; the result stays visible.                                                                                                                   |
| Slow replay                        | Running badge, disabled Run, enabled Pause, named phase indicators and a plain-language explanation appear immediately.                                                                                                         |
| Pause/resume                       | Controls reflect the stopped state; instruction/clock counters remain fixed while other inspector panels are used.                                                                                                              |
| Step through ADD                   | After EXECUTE, the panel reports inputs 23/35 and result 58; R1 still contains 23. ALU/register hardware is highlighted. WRITEBACK changes R1 to 58.                                                                            |
| Source and address breakpoints     | An existing address breakpoint at `8000` stops before any instruction. Resuming reaches a source breakpoint at `8004`; the ADD source line is highlighted and stepping writes 58. Both stops say Breakpoint, not merely Paused. |
| Hierarchical navigation            | Double-clicked ALU → adder → FullAdder0 → first → sum → shared. NAND reports A=1, B=1, OUT=0 from the paused ADD netlist.                                                                                                       |
| Truth table                        | Full Adder generates eight rows. Applying row 7 gives Sum=1, Carry=1.                                                                                                                                                           |
| Typed circuit inputs               | Counter EN=1 followed by Clock gives Q=1. Changing EN to 0 and clocking again holds Q=1.                                                                                                                                        |
| Circuit editing                    | Placed a NAND in a new circuit and dragged all three connections. Compilation succeeds; setting A=B=1 produces OUT=0.                                                                                                           |
| Duplicate/delete                   | Duplicated a half adder, selected the copy, deleted it and returned to the original component count.                                                                                                                            |
| Signal probing                     | Selected a wire and added its hierarchical port to the oscilloscope.                                                                                                                                                            |
| Invalid circuit                    | New unconnected circuit displays Incomplete with instructions to connect/validate; Run is disabled.                                                                                                                             |
| Assembler diagnostics              | `LDI R9, 3` produces line 1, column 5 diagnostic and an editor error marker.                                                                                                                                                    |
| CPU fault                          | `RET` on an empty stack displays Fault / Stack underflow with recovery guidance.                                                                                                                                                |
| Pong                               | Maximum-speed execution visibly writes/moves framebuffer sprites. Pause stops the CPU counters; framebuffer inspection shows the paused machine. RAM inspection exposes ball/paddle state.                                      |
| Responsive layout                  | Inspected normal desktop and 1024×768 / 390×844 viewport overrides. Execution feedback stays readable; Fit and zoom controls remain available. Restored the normal viewport afterward.                                          |
| Browser errors                     | No errors in the final clean-page console check.                                                                                                                                                                                |

## Fixes from this pass

- Moved execution feedback out of the off-screen footer into a prominent panel.
- Retained a useful result after short programs; made Run restart a halted program.
- Added explicit breakpoint and fault reasons, including initial-address breakpoints.
- Added actual phase explanations, active hardware outlines, and full source-line highlighting.
- Enlarged/rearranged CPU blocks and brought registers/display higher in the inspector.
- Committed valid typed circuit inputs immediately, avoiding a lost-change-on-blur issue.
- Invalidated the previous laboratory simulator when the edited circuit becomes incomplete.
- Added Fit/zoom controls on narrow layouts, background panning, and viewport refitting.
- Rebuilt the development worker on request with no-store caching so browser reloads test the current simulator.

## Coverage limits

This is a Chrome smoke/interaction pass, not a cross-browser certification. Physical touch-device gestures, browser import/export dialogs, and sustained keyboard-held Pong paddle control were not validated end-to-end in this pass. Bun tests cover project serialization/restoration and keyboard-driven Pong movement/scoring at the CPU level. Live WebMCP registration remains unverified in a supporting browser.
