import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import SwaggerParser from "@apidevtools/swagger-parser";
import { zipSync, strToU8 } from "fflate";
import {
  ArtifactKind,
  GeneratedFiles,
  ensure,
} from "../../../../packages/contracts";
import type {
  Artifact,
  Manifest,
  Check,
  ObjectRevision,
  SourceVersion,
  Evidence,
  Classification,
} from "../../../../packages/contracts";
import { Store, id, now, hash, encode } from "../storage/store";
import { mostRestricted, classificationOfEvidence } from "./sources";
import { validEvidence } from "./model";
const names: Record<string, string> = {
  specification: "Solution specification",
  "architecture-report": "Architecture and decisions",
  openapi: "API contract",
  "json-schema": "Domain schemas",
  "test-plan": "Requirement test plan",
  "implementation-package": "Implementation package",
  "service-module": "Bun service module",
  "validation-report": "Validation report",
};
export function manifest(
  s: Store,
  w: string,
  versionId: string,
  selected: string[],
  inputIds: string[] = [],
  runId: string | null = null,
  model: string | null = null,
): Manifest {
  const snap = s.snapshot(w, versionId);
  const objects = selected.length
    ? snap.objects.filter((o) => selected.includes(o.id))
    : snap.objects;
  ensure(
    selected.every((oid) => objects.some((o) => o.id === oid)),
    "INVALID_SCOPE",
    "Selected artifact objects are outside the snapshot",
  );
  const evidenceIds = [...new Set(objects.flatMap((o) => o.evidenceIds))];
  const svs: Record<string, string> = {};
  for (const eid of evidenceIds) {
    const e = validEvidence(s, w, eid),
      v = s.get<SourceVersion>("source-version", w, e.sourceVersionId);
    svs[v.id] = v.hash;
  }
  const inputArtifacts: Record<string, string> = {};
  let classification: Classification = mostRestricted(
    ...objects.map((o) => o.classification),
    classificationOfEvidence(s, w, evidenceIds),
  );
  for (const aid of inputIds) {
    const a = s.get<Artifact>("artifact", w, aid);
    inputArtifacts[a.id] = a.hash;
    classification = mostRestricted(classification, a.manifest.classification);
  }
  return {
    workspaceId: w,
    contextVersionId: versionId,
    objectRevisions: Object.fromEntries(
      objects.map((o) => [o.id, o.revisionId]),
    ),
    sourceVersions: svs,
    evidenceIds,
    inputArtifacts,
    scope: selected.length ? "selected-objects" : "whole-workspace",
    classification,
    runtime: `Bun ${Bun.version}`,
    sdkVersion: "0.18.0",
    model,
    runId,
    templateVersion: "bun-service-1",
    promptVersion: "tracework-1",
    schemaVersion: "1",
    generatedAt: now(),
    missingChecks: ["Semantic consistency review not run"],
    repositoryReferences: Object.keys(svs)
      .map((vid) => s.get<SourceVersion>("source-version", w, vid).metadata)
      .filter((m) => m.commit),
  };
}
function localReferences(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value)) {
    if (key === "$ref")
      ensure(
        typeof v === "string" && v.startsWith("#/"),
        "EXTERNAL_REFERENCE",
        "Only in-document schema references are allowed",
      );
    else localReferences(v);
  }
}
export async function validateArtifactContent(
  kind: string,
  content: string,
  m: Manifest,
  s: Store,
): Promise<Check[]> {
  const checks: Check[] = [];
  try {
    for (const eid of m.evidenceIds) validEvidence(s, m.workspaceId, eid);
    const snap = s.snapshot(m.workspaceId, m.contextVersionId);
    ensure(
      Object.entries(m.objectRevisions).every(([oid, rev]) =>
        snap.objects.some((o) => o.id === oid && o.revisionId === rev),
      ),
      "INVALID_PROVENANCE",
      "Manifest revisions do not resolve",
    );
    checks.push({
      id: "provenance",
      origin: "deterministic",
      result: "pass",
      message: "Input revisions and citations resolve",
      objectIds: Object.keys(m.objectRevisions),
    });
    if (kind === "openapi") {
      const schema = JSON.parse(content);
      ensure(
        schema.openapi?.startsWith("3.1."),
        "INVALID_OPENAPI",
        "OpenAPI 3.1 is required",
      );
      localReferences(schema);
      await SwaggerParser.validate(schema, { resolve: { external: false } });
      checks.push({
        id: "openapi",
        origin: "deterministic",
        result: "pass",
        message: "OpenAPI 3.1 schema and internal references are valid",
        objectIds: [],
      });
    }
    if (kind === "json-schema") {
      const schema = JSON.parse(content);
      localReferences(schema);
      const ajv = new Ajv2020({ strict: false, validateFormats: true });
      addFormats(ajv);
      ajv.compile(schema);
      checks.push({
        id: "json-schema",
        origin: "deterministic",
        result: "pass",
        message: "JSON Schema 2020-12 compiles without external references",
        objectIds: [],
      });
    }
    if (kind === "test-plan") {
      const plan = JSON.parse(content) as {
        cases: { requirementId: string; steps: string[]; expected: string }[];
        omissions: { requirementId: string; reason: string }[];
      };
      ensure(
        Array.isArray(plan.cases) && Array.isArray(plan.omissions),
        "INVALID_TEST_PLAN",
        "Test plan must contain cases and omissions",
      );
      const requirements = snap.objects.filter(
        (o) =>
          o.kind === "element" &&
          o.type === "requirement" &&
          m.objectRevisions[o.id],
      );
      for (const r of requirements)
        ensure(
          plan.cases.some(
            (c) => c.requirementId === r.id && c.steps.length && c.expected,
          ) || plan.omissions.some((c) => c.requirementId === r.id && c.reason),
          "UNMAPPED_REQUIREMENT",
          `Requirement ${r.name} is not mapped`,
        );
      for (const c of plan.cases)
        ensure(
          requirements.some((r) => r.id === c.requirementId),
          "INVALID_MAPPING",
          "A test case refers to an unselected requirement",
        );
      checks.push({
        id: "requirement-mapping",
        origin: "deterministic",
        result: "pass",
        message: "Selected requirements have test cases or explicit omissions",
        objectIds: requirements.map((r) => r.id),
      });
    }
    if (kind === "service-module") {
      const files = JSON.parse(content);
      validateGeneratedFiles(files.generated);
      checks.push({
        id: "execution",
        origin: "deterministic",
        result: "not-run",
        message:
          "Type checking, migration, contract checks and tests have not executed in Docker",
        objectIds: [],
      });
    }
    if (kind === "implementation-package") {
      const p = JSON.parse(content);
      ensure(
        p.files && p.files["IMPLEMENTATION_BRIEF.md"],
        "INVALID_PACKAGE",
        "Package must contain a coding-agent brief",
      );
      checks.push({
        id: "package",
        origin: "deterministic",
        result: "pass",
        message: "Readable brief and input manifest included",
        objectIds: [],
      });
    }
  } catch (e) {
    checks.push({
      id: "content-validation",
      origin: "deterministic",
      result: "block",
      message: (e as Error).message,
      objectIds: [],
    });
  }
  return checks;
}
export function validateGeneratedFiles(input: unknown) {
  const files = GeneratedFiles.parse(input);
  const paths = new Set<string>();
  let bytes = 0;
  for (const f of files) {
    ensure(
      /^(src\/generated\/[a-zA-Z0-9_/-]+\.ts|tests\/generated\/[a-zA-Z0-9_/-]+\.test\.ts|migrations\/[0-9]+_[a-zA-Z0-9_-]+\.sql)$/.test(
        f.path,
      ) &&
        !f.path.includes("..") &&
        !f.path.includes("//"),
      "UNSAFE_PATH",
      "Generated files must stay inside declared source, migration, and test directories",
    );
    ensure(
      !paths.has(f.path),
      "DUPLICATE_PATH",
      "Generated file paths must be unique",
    );
    paths.add(f.path);
    bytes += f.content.length;
  }
  ensure(
    bytes <= 500000,
    "GENERATION_LIMIT",
    "Generated file content exceeds 500 KB",
  );
  return files;
}
function specText(objects: ObjectRevision[], version: number) {
  return (
    `# Solution specification\n\nAccepted context version ${version}.\n\n` +
    objects
      .map(
        (o) =>
          `## ${o.name}\n\n${o.kind === "element" ? o.type : o.kind} · ${o.assertion}\n\n${o.description}\n\n${o.kind === "element" && o.attributes.acceptanceCriteria ? o.attributes.acceptanceCriteria.map((x) => `- ${x}`).join("\n") : ""}\n\nEvidence: ${o.evidenceIds.join(", ") || "Human-authored assumption"}\n`,
      )
      .join("\n")
  );
}
export function generatedDiff(
  files: { path: string; content: string }[],
  before: { path: string; content: string }[] = [],
) {
  return files
    .map((f) => {
      const prev = before.find((p) => p.path === f.path)?.content ?? "";
      if (prev === f.content) return "";
      return `--- ${prev ? "a/" + f.path : "/dev/null"}\n+++ b/${f.path}\n@@ -${prev ? "1," + prev.split("\n").length : "0,0"} +1,${f.content.split("\n").length} @@\n${
        prev
          ? prev
              .split("\n")
              .map((l) => "-" + l)
              .join("\n") + "\n"
          : ""
      }${f.content
        .split("\n")
        .map((l) => "+" + l)
        .join("\n")}`;
    })
    .filter(Boolean)
    .join("\n");
}
export async function generateArtifact(
  s: Store,
  w: string,
  input: {
    kind: string;
    contextVersionId: string;
    selectedIds?: string[];
    inputArtifactIds?: string[];
    content?: string;
    runId?: string;
    model?: string;
    artifactId?: string;
  },
  fence = () => {},
) {
  const kind = ArtifactKind.parse(input.kind),
    m = manifest(
      s,
      w,
      input.contextVersionId,
      input.selectedIds ?? [],
      input.inputArtifactIds ?? [],
      input.runId ?? null,
      input.model ?? null,
    ),
    snap = s.snapshot(w, input.contextVersionId),
    objects = snap.objects.filter((o) => m.objectRevisions[o.id]);
  ensure(
    objects.length || kind === "validation-report",
    "EMPTY_SCOPE",
    "Accept some model content before generating this artifact",
  );
  let content = input.content,
    contentType = "text/markdown";
  if (!content) {
    if (kind === "specification")
      content = specText(objects, snap.version.sequence);
    else if (kind === "architecture-report")
      content =
        `# Architecture and decisions\n\nContext version ${snap.version.sequence}\n\n` +
        objects
          .filter(
            (o) =>
              o.kind === "decision" ||
              (o.kind === "element" &&
                [
                  "software-system",
                  "container",
                  "component",
                  "interface",
                  "quality-attribute",
                  "constraint",
                ].includes(o.type)),
          )
          .map(
            (o) =>
              `## ${o.name}\n\n${o.description}\n\n${o.kind === "decision" ? `Context: ${o.context}\n\nAlternatives: ${o.alternatives.join("; ")}\n\nChosen: ${o.chosen}\n\nConsequences:\n${o.consequences.map((c) => "- " + c).join("\n")}\n\nRisks: ${o.risks.join("; ")}` : ""}`,
          )
          .join("\n");
    else if (kind === "openapi") {
      const concepts = objects.filter(
        (o) => o.kind === "element" && o.type === "domain-concept",
      );
      ensure(
        concepts.length,
        "NO_CONCEPTS",
        "Select domain concepts to generate an initial API contract",
      );
      const paths: Record<string, unknown> = {};
      for (const o of concepts) {
        const slug = o.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        paths["/" + slug] = {
          get: {
            operationId: "list_" + slug.replace(/-/g, "_"),
            summary: "List " + o.name,
            description: o.description,
            responses: {
              "200": {
                description: "Records",
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Record" },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "create_" + slug.replace(/-/g, "_"),
            summary: "Create " + o.name,
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RecordInput" },
                },
              },
            },
            responses: {
              "201": {
                description: "Created record",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Record" },
                  },
                },
              },
              "400": { description: "Invalid input" },
            },
          },
        };
      }
      content = encode({
        openapi: "3.1.0",
        info: {
          title: s.getWorkspace(w).name,
          version: `0.${snap.version.sequence}.0`,
          description:
            "Draft contract derived from selected concepts. Review behavior and field requirements before accepting.",
        },
        paths,
        components: {
          schemas: {
            RecordInput: {
              type: "object",
              required: ["name"],
              properties: { name: { type: "string", minLength: 1 } },
              additionalProperties: false,
            },
            Record: {
              type: "object",
              required: ["id", "name"],
              properties: { id: { type: "string" }, name: { type: "string" } },
            },
          },
        },
      });
    } else if (kind === "json-schema") {
      content = encode({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: s.getWorkspace(w).name,
        type: "object",
        $defs: Object.fromEntries(
          objects
            .filter((o) => o.kind === "element" && o.type === "domain-concept")
            .map((o) => [
              o.id,
              {
                type: "object",
                description: o.description,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                },
                required: ["id", "name"],
                additionalProperties: false,
              },
            ]),
        ),
      });
    } else if (kind === "test-plan") {
      content = encode({
        contextVersion: snap.version.sequence,
        cases: objects
          .filter((o) => o.kind === "element" && o.type === "requirement")
          .map((o) => ({
            id: id(),
            requirementId: o.id,
            title: o.name,
            steps: [
              `Arrange the preconditions for: ${o.description}`,
              "Exercise the accepted behavior with valid and invalid inputs",
            ],
            expected:
              o.kind === "element"
                ? o.attributes.acceptanceCriteria?.join("; ") || o.description
                : o.description,
            execution: "Not run",
          })),
        omissions: [],
      });
    } else if (kind === "implementation-package") {
      const inputs = (input.inputArtifactIds ?? []).map((aid) =>
        s.get<Artifact>("artifact", w, aid),
      );
      const brief = `# Implementation brief\n\nWorkspace: ${s.getWorkspace(w).name}\nAccepted version: ${snap.version.sequence}\n\n## Scope\n${objects.map((o) => `- ${o.name}: ${o.description}`).join("\n")}\n\n## Unresolved questions and assumptions\n${
        objects
          .filter(
            (o) =>
              o.kind === "element" &&
              ["open-question", "assumption", "risk"].includes(o.type),
          )
          .map((o) => `- ${o.name}: ${o.description}`)
          .join("\n") ||
        "None recorded in selected scope; this is not proof that none exist."
      }\n\n## Constraints and decisions\n${objects
        .filter(
          (o) =>
            o.kind === "decision" ||
            (o.kind === "element" &&
              ["constraint", "invariant", "policy"].includes(o.type)),
        )
        .map((o) => `- ${o.name}: ${o.description}`)
        .join(
          "\n",
        )}\n\n## Required checks\nType checking, input validation, migration, API contract, requirement mapping, and unit/integration tests. Execution is not implied by this package.\n\n## Permitted flexibility\nInternal implementation details may change while accepted behavior, contracts, constraints, and evidence-backed meaning are preserved. Material changes require a new decision.\n`;
      const files: Record<string, string> = {
        "IMPLEMENTATION_BRIEF.md": brief,
        "solution.md": specText(objects, snap.version.sequence),
        "model.json": JSON.stringify(objects, null, 2),
        "evidence.json": JSON.stringify(
          m.evidenceIds.map((e) => s.get<Evidence>("evidence", w, e)),
          null,
          2,
        ),
        "manifest.json": JSON.stringify(m, null, 2),
      };
      for (const a of inputs)
        files[
          `artifacts/${a.id}.${a.contentType.includes("json") ? "json" : "md"}`
        ] = await s.blobFile(a.hash).text();
      content = encode({ files });
    } else if (kind === "validation-report")
      content = JSON.stringify(
        {
          contextVersion: snap.version,
          findings: s.list("finding", w),
          scope:
            "Recorded deterministic and advisory findings; missing checks remain unperformed.",
        },
        null,
        2,
      );
    else
      ensure(
        false,
        "AI_REQUIRED",
        "Service generation requires a bounded generator run and an accepted API contract",
      );
  }
  if (
    [
      "openapi",
      "json-schema",
      "test-plan",
      "implementation-package",
      "service-module",
      "validation-report",
    ].includes(kind)
  )
    contentType = "application/json";
  if (contentType === "application/json")
    try {
      content = JSON.stringify(JSON.parse(content!), null, 2);
    } catch {}
  const checks = await validateArtifactContent(kind, content!, m, s);
  const h = await s.blob(content!);
  if (input.runId) {
    const prior = s
      .list<Artifact>("artifact", w)
      .find(
        (a) =>
          a.manifest.runId === input.runId &&
          a.hash === h &&
          a.kind === kind &&
          a.manifest.contextVersionId === m.contextVersionId,
      );
    if (prior) return prior;
  }
  const artifactId = input.artifactId ?? id();
  const previous = s
    .list<Artifact>("artifact", w)
    .filter((a) => a.artifactId === artifactId);
  const a: Artifact = {
    id: id(),
    artifactId,
    workspaceId: w,
    ordinal: Math.max(0, ...previous.map((a) => a.ordinal)) + 1,
    kind,
    name: names[kind]!,
    hash: h,
    contentType,
    manifest: m,
    checks,
    review: "draft",
    createdAt: now(),
  };
  fence();
  s.tx(() => {
    fence();
    s.insert("artifact", w, a);
    s.audit(
      w,
      "artifact.generated",
      { id: a.id, hash: h, contextVersionId: m.contextVersionId },
      input.runId ? "agent" : "human",
    );
  });
  return a;
}
export function artifactFreshness(s: Store, w: string, a: Artifact): Check[] {
  const current = s.snapshot(w),
    map = new Map(current.objects.map((o) => [o.id, o.revisionId]));
  const changed: string[] = [];
  if (
    a.manifest.scope === "whole-workspace" &&
    a.manifest.contextVersionId !== current.version.id
  )
    changed.push(current.version.id);
  for (const [oid, rev] of Object.entries(a.manifest.objectRevisions))
    if (map.get(oid) !== rev) changed.push(oid);
  for (const vid of Object.keys(a.manifest.sourceVersions)) {
    const v = s.get<SourceVersion>("source-version", w, vid);
    const source = s.get<{ id: string; latestVersionId: string }>(
      "source",
      w,
      v.sourceId,
    );
    if (source.latestVersionId !== vid) changed.push(v.sourceId);
  }
  for (const aid of Object.keys(a.manifest.inputArtifacts)) {
    const input = s.get<Artifact>("artifact", w, aid);
    if (
      s
        .list<Artifact>("artifact", w)
        .some(
          (next) =>
            next.artifactId === input.artifactId &&
            next.ordinal > input.ordinal &&
            next.review === "accepted",
        )
    )
      changed.push(input.artifactId);
  }
  return [
    {
      id: "freshness",
      origin: "staleness",
      result: changed.length ? "warn" : "pass",
      message: changed.length
        ? "Declared inputs changed; review required"
        : "Declared inputs match current accepted revisions",
      objectIds: [...new Set(changed)],
    },
  ];
}
export async function exportArtifact(s: Store, w: string, aid: string) {
  const a = s.get<Artifact>("artifact", w, aid);
  const content = await s.blobFile(a.hash).text();
  if (a.kind === "implementation-package" || a.kind === "service-module") {
    const p = JSON.parse(content);
    const files: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(p.files ?? {})) {
      ensure(
        !k.startsWith("/") && !k.includes(".."),
        "UNSAFE_PATH",
        "Unsafe package path",
      );
      files[k] = strToU8(String(v));
    }
    if (p.generated) {
      const { trustedTemplate } = await import("./execution");
      Object.assign(
        files,
        Object.fromEntries(
          Object.entries(await trustedTemplate()).map(([k, v]) => [
            k,
            strToU8(v),
          ]),
        ),
      );
      for (const f of validateGeneratedFiles(p.generated))
        files[f.path] = strToU8(f.content);
      files["generation.diff"] = strToU8(generatedDiff(p.generated));
    }
    files["tracework-manifest.json"] = strToU8(
      JSON.stringify(
        {
          ...a.manifest,
          artifactId: a.id,
          hash: a.hash,
          review: a.review,
          checks: a.checks,
          freshness: artifactFreshness(s, w, a),
        },
        null,
        2,
      ),
    );
    return { bytes: zipSync(files), type: "application/zip", extension: "zip" };
  }
  return {
    bytes: new TextEncoder().encode(content),
    type: a.contentType,
    extension: a.contentType.includes("json") ? "json" : "md",
  };
}
export function reviewArtifact(
  s: Store,
  w: string,
  aid: string,
  status: "reviewed" | "accepted",
  reason: string,
) {
  const a = s.get<Artifact>("artifact", w, aid);
  ensure(
    reason.trim(),
    "REASON_REQUIRED",
    "Record why this artifact is being reviewed",
  );
  ensure(
    !a.checks.some((c) => c.result === "block"),
    "ARTIFACT_INVALID",
    "Resolve deterministic failures before review",
  );
  if (status === "accepted" && a.kind === "service-module")
    ensure(
      a.execution?.passed && a.execution.hash === a.hash,
      "EXECUTION_REQUIRED",
      "Verified code acceptance requires all isolated execution gates to pass for these exact bytes",
    );
  s.tx(() => {
    s.update("artifact", w, { ...a, review: status });
    s.audit(w, "artifact.reviewed", { artifactId: aid, status, reason });
  });
  return { ...a, review: status };
}
