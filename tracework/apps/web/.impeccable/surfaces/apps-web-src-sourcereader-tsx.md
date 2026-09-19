---
version: 1
slug: "apps-web-src-sourcereader-tsx"
primary_target: "apps/web/src/SourceReader.tsx"
related_targets: ["apps/web/src/PdfReader.tsx","apps/web/src/style.css"]
---

# Source reader

Scope: source viewing and optional text editing. Mode: Read, with an explicit Operate editing state. Extend the existing workbench; retain its palette, typography, source inspector, and version model. Code-led local extension; no concept roll needed.

## Direction contract

THESIS: Put the actual document at reading scale. Extracted passages remain evidence tools, while opening a source name leads to the complete original.

OWN-WORLD: Inherit Tracework's warm paper, white document surface, mineral green actions, fine rules, DM Sans headings, and IBM Plex Sans reading text.

STORY: Open a source, read its version, optionally edit Markdown or text, and save a new immutable version. Earlier originals and citations remain available.

FIRST VIEWPORT: A back action, source name, compact version selector and download/edit controls sit above a wide document. Markdown has a readable measure; PDF pages have page and zoom controls. Mobile wraps the toolbar and fits pages to the available width.

FORM: Extend the source collection with an in-place document reader and preserve the existing inspector for evidence and policy. Local extension, seed key: not applicable. Signature interaction: switching Read → Edit → Save new version keeps the document and its version identity together.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
