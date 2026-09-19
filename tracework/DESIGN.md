---
name: "Tracework"
description: "A working technical review desk, expressed as an engineering change-control ledger."
colors:
  ink: "#27352e"
  muted: "#667168"
  paper: "#f8f9f5"
  surface: "#fff"
  line: "#dfe4db"
  green: "#335b43"
  nav: "#202c28"
  red: "#a14537"
  button-hover: "#f0f3eb"
  button-primary-hover: "#284a36"
  button-border: "#d7dfd3"
  button-border-hover: "#b6c4b2"
  field-border: "#d5ddd1"
  placeholder: "#64705f"
  focus: "#507449"
  readable-muted: "#637257"
  badge-neutral-text: "#5c655e"
  badge-neutral-bg: "#eef0eb"
  badge-green-text: "#3b6140"
  badge-green-bg: "#eaf1e5"
  badge-amber-text: "#8a5c20"
  badge-amber-bg: "#f8eed9"
  badge-red-text: "#9b4436"
  badge-red-bg: "#fae9e3"
  nav-text: "#adbbae"
  nav-active: "#344634"
  nav-active-text: "#eef6dd"
  evidence-bg: "#f7f9f2"
  evidence-border: "#e7ecdf"
  evidence-text: "#50613f"
  proposal-border: "#dfe7d5"
  row-hover: "#f2f5ee"
  row-line: "#e4e8df"
  table-label: "#64735a"
typography:
  headline:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.23
    letterSpacing: "-0.025em"
  title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  paragraph:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  label:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  badge:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "11px"
rounded:
  badge: "4px"
  field: "5px"
  control: "7px"
  panel: "8px"
  dialog: "12px"
spacing:
  inline-tight: "7px"
  inline: "8px"
  row: "12px"
  stack: "16px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.button-primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.button-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.green}"
    rounded: "{rounded.control}"
    padding: "5px 0"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "7px"
    width: "32px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.nav-text}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.nav-active-text}"
  badge-neutral:
    backgroundColor: "{colors.badge-neutral-bg}"
    textColor: "{colors.badge-neutral-text}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
  badge-green:
    backgroundColor: "{colors.badge-green-bg}"
    textColor: "{colors.badge-green-text}"
  badge-amber:
    backgroundColor: "{colors.badge-amber-bg}"
    textColor: "{colors.badge-amber-text}"
  badge-red:
    backgroundColor: "{colors.badge-red-bg}"
    textColor: "{colors.badge-red-text}"
  evidence-passage:
    backgroundColor: "{colors.evidence-bg}"
    textColor: "{colors.evidence-text}"
    rounded: "{rounded.field}"
    padding: "14px"
  proposal-detail:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "27px"
  ledger-row:
    padding: "17px 10px"
  ledger-row-hover:
    backgroundColor: "{colors.row-hover}"
---

# Design System: Tracework

## Overview

**Creative North Star: "Engineering change-control ledger"**

Tracework feels like a working technical review desk: warm paper, deep ink navigation, compact editorial tables, and quiet mineral colors. Stable rows and fine rules give source evidence, proposed changes, and accepted meaning a common visual language. The interface is dense enough for desk work while keeping names, state, and authority distinguishable.

Typography and state carry the identity. Flat surfaces keep evidence readable; contextual panels expose detail without turning each object into a decorative card. The established material is code-led, with consistent Lucide strokes and no decorative raster imagery.

**Key Characteristics:**

- Warm paper and deep green-black navigation.
- Compact tables with explicit state text and field-level evidence links.
- DM Sans headings, IBM Plex Sans interface text, and monospace for exact identities.
- Flat resting surfaces; shadows mark transient layers.

This scan records the implementation in `apps/web/src/style.css`, `App.tsx`, `components.tsx`, and `screens.tsx`, checked against `.impeccable/review/desktop.png` and `mobile.png`. The frontmatter is normative for the extracted reusable values. Sidecar tonal ramps are generated display aids, not additional implementation tokens. It captures the final cascade, including the readability and mobile overrides; it is not an exhaustive inventory of every one-off CSS value. PRODUCT.md supplies durable product direction, while `.impeccable/surfaces/workbench.md` owns surface strategy.

## Colors

Mineral greens sit within warm, low-chroma paper and ink neutrals. Functional state colors stay quiet enough to share dense tables.

### Primary

- **Mineral green** (`green`) carries primary actions and links; the deeper hover color marks pointer feedback.
- **Accepted leaf** (`badge-green-text` / `badge-green-bg`) identifies ready or accepted state in compact badges.

### Secondary

- **Review amber** (`badge-amber-text` / `badge-amber-bg`) marks unresolved review and pending work.
- **Failure clay** (`red`, `badge-red-text` / `badge-red-bg`) identifies destructive action text and failed state. Contextual error panels use related local shades in the stylesheet.

### Neutral

- **Warm paper** (`paper`) is the application ground; **white surface** (`surface`) separates inspection and review detail.
- **Deep ink** (`ink`) carries primary reading. **Green-black** (`nav`) anchors persistent navigation, with separate pale text and selected-item colors.
- **Readable olive** (`readable-muted`) is the final override for supporting metadata across the workbench; `muted` remains the generic utility and icon color.
- **Fine rule** (`line`) separates structural regions. Field, row, evidence, and proposal borders retain their observed contextual variations.

**The Explicit State Rule.** State labels remain visible alongside mineral green, amber, and muted red; color reinforces the decision rather than carrying it alone.

## Typography

Headings use self-hosted **DM Sans**; interface copy uses self-hosted **IBM Plex Sans**, both with sans-serif fallback. Their compact proportions keep the hierarchy clear without exaggerated display treatment. Monospace is limited to code, hashes, and exact identities; source locators retain interface typography and wrap.

The frontmatter headline and title roles describe the default h1 and h2. Page headlines adapt to available width: the wide layout uses 32px; the intermediate page heading uses 25px; mobile uses 27px. The welcome screen separately uses 45px, reduced to 34px on mobile. There is no fixed-ratio type scale.

Body inheritance is 14px; paragraphs use a 1.65 line height and a maximum measure of 74ch. Most operational content uses 11–13px. Final source and object names use 13px, with source names at 12px on mobile; source metadata and authority use 11px, reduced to 10px on mobile. Table headings and source state badges use 11px, reduced to 10px on mobile. Preserve these final overrides rather than copying the earlier, smaller declarations in the stylesheet.

## Layout

The desktop shell has a fixed navigation rail (226px), a top bar (67px), a mode bar (55px), a flexible work area, and a status footer. Main content normally uses 36px / 34px / 38px top / horizontal / bottom padding. Source collections use a flexible ledger and a 224px explanatory rail with a 31px gap; contextual inspection replaces the explanatory rail.

The inspector is a sticky, independently scrolling white region (376px wide), separated by a fine vertical rule. Forms stack with 16px gaps; inline groups use small gaps and wrap. Tables collapse borders and use horizontal rules, with 17px vertical cell padding by default. Containment wrappers allow table scrolling where needed.

Responsive behavior follows the actual breakpoints:

- At **1600px and above**, the navigation grows to 240px, main padding to 42px 48px, and the source explanatory rail to 250px with a 40px gap.
- At **1250px and below**, the navigation narrows to 205px, explanatory notes disappear, and the inspector narrows to 355px. Review layouts simplify further when inspection is open.
- At **1000px and below**, the inspector moves beneath the main pane; opening it focuses and scrolls to its heading. Review lists become a horizontal strip, and review detail takes one column.
- At **760px and below**, navigation becomes an off-canvas drawer. The closed drawer is hidden from interaction. Main padding becomes 27px 20px 35px; top and mode bars shrink to 60px and 51px. Source rows retain name, authority, and status while hiding the added-date and trailing action columns. Names wrap. Search opens explicitly from its named icon control, and settings/forms stack.

The `spacing` frontmatter entries are observed recurring measurements, not a newly imposed spacing framework.

## Elevation & Depth

Resting content is flat: paper-to-white tonal changes and one-pixel rules establish structure. Shadows belong to transient layers only: workspace menus, search results, the creation dialog, notices, and the open mobile drawer. Exact shadow values live in the sidecar. The creation dialog also uses a translucent green-black backdrop.

Motion confirms state: buttons transition background and border color over 0.15s; the mobile drawer moves over 0.2s ease-out; notices enter over 0.2s ease-out with a small vertical shift and blur clearing. Running indicators rotate over 2s linearly. Reduced-motion preferences disable transitions and animation.

## Shapes

Corners are gently squared: badges and compact marks use the smallest radius, fields and evidence passages a slightly softer radius, ordinary controls the shared control radius, and larger panels the panel radius. The creation dialog has the softest corners. These values are in the frontmatter. Tables, section rules, and underlined mode tabs retain square structural edges. Tiny circular dots supplement status labels; file silhouettes and restrained Lucide strokes mark object types.

## Components

### Buttons

Primary actions are mineral green with white text; secondary actions are white with a fine border. Both use shared control corners and 8px 13px padding, a minimum height of 36px, and 500 weight. Hover deepens the primary fill or lightly tints the secondary surface. Disabled buttons use 0.46 opacity and a not-allowed cursor. Text actions keep a transparent ground and underline on hover. Icon actions are compact, transparent controls with muted icons and explicit accessible names.

All interactive controls inherit the visible focus treatment: a 2px solid focus-green outline offset by 3px. Programmatically focused inspector and dialog headings use their specific focus handling rather than an interactive ring.

### Fields

Inputs, textareas, and selects use white surfaces, fine field borders, field corners, and 9px 10px padding. Labels sit above their controls; hints use readable supporting text. Textareas resize vertically. Checkboxes use mineral green and a 15px square. The implemented error treatment is a separate textual error panel; do not infer a red field-border state that does not exist.

### Navigation and filters

Sidebar items are left-aligned rows with muted pale text and consistent icons. Active or hovered workspace items use a lighter green-black fill; active icons become pale leaf. Product modes use a two-pixel bottom border for selection. Segmented filters use a soft green selected fill and support wrapping. Current pages and pressed filters expose their state semantically where implemented.

### Status badges

Small rectangular labels use neutral, green, amber, or red text/background pairs. They are informational spans, not clickable chips. Preserve the explicit words and the compact line height. Source-table badge sizes follow the responsive rules above.

### Evidence and review containers

Evidence passages use a pale inset surface, a fine border, field corners, a locator, and wrapping preformatted source text. Proposal detail uses a white bordered panel with panel corners and 27px padding, reduced to 20px 16px on mobile. Selected proposals use a soft green fill and stronger border. These are content containers without resting shadows.

### Ledger rows and inspector

Names are the primary row action; metadata sits below, with authority and state in adjacent columns. Row hover uses a pale green tint. Preserve native tables and focusable name actions. The inspector presents identity, status, evidence, attributes, and governed actions in a stable reading order, with a named close control. On narrow screens, its focus/scroll handoff and return focus are part of the component contract.

## Do's and Don'ts

### Do:

- Do pair state color with readable state text.
- Do retain the final readable metadata sizes and muted-text treatment when extending tables.
- Do use the shared focus outline on interactive controls and give icon-only actions an accessible name.
- Do preserve the linear inspector handoff on narrow screens and restore focus when it closes.
- Do keep exact hashes and code in monospace and allow long identities and locators to wrap.

### Don't:

- Don't replace the ledger with a marketing dashboard or decorative raster composition.
- Don't add shadows to ordinary evidence, proposal, or table surfaces.
- Don't use color alone to distinguish accepted state, pending review, or failure.
- Don't hide source authority or status when reducing the source table for mobile.
