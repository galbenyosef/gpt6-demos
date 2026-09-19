# Local API

The executable routes are in `apps/server/src/app.ts`; shared command validation is in `packages/contracts/index.ts`. All workspace IDs in path/body are checked against the current workspace. Request bodies are strict schemas where commands are defined. [Generated shared schemas](contracts.schema.json) can be refreshed with `bun scripts/api-schema.ts`. Errors return a structured error code/message and HTTP status; conflicts use 409.

First GET `/api/session`, retain its HttpOnly cookie, and read the returned CSRF token. All mutating requests require the allowed local `Origin` and `x-tracework-csrf` header. The API has no cross-origin CORS allowance. Health is public on the loopback interface; other API reads require the local session.

In the table below, `W` means `/api/workspaces/:workspaceId`.

| Route | Methods / purpose |
| --- | --- |
| `/api/health`, `/api/diagnostics` | GET runtime/capabilities and local diagnostics |
| `/api/workspaces` | GET saved workspaces; POST `{name,description?}` |
| `W` | GET workspace; PATCH metadata/archive status |
| `W/settings` | PATCH internal-AI consent with reason |
| `W/overview?version=:id` | GET composed workbench state at an accepted version |
| `W/sources` | GET; POST multipart `file`, `classification`, `authority` |
| `W/sources/:id/versions` | POST replacement original, asynchronous extraction |
| `W/sources/:id?version=:id` | GET immutable version/evidence; PATCH current policy |
| `W/sources/:id/original?version=:id` | GET exact original bytes |
| `W/sources/:id/content?version=:id` | GET `{text}` for Markdown, text, JSON, YAML, CSV or HTML; HTML stays inert |
| `W/sources/:id/content` | POST `{expectedVersionId,text}` to save Markdown/text as a new immutable version and queue extraction; 409 if a newer version exists, including queued uploads |
| `/api/pdf-assets/:group/:file` | GET local PDF.js character maps, standard fonts or WASM assets; session required |
| `W/evidence?q=:query` | GET lexical FTS5 matches, including historical revisions |
| `W/evidence/catalog?offset=:n` | GET 200 citation choices plus total |
| `W/evidence/:id` | GET verified citation, source and dependents |
| `W/context/:versionId?` | GET exact accepted snapshot |
| `W/context/diff?from=:id&to=:id` | GET semantic version difference |
| `W/context` | POST atomic human command (below) |
| `W/proposals` | GET; POST schema-validated draft |
| `W/proposals/:id/accept` | POST expected head, selection, reason and explicit evidence exceptions |
| `W/proposals/:id/reject` | POST reason |
| `W/proposals/:id/derive`, `/validate` | POST derived draft or validation input |
| `W/decisions`, `W/guardrails` | GET historical typed objects; edits use context commands |
| `W/views/:id` | GET; PUT scene with expectedSceneRevision, contextVersionId, projection, name, elements, hiddenIds |
| `W/views/:id/export` | GET SVG projection |
| `W/artifacts` | GET; POST queues generation |
| `W/artifacts/:id` | GET immutable content and manifest |
| `W/artifacts/:id/download` | GET document/package export |
| `W/artifacts/:id/edit`, `/review`, `/execute` | POST new revision, review, or optional isolated execution |
| `W/repositories` | GET; POST local absolute repository path/name |
| `W/repositories/:id/import` | POST commit/ref; queues pinned read-only import |
| `W/repositories/:id/compare` | POST before/after snapshot IDs |
| `W/validation-runs` | GET; POST queues deterministic validation |
| `W/findings/:id` | PATCH disposition and comment |
| `W/impacts` | GET dependency paths for selected IDs |
| `W/agent-runs` | POST bounded TaskInput; returns durable run |
| `W/runs/:id` | GET run, context plan, events and tool activity |
| `/api/runs/:id/events` | GET SSE; resume using Last-Event-ID |
| `W/runs/:id/cancel`, `/retry` | POST explicit run actions |
| `W/runs/:id/approval` | POST approved flag and exact stateHash |
| `W/audit` | GET immutable review history |
| `/api/backups` | GET available backups |
| `W/backups`, `W/backups/:id/restore` | POST queued backup or restore into a separate directory |
| `W/checkpoints` | GET; POST name to save snapshot export |
| `W/checkpoints/:id/clone` | POST independent remapped workspace |
| `/api/demo`, `W/demo/change`, `W/demo/reset` | POST labelled example actions; reset rejects real workspaces |

A direct command has this shape (IDs come from API responses):

```json
{
  "expectedContextVersionId": "CURRENT_HEAD",
  "idempotencyKey": "UNIQUE_CLIENT_COMMAND_ID",
  "reason": "Reviewed with the domain owner",
  "operations": [{
    "id": "OPERATION_ID",
    "action": "create",
    "localId": "new-edition",
    "value": {
      "kind": "element",
      "type": "domain-concept",
      "name": "Edition",
      "description": "A particular publication of a book",
      "attributes": {"definition": "A particular publication of a book", "aliases": []},
      "classification": "internal",
      "assertion": "human-assumed",
      "evidenceIds": []
    }
  }]
}
```

`create`, `update` and `supersede` operations apply together. New relationships may reference create-operation local IDs. Reusing an idempotency key with different content fails. Source-stated/inferred values require verified citations or a human evidence exception; agents cannot grant exceptions or call accepted-state commands.

Large operations return 202 with a persisted run ID. Poll the run or subscribe to SSE; reconnecting does not restart work. Explicit retries preserve attempt history and may incur another model charge. A missing API key or unqualified Docker profile returns a capability error, never fabricated results.
