# Repeatable demonstration

The repair-service materials are fictional. They intentionally disagree about mandatory accounts versus guest appointment requests. A later technician-certification requirement affects scheduling, the API and related tests; the unrelated glossary term should remain untouched.

1. Start Tracework and choose **Open repair-service example**. Wait for preparation to finish. The workspace and recorded run are visibly labelled examples.
2. Inspect `customer-brief.md`, the legacy API and interview notes. Follow citation links and source versions. Explain the account/guest conflict.
3. Open the pending **Resolve guest appointment requests** proposal. Inspect evidence, compare operations, and accept the complete change. Use History to inspect the prior accepted version.
4. Open the model canvas and select the C4 context/container projection. Move a shape and save the layout. Its semantic name and endpoints remain governed by the object forms.
5. Inspect the architecture decision and artifacts. Preview the OpenAPI contract, mapped test plan and standalone implementation brief. Inspect their manifests before downloading.
6. In Validation, choose **Introduce source change**, wait for extraction, then **Run checks**. Follow old-source warnings and dependency paths. Accepted meaning is unchanged until another reviewed command.
7. With an API key configured, scope interpretation, architecture alternatives, a cited question or remediation explicitly. Review resulting drafts. These are live calls; recorded replay never substitutes for them.
8. Save a named checkpoint in Settings, clone it, and verify it has independent IDs. Create a backup and restore it into a separate recovery directory. Switch processes/data directories explicitly when using restored data.

Seed from the CLI with `bun run demo:seed`. Reset only a labelled example with `bun run demo:reset --workspace <example-id>`. Reset archives that example and creates a new one; it refuses a real workspace.

Preparation includes source-ready, accepted-model, architecture and artifact checkpoints. To preserve the introduced-change state, save a checkpoint after extraction and validation. The library fixture in `fixtures/library/brief.md` exercises a second domain without domain-specific app code.

For a recording, use a fresh example clone and keep the example label visible. Recorded runs display saved steps only. Do not call an unexecuted code export verified, or portray synthetic seed history as live inference. Browser test captures are in `.impeccable/review/` and intentionally excluded from Git.
