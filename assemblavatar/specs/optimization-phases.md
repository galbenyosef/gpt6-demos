# Assemblavatar — User-directed optimization phases

Status: Proposed improvement specification; not implemented by this document.

Date: 2026-09-15

Parent specification: [assemblavatar.md](assemblavatar.md)

## 1. Purpose

Let a user continue improving an existing result without starting over, losing the intended modelling profile, or spending a phase merely re-evaluating unchanged geometry.

A typical request is:

> Start from result 2. Use these new photographs to improve the nose and jaw. Preserve the hairstyle and overall head proportions. Make two improvements and show each result.

The workflow applies to avatars, objects, architecture and scenes. It retains Bun, Three.js, the isolated procedural runtime, editable TypeScript source and GPT-6 Astra as the sole generative model.

This specification extends the parent specification's refinement, draft visibility, reference handling and revision workflows. Its explicit optimization-phase requirements govern this new workflow where existing pass semantics differ.

## 2. Current limitations motivating this change

These findings come from code inspection; they are not new test results.

| Current behaviour | Consequence |
| --- | --- |
| Draft recovery rebuilds and evaluates the starting source before refinement. | A one-pass request, or a request with Auto-refine disabled, can finish without making a change. |
| An evaluator recommendation of `requires-user-review` ends the loop immediately. | An explicit request to improve a reviewed draft can stop before a refinement is attempted. |
| Opening an assemblage resets the profile to the default for its kind. | An avatar can unintentionally switch from realistic to stylised after uploads or navigation. |
| Reference selection prioritises front-labelled photos and takes the first six. | Newly uploaded photographs can be silently omitted. |
| Recovery preserves source but does not consistently restore feedback, original intent and settings. | Later work can repeat previous mistakes or pursue a different objective. |
| Selected objects and preservation instructions are prompt guidance only. | Other geometry can change despite the user's request to preserve it. |
| Evaluation assesses a candidate without an explicit baseline comparison. | A later candidate can be worse than the result it replaces. |
| A small change requires full program generation, validation, build and rendering. | Refinement can remain slow and expensive even when the requested edit is local. |
| Limits are primarily per request or job; active work is interrupted by restart. | The user lacks a clear overall phase budget and reliable continuation record. |

Implementation entry points:

- `src/backend/services/GenerationService.ts`
- `src/backend/services/WorkspaceService.ts`
- `src/backend/ai/AstraClient.ts`
- `src/backend/config.ts`
- `src/shared/domain.ts`
- `src/frontend/app.tsx`
- `src/backend/render/RenderService.ts`
- `src/backend/persistence/store.ts`

## 3. Definitions and invariants

- **Optimization phase:** One explicit user request to improve a selected saved result using an immutable set of objectives, references, settings and budgets.
- **Baseline:** The selected starting result, including its source, parameters, overrides, model artifact and available feedback. It may be an unaccepted draft or an accepted revision.
- **Refinement attempt:** One request to Astra to change the baseline or a subsequent candidate. Rebuilding, rendering, evaluation and compiler repair do not count as additional refinements.
- **Candidate:** A successfully rendered result produced within a phase.
- **Recommended result:** The candidate judged most suitable for the requested objectives, or the original baseline if no candidate improves on it.

The system SHALL preserve these invariants:

1. Every rendered candidate is persisted and displayed before evaluation or further refinement.
2. A quality shortfall never removes a visible draft or masquerades as a processing failure.
3. Starting another phase does not require accepting the baseline as a canonical revision.
4. The selected baseline remains available and unchanged throughout the phase.
5. No number of repeated phases guarantees convergence or photographic likeness.
6. Repeated phases are permitted; resource limits apply separately to each phase.

## 4. User workflow

### 4.1 Start a phase

Provide **Optimize further** on every renderable saved result, including Results entries and accepted revisions.

The phase configuration SHALL show:

- Starting result, with thumbnail and stable result identifier.
- Improvement instruction and optional prioritised objectives.
- Areas or properties to preserve, with their enforcement level visible.
- Selected reference photographs and view labels.
- Modelling profile.
- Maximum refinement attempts and overall time budget.
- Previous feedback that will be supplied to Astra.

The primary action SHALL clearly start paid AI work. Do not introduce a second confirmation after the user has selected the settings and started the phase.

### 4.2 During work

Keep the baseline visible until the first new candidate is ready. Thereafter, display each new rendered candidate immediately.

Show the current stage, elapsed phase time, refinement count, remaining configured budget and available evaluation feedback. The user SHALL be able to inspect earlier results while subsequent work continues.

Use wording such as **Refinement 1 of 2**, **Repairing candidate**, and **Comparing with starting result**. Do not count re-evaluation as an improvement.

Cancellation SHALL stop additional work and preserve every result already produced. Settings and references for an active phase remain immutable; edits apply to a subsequent phase.

### 4.3 End of phase

Present the baseline and candidates with:

- Improvements relevant to the user's objectives.
- Regressions and remaining problems.
- Any preservation constraints that were violated or could not be verified.
- A recommended result, with an explanation and uncertainty where appropriate.

Allow the user to select any candidate or the baseline for the next phase, continue editing a draft, export a labelled draft, or use the existing revision workflow.

An uncertain or unsatisfactory candidate remains usable as a working draft. It SHALL NOT be labelled as having passed quality checks merely because the user wants to continue working from it.

## 5. Phase execution semantics

The workflow SHALL be:

1. Validate that the selected baseline and references belong to this assemblage.
2. Persist the immutable phase input and budget before calling Astra.
3. Restore the exact baseline source, parameters, overrides, profile and relevant feedback.
4. If needed, rebuild or evaluate the baseline. Record this as preparation, without consuming a refinement attempt.
5. Request an actual refinement using the user's new instruction.
6. Validate and build the returned program, applying the bounded repair policy if necessary.
7. Render, persist and publish the candidate immediately.
8. Compare the candidate with the phase baseline and the best result so far.
9. Continue within the remaining budget, or finish with the appropriate outcome.

### 5.1 One-refinement behaviour

When the user selects one refinement, the system SHALL request one actual source improvement. It SHALL NOT use that allowance only to rebuild and evaluate the unchanged baseline.

A prior `requires-user-review` recommendation SHALL be treated as feedback when the user explicitly starts a new phase. It does not veto the requested first refinement.

This does not override execution validation, provider refusal, unavailable credits, cancellation, missing required input or exhausted budgets. Such conditions may prevent a refinement and must be reported accurately.

### 5.2 Unchanged output

If Astra returns unchanged source, do not label it an optimization or improvement. Record **No source change produced**, retain the baseline, and either use a remaining refinement allowance or finish as Needs review.

### 5.3 Stopping outcomes

Separate processing state from quality outcome:

| Outcome | Meaning |
| --- | --- |
| Completed | The requested objectives were judged satisfied within the available checks. |
| Needs review | Candidates exist, but quality remains insufficient, uncertain or conflicting. |
| Budget reached | The phase stopped at its configured limit; existing results remain usable. |
| Cancelled | The user stopped the phase; existing results remain usable. |
| Interrupted | Execution stopped unexpectedly and may be resumed from a saved checkpoint. |
| Failed | A processing error prevented further work; any existing results remain visible. |

Do not classify poor likeness, failure to improve, or reaching the refinement limit as a technical error.

## 6. Explicit reference selection

Upload storage and AI reference selection SHALL be separate concepts.

- Display which photographs will actually be sent in the phase.
- Support replacing older selected photographs with newly uploaded photographs.
- Never silently omit selected photographs or substitute others based on role ordering.
- If selection exceeds the supported request limit, require the selection to be reduced before starting and display the limit clearly.
- Preserve selected asset IDs, labels, descriptions and order in the phase record.
- Supply the same selected reference set to each operation within the phase, subject to an explicitly defined render-image allocation.

The initial implementation MAY retain the current six-reference limit. Increasing that limit is not required for this improvement. Selection accuracy and transparency are required.

Reference deletion from the workspace SHALL NOT invalidate an existing phase's reproducibility. Retain referenced asset data while saved phases/results depend on it, unless the user explicitly deletes that history too.

## 7. Profile, intent and feedback continuity

Persist the modelling profile on the assemblage and snapshot it into every phase. Uploads, refreshes, result selection and job completion SHALL NOT reset it.

The AI context SHALL distinguish:

1. Original modelling intent.
2. The current phase instruction.
3. Prioritised phase objectives.
4. Baseline evaluation and unresolved issues.
5. Preservation requests and enforced locks.
6. Changes and outcomes from earlier refinements in this phase.

Do not depend on replaying an unlimited chat transcript. Maintain a bounded, inspectable context summary with links to the underlying saved records. The new phase instruction governs intentional changes to older objectives.

When continuing a selected draft, recover its own parameters, overrides and feedback. Do not silently substitute those from a different accepted revision. Distinguish the selected baseline's original references from the new reference set chosen for this phase.

## 8. Targeted improvement and preservation

Support two explicit categories:

- **Preservation request:** Semantic guidance such as “keep the hairstyle.” It is supplied to Astra and reviewed visually, but is not a guaranteed structural lock.
- **Enforced lock:** A supported, verifiable property or object subtree that must remain unchanged, including its effective transforms and relevant geometry/material data.

The UI SHALL distinguish these categories. It must not imply that selecting an object automatically locks everything else.

For enforced locks, compare the candidate's effective scene with the baseline. If a target cannot be matched after regeneration, treat the lock as unverified rather than silently dropping it.

A violating candidate SHALL still be shown, with the violation identified, but cannot be automatically recommended or promoted as satisfying the phase. Future work may repair it within the remaining budget.

If enforced locks are not yet supported, expose only clearly labelled preservation requests. Do not promise enforcement through prompting alone.

## 9. Comparative evaluation and regression handling

Each candidate evaluation SHALL compare against the selected baseline, using the same objectives and selected references. It SHALL report:

- Per-objective outcome: improved, unchanged, worse or uncertain.
- Concrete evidence or visible differences supporting that outcome.
- Remaining defects and their severity.
- Preservation violations or uncertainty.
- Overall recommendation and trade-offs.

Do not invent a numerical identity or likeness score without a defined measurement method. Structured qualitative comparison is sufficient initially.

Retain the best result so far independently of the latest result. A later result is not automatically better. If objectives conflict or comparisons are uncertain, leave the choice to the user and retain the baseline recommendation where appropriate.

The AI request's image budget SHALL explicitly account for references, baseline renders and candidate renders. If all seven views of both results do not fit, use a documented, paired view-selection policy that preserves comparable angles; do not silently truncate the baseline or candidate set.

## 10. Persistence and restart behaviour

Introduce a first-class optimization-phase record, or an equivalent explicit extension of the current job model. It SHALL contain:

- Phase ID, assemblage ID and optional preceding phase ID.
- Baseline attempt/revision, source and artifact identifiers.
- Frozen parameters and overrides.
- Original intent, new instruction, objectives and preservation settings.
- Profile and selected reference snapshots.
- Baseline feedback and context summary.
- Configured budgets and accumulated consumption.
- Execution state, quality outcome, timestamps and stopping reason.
- Candidate identifiers, comparative evaluations and recommended result ID.
- Provider response identifiers and the last completed execution checkpoint.

Each candidate SHALL identify its phase and immediate source result. Record which reference set and settings produced it; linking only to an unrelated accepted revision is insufficient.

On restart, preserve drafts and mark unfinished work Interrupted. Resuming SHALL reuse completed source/build/render work where valid. If a provider response is still retrievable, use its saved identifier rather than submitting the same generation again.

When it is uncertain whether a request was submitted, do not silently duplicate a potentially paid operation. Explain the checkpoint limitation and require an explicit resume/retry action. Resume only the remaining phase budget.

## 11. Resource and cost controls

Retain existing per-request timeouts, sandbox limits, bounded repairs and concurrency controls. A new phase cannot start on an assemblage with another active operation.

Add phase-level accounting for:

- Maximum refinement attempts.
- Maximum total elapsed execution time across preparation, generation, repairs, rendering and evaluation.
- Actual model token usage, including repairs and evaluations.
- Optional estimated monetary budget when a configured, identified pricing basis is available.

Budgets SHALL be checked before starting another paid operation. Reaching a budget preserves results and reports Budget reached. Do not present token accounting as a guaranteed hard monetary ceiling: final request usage may only be known when the provider returns it.

Every operation keeps its own timeout, but the remaining phase time also limits it. Retries and resumed work do not reset accumulated consumption.

## 12. Quality and performance boundaries

The initial improvement continues to optimize procedural source. It does not add photogrammetry, automatic facial landmark fitting, a standard anatomical head model or external 3D generators.

Better photographs may reduce ambiguity, but do not remove limitations in geometric representation, material modelling or visual evaluation. The product SHALL NOT promise that additional phases necessarily produce realistic likeness.

The following are optional later capabilities, not prerequisites for the initial phase workflow:

- Camera-pose matching between reference photos and comparison renders.
- Detail crops or adaptive review views for local objectives.
- Explicit anatomical or domain-specific parameters.
- Validated source patches instead of full-program replacement.
- Incremental geometry builds and selective rendering.
- Measured landmarks and calibrated quality metrics.

Full rebuilds and fixed review views remain acceptable initially, provided their costs and limitations are represented honestly.

## 13. Implementation priorities

### Priority 1 — Reliable continuation

- Explicit baseline and reference selection.
- Persistent profile and complete baseline context.
- Correct one-refinement semantics and handling of prior review outcomes.
- First-class phase identity and candidate lineage.
- Existing immediate draft visibility and Results history preserved.

### Priority 2 — Controlled improvement

- Structured objectives and clearly labelled preservation requests.
- Baseline comparisons, regression reporting and best-result tracking.
- Phase-level budgets and restart checkpoints.

### Priority 3 — Stronger guarantees and efficiency

- Verified structural locks.
- Adaptive reference/render comparisons.
- Parameter fitting, patch generation and incremental computation where supported.

Do not present later capabilities as available until implemented and verified.

## 14. Acceptance criteria

1. Starting from an unaccepted draft with one refinement allowance attempts a source change before deciding whether quality warrants stopping.
2. A prior `requires-user-review` evaluation does not prevent that first requested refinement.
3. Preparation, baseline evaluation and compiler repairs are reported separately from refinement count.
4. Profile selection survives uploads, refresh, result navigation and job completion.
5. With more uploaded photos than the supported reference limit, the exact selected set is visible and no photograph is silently dropped or substituted.
6. Continuing result A uses A's source, parameters, overrides and feedback even when result B is the accepted revision.
7. A candidate appears in the viewport and Results before a deliberately slow evaluation completes.
8. Cancellation, provider failure, time limits and restart retain all completed candidates and their source.
9. Quality shortfall ends as Needs review, without a processing-error banner solely for poor quality.
10. An unchanged source response is labelled as no change, not as a successful improvement.
11. A worse candidate remains visible but does not displace the baseline or best-so-far recommendation merely because it is newer.
12. Comparative feedback identifies improvements, regressions and uncertainty for each requested objective.
13. Preservation requests are visibly distinguished from verified locks; missing lock targets cannot pass verification silently.
14. Phase history identifies the baseline, selected references, profile, instruction, candidates, usage and stopping reason.
15. Resume uses the saved checkpoint and remaining budget; it does not silently duplicate a previously submitted paid request.
16. The user can start a subsequent phase from any renderable saved draft without first promoting it to an accepted revision.

These are future verification requirements. Writing this specification does not authorize implementation, automated tests, live generation or spending API credits. Testing remains paused until the user requests it.
