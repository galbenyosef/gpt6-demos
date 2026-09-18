disposition: ship

Scope: prototype code and interaction review only. No capture files, approved comp, or separate quality-bar card were supplied; the pinned native contract supplies the bar. The parent reports live CUA observation of an upright 128-point numbered sprite and the native menu. This reviewer did not independently inspect pixels, run the app, or rerun tests. Per the review brief, missing captures limit the verdict rather than block this code review. This is not final-art or v1 release approval.

## persistence

Pass: PRODUCT.md and the pinned direction contract exist and distinguish diagnostic geometry from finished character art. IMPLEMENTATION_PLAN.md preserves release gates and missing-art status; its native validation and packaging records were being updated by the parent during review. No comp reproduction or concept roll applies to the specified AppKit controls. The contract's intent, native visual language, first surface, interaction, and form are traceable to spec revision 0.3 and plan decisions D03–D09.

## fidelity

| Element | Disposition | Evidence and limits |
|---|---|---|
| Small transparent desktop panel | match | `panel.rs` sets the specified borderless/nonactivating style, transparency, no shadow, level, click-through, and collection behavior. Native checks assert these properties; actual clicks and Spaces behavior remain desktop checks. |
| Native status menu | match | `status.rs` preserves the requested order, checked selection, disabled invalid packs, Pause/Resume, About, and Quit. D03 authorizes fixed checked Click-through; D04 establishes the size selections. |
| Menu lifecycle | match | Delegate/status ownership persists; modal import/About and reopen menu tracking avoid retaining a mutable application-state borrow. Pause drops the clock; Resume recreates it and resets cursor sampling. Cleanup releases clock/monitors and removes the status item. |
| Pack and error states | match | Switching prepares the pack/image before committing. Failed switches retain the active resource; startup falls back to Default. Import failures remain visible in the menu. README explains restart discovery for manually added folders; automatic watching is deferred. |
| TYPE | match | System menu and alert typography are the explicitly pinned native language, with no custom display treatment. Pixel contrast and truncation were not independently verified. |
| MATERIAL | adaptation | Original numbered test geometry is expressly required by plan T06/D09 until final artwork exists. About and README disclose this. It does not satisfy T11's finished character requirement. |
| GROUND | match | Transparent panel and clear background preserve the user's desktop. The contract specifies no colored app ground. No pixel sampling was available. |
| Sprite rendering and scale | match | `bridge.rs` premultiplies alpha once, maps atlas UVs, applies facing transforms, sets screen backing scale and disables implicit animation. Main-thread checks exercise three packs and all sizes. The parent reports upright visual orientation; this reviewer cannot independently verify edges, filtering, or anchor appearance. |
| Motion and pause | match | The app feeds bounded core simulation from a common-run-loop clock; paused size updates use zero elapsed time. Geometry updates do not advance animation. Reported tests cover movement, timing, persistence, failure preservation, and cleanup. Perceived motion quality remains visually unverified. |

## ceiling

Reached for the reviewed prototype scope: native controls, a transparent bounded sprite, data-driven personality, explicit diagnostic status, and no added application shell. No material craft-floor violation is apparent in the reviewed source; the spec explicitly earns the status glyph and AppKit typography. Final character expression, pose readability, authored animation, mixed-display behavior, fullscreen behavior, and complete desktop/performance acceptance remain outside this verdict. The memory test for finished character identity cannot pass with diagnostic artwork and is correctly reserved for T11.

## material_fixes

None established in the reviewed prototype code. Keep final-art and unperformed desktop checks pending in the implementation record; this limited verdict supplies no evidence to close those gates.

## keep

Preserve the small nonactivating click-through panel, native menu, transactional pack replacement, clock cleanup, and explicit separation between diagnostic geometry and finished character artwork.
