# Tracework

An AI solution-engineering workbench that connects source evidence, reviewed models, architecture decisions, generated artifacts, and change analysis.

This directory currently contains specifications, not an implemented application.

- [Tracework product specification](specs/TRACEWORK-PRODUCT-SPEC.md) is the implementation contract for the local application: Bun, `Bun.serve`, `bun:sqlite`, the OpenAI Agents SDK for TypeScript, React, and Excalidraw.
- [Original Loom full product specification](specs/LOOM-FULL-PRODUCT-SPEC.md) is preserved unchanged for comparison. Its technology choices and broader requirements do not override the Tracework specification.

The Tracework specification includes a comparison matrix, explicit scope boundaries, a repeatable demonstration scenario, Bun compatibility checks, and acceptance criteria. Bun is the application runtime, package manager, and unit/integration test runner; the generated service template also targets Bun and SQLite. The original document retains its original name, terminology, and contents.

No application implementation, deployment, or migration of existing application data is part of this specification change.
