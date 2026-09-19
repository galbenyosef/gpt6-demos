import { join, resolve } from "node:path";
import { z, ZodError } from "zod";
import {
  AppError,
  ensure,
  WorkspaceInput,
  WorkspaceSettings,
  Classification,
  ArtifactKind,
  ProposalInput,
  SceneInput,
} from "../../../packages/contracts";
import type {
  Workspace,
  Source,
  SourceVersion,
  Evidence,
  Proposal,
  Artifact,
  Run,
  ContextPlan,
  Finding,
} from "../../../packages/contracts";
import { Store, id, now } from "./storage/store";
import {
  createWorkspace,
  humanCommand,
  acceptProposal,
  deriveProposal,
  inspectProposal,
  rejectProposal,
  diffVersions,
  validEvidence,
} from "./modules/model";
import { ingest, extractVersion } from "./modules/sources";
import { Jobs } from "./modules/jobs";
import { AgentRuntime } from "./modules/agent-runtime";
import {
  generateArtifact,
  exportArtifact,
  artifactFreshness,
  reviewArtifact,
  validateArtifactContent,
} from "./modules/artifacts";
import { executionCapability, executeArtifact } from "./modules/execution";
import {
  registerRepository,
  importRepository,
  compareRepositories,
} from "./modules/repository";
import { validateWorkspace, impacts, disposition } from "./modules/validation";
import { saveScene, exportProjection } from "./modules/canvas";
import {
  createBackup,
  listBackups,
  restoreBackup,
  checkpoint,
  cloneCheckpoint,
} from "./modules/backups";
import { seed, resetExample, introduceChange } from "./modules/demo";
export function createApp(
  root: string,
  options: { port?: number; test?: boolean } = {},
) {
  const s = new Store(root),
    jobs = new Jobs(s),
    runtime = new AgentRuntime(s, jobs);
  const port = options.port ?? 4310;
  jobs.register("extract", (r, signal, fence) =>
    extractVersion(
      s,
      r.workspaceId,
      String(r.payload.sourceVersionId),
      signal,
      fence,
    ),
  );
  jobs.register("agent", (r, signal, fence) =>
    runtime.execute(r, signal, fence),
  );
  jobs.register("validate", async (r) => validateWorkspace(s, r.workspaceId));
  jobs.register("artifact", async (r, signal, fence) =>
    generateArtifact(s, r.workspaceId, r.payload as any, fence),
  );
  jobs.register("repository", (r, signal, fence) =>
    importRepository(
      s,
      r.workspaceId,
      String(r.payload.repositoryId),
      String(r.payload.ref),
      signal,
      fence,
    ),
  );
  jobs.register("execute", (r, signal, fence) =>
    executeArtifact(s, r, signal, fence),
  );
  jobs.register("backup", async () => createBackup(s));
  jobs.register("restore", async (r) =>
    restoreBackup(s, String(r.payload.backupId)),
  );
  jobs.register("demo-seed", async () => seed(s));
  jobs.register("checkpoint", async (r) =>
    checkpoint(s, r.workspaceId, String(r.payload.name)),
  );
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  async function body(req: Request, limit = 1024 * 1024) {
    const len = Number(req.headers.get("content-length") || 0);
    ensure(
      len <= limit,
      "BODY_TOO_LARGE",
      "Request exceeds the size limit",
      413,
    );
    const text = await req.text();
    ensure(
      text.length <= limit,
      "BODY_TOO_LARGE",
      "Request exceeds the size limit",
      413,
    );
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError("INVALID_JSON", "Request body must be valid JSON");
    }
  }
  function boundary(req: Request) {
    const host = req.headers.get("host") ?? "";
    const allowed = new Set([
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      `localhost:4311`,
      `127.0.0.1:4311`,
    ]);
    ensure(
      allowed.has(host),
      "INVALID_HOST",
      "Only the configured local application host is allowed",
      403,
    );
    const origin = req.headers.get("origin");
    if (origin)
      ensure(
        [...allowed].some((h) => origin === `http://${h}`),
        "INVALID_ORIGIN",
        "Cross-origin requests are not allowed",
        403,
      );
    if (req.headers.get("sec-fetch-site") === "cross-site")
      throw new AppError(
        "INVALID_ORIGIN",
        "Cross-site requests are not allowed",
        403,
      );
  }
  function session(req: Request, mutating = false) {
    const sid = req.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)tracework_session=([^;]+)/)?.[1];
    ensure(
      sid && s.checkSession(sid),
      "LOCAL_SESSION_REQUIRED",
      "Reload Tracework to create a local session",
      401,
    );
    if (mutating) {
      ensure(
        req.headers.get("origin"),
        "CSRF_REQUIRED",
        "State changes require the local browser origin",
        403,
      );
      const csrf = req.headers.get("x-tracework-csrf");
      ensure(
        csrf && s.checkSession(sid, csrf),
        "CSRF_REQUIRED",
        "Reload before making changes: local session token is missing or expired",
        403,
      );
    }
  }
  async function route(req: Request): Promise<Response> {
    boundary(req);
    const u = new URL(req.url),
      path = u.pathname,
      method = req.method;
    if (path === "/api/health")
      return json({
        ok: true,
        runtime: `Bun ${Bun.version}`,
        sqlite: s.db.query("select sqlite_version() as version").get(),
        schema: 1,
        model: process.env.OPENAI_MODEL || "gpt-6-astra",
        ai: !!process.env.OPENAI_API_KEY,
        execution: await executionCapability(s),
        queue: s.allRuns().filter((r) => r.status === "queued").length,
      });
    if (path === "/api/session" && method === "GET") {
      const token = s.session();
      return Response.json(
        { csrf: token.csrf },
        {
          headers: {
            "Set-Cookie": `tracework_session=${token.sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (!path.startsWith("/api/")) {
      const dist = resolve(import.meta.dir, "../../../dist");
      let target =
        path === "/"
          ? join(dist, "index.html")
          : resolve(dist, "." + decodeURIComponent(path));
      ensure(
        target.startsWith(dist + "/"),
        "INVALID_PATH",
        "Invalid static path",
        403,
      );
      let file = Bun.file(target);
      if (!(await file.exists())) {
        file = Bun.file(join(dist, "index.html"));
      }
      if (!(await file.exists()))
        return new Response(
          "Tracework frontend is not built. Run bun run build, or bun run dev and open http://localhost:4311.",
          { status: 503 },
        );
      return new Response(file, {
        headers: { "X-Content-Type-Options": "nosniff" },
      });
    }
    session(req, !["GET", "HEAD"].includes(method));
    const pdfAsset = path.match(
      /^\/api\/pdf-assets\/(cmaps|standard_fonts|wasm)\/([\w.-]+)$/,
    );
    if (pdfAsset && method === "GET") {
      ensure(
        !pdfAsset[2]!.startsWith("."),
        "NOT_FOUND",
        "PDF asset not found",
        404,
      );
      const file = Bun.file(
        join(
          import.meta.dir,
          "../../../node_modules/pdfjs-dist",
          pdfAsset[1]!,
          pdfAsset[2]!,
        ),
      );
      ensure(await file.exists(), "NOT_FOUND", "PDF asset not found", 404);
      return new Response(file, {
        headers: {
          "Content-Type": pdfAsset[2]!.endsWith(".wasm")
            ? "application/wasm"
            : "application/octet-stream",
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path === "/api/workspaces") {
      if (method === "GET") return json(s.workspaces());
      if (method === "POST")
        return json(createWorkspace(s, await body(req)), 201);
    }
    if (path === "/api/demo" && method === "POST") {
      const w = createWorkspace(
        s,
        {
          name: "Preparing example",
          description: "Background example workspace preparation",
        },
        true,
      );
      return json(jobs.enqueue(w.id, "demo-seed", {}), 202);
    }
    if (path === "/api/backups" && method === "GET")
      return json(await listBackups(s));
    if (path === "/api/diagnostics" && method === "GET")
      return json({
        runtime: `Bun ${Bun.version}`,
        schema: 1,
        model: process.env.OPENAI_MODEL || "gpt-6-astra",
        aiAvailable: !!process.env.OPENAI_API_KEY,
        runs: s.allRuns().map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          attempt: r.attempt,
          errorCode: r.error?.code,
        })),
        generatedAt: now(),
      });
    const events = path.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (events && method === "GET") {
      const rid = events[1]!,
        run = s.allRuns().find((r) => r.id === rid);
      ensure(run, "NOT_FOUND", "Run not found", 404);
      let cursor = Number(
          req.headers.get("last-event-id") || u.searchParams.get("after") || 0,
        ),
        timer: ReturnType<typeof setInterval>;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = () => {
            try {
              const items = s.events(rid, cursor);
              for (const e of items) {
                cursor = e.seq;
                controller.enqueue(
                  encoder.encode(
                    `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`,
                  ),
                );
              }
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch {
              clearInterval(timer);
            }
          };
          send();
          timer = setInterval(send, 2000);
          req.signal.addEventListener(
            "abort",
            () => {
              clearInterval(timer);
              try {
                controller.close();
              } catch {}
            },
            { once: true },
          );
        },
        cancel() {
          clearInterval(timer);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
    const match = path.match(/^\/api\/workspaces\/([^/]+)(?:\/(.*))?$/);
    ensure(match, "NOT_FOUND", "Endpoint not found", 404);
    const w = match[1]!,
      tail = match[2] ?? "",
      parts = tail.split("/"),
      resource = parts[0],
      key = parts[1],
      action = parts[2];
    const workspace = s.getWorkspace(w);
    if (!tail) {
      if (method === "GET") return json(workspace);
      if (method === "PATCH") {
        const data = z
          .object({
            name: z.string().trim().min(1).max(160).optional(),
            description: z.string().max(2000).optional(),
            status: z.enum(["active", "archived"]).optional(),
          })
          .strict()
          .parse(await body(req));
        const next = { ...workspace, ...data, updatedAt: now() };
        s.tx(() => {
          s.putWorkspace(next);
          s.audit(w, "workspace.updated", data);
        });
        return json(next);
      }
    }
    if (resource === "settings" && method === "PATCH") {
      const c = WorkspaceSettings.parse(await body(req));
      const next = {
        ...workspace,
        settings: {
          allowInternalAI: c.allowInternalAI,
          revision: workspace.settings.revision + 1,
        },
      };
      s.tx(() => {
        s.putWorkspace(next);
        s.audit(w, "settings.updated", c);
      });
      return json(next);
    }
    if (resource === "overview" && method === "GET")
      return json({
        workspace,
        context: s.snapshot(w, u.searchParams.get("version") ?? undefined),
        versions: s.versions(w),
        sources: s.list<Source>("source", w),
        sourceVersions: s.list<SourceVersion>("source-version", w),
        proposals: s
          .list<Proposal>("proposal", w)
          .map((p) => inspectProposal(s, w, p)),
        artifacts: s
          .list<Artifact>("artifact", w)
          .map((a) => ({ ...a, freshness: artifactFreshness(s, w, a) })),
        runs: s.list<Run>("run", w).map(({ sdkState, ...r }) => r),
        findings: s.list("finding", w),
        repositories: s.list("repository", w),
        repositorySnapshots: s.list("repository-snapshot", w),
        scenes: s.list("scene", w),
        checkpoints: s.list("checkpoint", w),
        validations: s.list("validation", w),
      });
    if (resource === "sources") {
      if (key && action === "content" && method === "POST") {
        const c = z
          .object({
            expectedVersionId: z.string(),
            text: z.string().max(25 * 1024 * 1024),
          })
          .strict()
          .parse(await body(req, 26 * 1024 * 1024));
        const source = s.get<Source>("source", w, key);
        const version = s.get<SourceVersion>(
          "source-version",
          w,
          c.expectedVersionId,
        );
        ensure(
          version.sourceId === key,
          "NOT_FOUND",
          "Source version does not belong to this source",
          404,
        );
        const name = String(version.metadata.originalName ?? source.name);
        ensure(
          /\.(md|markdown|txt|text)$/i.test(name),
          "NOT_EDITABLE",
          "Only Markdown and text sources can be edited",
          415,
        );
        return json(
          await ingest(s, w, name, new TextEncoder().encode(c.text), {
            sourceId: key,
            expectedVersionId: c.expectedVersionId,
            metadata: { editedFromVersionId: version.id },
          }),
          202,
        );
      }
      if (method === "GET" && !key) return json(s.list<Source>("source", w));
      if (method === "POST" && (!key || action === "versions")) {
        const len = Number(req.headers.get("content-length") || 0);
        ensure(
          len <= 26 * 1024 * 1024,
          "UPLOAD_TOO_LARGE",
          "Upload exceeds the 25 MiB document limit",
          413,
        );
        const form = await req.formData(),
          file = form.get("file");
        ensure(
          file instanceof File,
          "FILE_REQUIRED",
          "Choose a document to upload",
        );
        const bytes = new Uint8Array(await file.arrayBuffer());
        return json(
          await ingest(s, w, file.name, bytes, {
            sourceId: key,
            classification: Classification.parse(
              form.get("classification") || "internal",
            ),
            authority: z
              .enum(["authoritative", "supporting", "informal"])
              .parse(form.get("authority") || "supporting"),
          }),
          202,
        );
      }
      if (key && method === "GET") {
        const source = s.get<Source>("source", w, key);
        const versions = s
          .list<SourceVersion>("source-version", w)
          .filter((v) => v.sourceId === key);
        const vid =
          u.searchParams.get("version") ??
          source.latestVersionId ??
          versions[0]?.id;
        if (action === "original" || action === "content") {
          const v = s.get<SourceVersion>("source-version", w, vid!);
          ensure(
            v.sourceId === key,
            "NOT_FOUND",
            "Source version does not belong to this source",
            404,
          );
          const name = String(v.metadata.originalName ?? source.name);
          if (action === "content") {
            ensure(
              /\.(md|markdown|txt|text|json|ya?ml|csv|html?)$/i.test(name),
              "NOT_TEXT",
              "Use the original download for this file type",
              415,
            );
            return json({ text: await s.blobFile(v.hash).text() });
          }
          return new Response(s.blobFile(v.hash), {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
        return json({
          source,
          versions,
          evidence: s
            .list<Evidence>("evidence", w)
            .filter((e) => e.sourceId === key && e.sourceVersionId === vid)
            .reverse(),
          dependents: s
            .snapshot(w)
            .objects.filter((o) =>
              o.evidenceIds.some(
                (eid) => s.get<Evidence>("evidence", w, eid).sourceId === key,
              ),
            ),
          impacts: impacts(s, w, [key]),
        });
      }
      if (key && method === "PATCH") {
        const c = z
          .object({
            name: z.string().min(1).max(240).optional(),
            classification: Classification.optional(),
            authority: z
              .enum(["authoritative", "supporting", "informal"])
              .optional(),
            status: z.enum(["active", "archived"]).optional(),
            reason: z.string().min(1),
          })
          .strict()
          .parse(await body(req));
        const source = s.get<Source>("source", w, key);
        const { reason, ...patch } = c;
        s.tx(() => {
          s.update("source", w, { ...source, ...patch });
          s.audit(w, "source.updated", { sourceId: key, ...c });
        });
        return json({ ok: true });
      }
    }
    if (resource === "evidence" && method === "GET") {
      if (key === "catalog") {
        const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
        const all = s
          .list<Evidence>("evidence", w)
          .filter(
            (e) =>
              s.get<SourceVersion>("source-version", w, e.sourceVersionId)
                .status === "ready",
          );
        return json({
          items: all.slice(offset, offset + 200).map((e) => ({
            id: e.id,
            sourceId: e.sourceId,
            sourceVersionId: e.sourceVersionId,
            label: `${s.get<Source>("source", w, e.sourceId).name}: ${e.excerpt.slice(0, 100)}`,
          })),
          total: all.length,
        });
      }
      if (key) {
        const e = validEvidence(s, w, key);
        return json({
          ...e,
          source: s.get<Source>("source", w, e.sourceId),
          dependents: s
            .snapshot(w)
            .objects.filter((o) => o.evidenceIds.includes(key)),
        });
      }
      return json(s.search(w, u.searchParams.get("q") ?? ""));
    }
    if (resource === "context") {
      if (method === "GET") {
        if (key === "diff")
          return json(
            diffVersions(
              s,
              w,
              u.searchParams.get("from")!,
              u.searchParams.get("to") ?? workspace.headId,
            ),
          );
        return json(
          s.snapshot(w, key || u.searchParams.get("version") || undefined),
        );
      }
      if (method === "POST")
        return json(humanCommand(s, w, await body(req)), 201);
    }
    if (resource === "proposals") {
      if (method === "GET")
        return json(
          key
            ? inspectProposal(s, w, s.get("proposal", w, key))
            : s
                .list<Proposal>("proposal", w)
                .map((p) => inspectProposal(s, w, p)),
        );
      if (method === "POST" && key) {
        if (action === "accept")
          return json(acceptProposal(s, w, key, await body(req)));
        if (action === "reject") {
          const c = z
            .object({ reason: z.string().min(1) })
            .parse(await body(req));
          return json(rejectProposal(s, w, key, c.reason));
        }
        if (action === "derive" || action === "validate") {
          let input = await body(req);
          if (action === "validate") {
            const p = s.get<Proposal>("proposal", w, key);
            input = {
              title: p.title,
              kind: p.kind,
              baseVersionId: workspace.headId,
              operations: p.operations,
              rationale: p.rationale,
              critic: p.critic,
            };
          }
          return json(deriveProposal(s, w, key, input), 201);
        }
      }
    }
    if (["decisions", "guardrails"].includes(resource!) && method === "GET")
      return json(
        s
          .snapshot(w, u.searchParams.get("version") ?? undefined)
          .objects.filter(
            (o) =>
              o.kind === (resource === "decisions" ? "decision" : "guardrail"),
          ),
      );
    if (resource === "views") {
      if (method === "GET" && action === "export")
        return new Response(
          exportProjection(
            s,
            w,
            u.searchParams.get("version") ?? workspace.headId,
            u.searchParams.get("filter") ?? "all",
          ),
          {
            headers: {
              "Content-Type": "image/svg+xml",
              "Content-Disposition":
                'attachment; filename="tracework-model.svg"',
            },
          },
        );
      if (method === "GET")
        return json(key ? s.maybe("scene", w, key) : s.list("scene", w));
      if (method === "PUT" && key)
        return json(saveScene(s, w, key, await body(req)));
    }
    if (resource === "artifacts") {
      if (method === "POST" && !key) {
        const c = z
          .object({
            kind: ArtifactKind,
            contextVersionId: z.string(),
            selectedIds: z.array(z.string()).default([]),
            inputArtifactIds: z.array(z.string()).default([]),
          })
          .strict()
          .parse(await body(req));
        s.version(w, c.contextVersionId);
        return json(jobs.enqueue(w, "artifact", c), 202);
      }
      if (method === "GET") {
        if (!key) return json(s.list<Artifact>("artifact", w));
        const a = s.get<Artifact>("artifact", w, key);
        if (action === "download") {
          const out = await exportArtifact(s, w, key);
          return new Response(out.bytes as BodyInit, {
            headers: {
              "Content-Type": out.type,
              "Content-Disposition": `attachment; filename="${a.kind}-v${a.ordinal}.${out.extension}"`,
            },
          });
        }
        return json({
          ...a,
          content: await s.blobFile(a.hash).text(),
          freshness: artifactFreshness(s, w, a),
        });
      }
      if (method === "POST" && key) {
        if (action === "review") {
          const c = z
            .object({
              status: z.enum(["reviewed", "accepted"]),
              reason: z.string().min(1),
            })
            .parse(await body(req));
          return json(reviewArtifact(s, w, key, c.status, c.reason));
        }
        if (action === "execute")
          return json(jobs.enqueue(w, "execute", { artifactId: key }), 202);
        if (action === "edit") {
          const c = z
            .object({
              content: z.string().max(500000),
              reason: z.string().min(1),
            })
            .parse(await body(req));
          const old = s.get<Artifact>("artifact", w, key);
          const a = await generateArtifact(s, w, {
            kind: old.kind,
            contextVersionId: old.manifest.contextVersionId,
            selectedIds: Object.keys(old.manifest.objectRevisions),
            inputArtifactIds: Object.keys(old.manifest.inputArtifacts),
            content: c.content,
            artifactId: old.artifactId,
          });
          s.update("artifact", w, {
            ...a,
            manifest: { ...a.manifest, lineage: old.id },
          });
          s.audit(w, "artifact.edited", {
            before: key,
            after: a.id,
            reason: c.reason,
          });
          return json(a, 201);
        }
      }
    }
    if (resource === "repositories") {
      if (method === "GET")
        return json(
          key ? s.get("repository", w, key) : s.list("repository", w),
        );
      if (method === "POST") {
        if (!key) {
          const c = z
            .object({ path: z.string(), name: z.string().default("") })
            .parse(await body(req));
          return json(await registerRepository(s, w, c.path, c.name), 201);
        }
        if (action === "import") {
          const c = z.object({ ref: z.string().min(1) }).parse(await body(req));
          s.get("repository", w, key);
          return json(
            jobs.enqueue(w, "repository", { repositoryId: key, ref: c.ref }),
            202,
          );
        }
        if (action === "compare") {
          const c = z
            .object({ from: z.string(), to: z.string() })
            .parse(await body(req));
          return json(compareRepositories(s, w, c.from, c.to));
        }
      }
    }
    if (resource === "validation-runs") {
      if (method === "GET")
        return json(
          key ? s.get("validation", w, key) : s.list("validation", w),
        );
      if (method === "POST" && !key)
        return json(jobs.enqueue(w, "validate", {}), 202);
    }
    if (resource === "findings" && key && method === "PATCH") {
      const c = z
        .object({ disposition: z.string(), comment: z.string() })
        .parse(await body(req));
      return json(disposition(s, w, key, c.disposition, c.comment));
    }
    if (resource === "impacts" && method === "GET")
      return json(impacts(s, w, u.searchParams.getAll("id")));
    if (resource === "agent-runs" || resource === "runs") {
      if (method === "GET") {
        if (!key)
          return json(s.list<Run>("run", w).map(({ sdkState, ...run }) => run));
        const { sdkState, ...r } = s.get<Run>("run", w, key);
        return json({
          ...r,
          events: s.events(key),
          tools: s
            .list<{ runId: string }>("tool-invocation", w)
            .filter((t) => t.runId === key),
          plan: r.planId ? s.get("context-plan", w, r.planId) : null,
          attempts: s
            .list<{ runId: string }>("attempt", w)
            .filter((t) => t.runId === key),
        });
      }
      if (method === "POST") {
        if (!key) return json(runtime.start(w, await body(req)), 202);
        if (action === "cancel") return json(jobs.cancel(w, key));
        if (action === "retry") return json(jobs.retry(w, key), 202);
        if (action === "approval") {
          const c = z
            .object({ approve: z.boolean(), stateHash: z.string() })
            .parse(await body(req));
          return json(
            await runtime.approve(w, key, c.approve, c.stateHash),
            202,
          );
        }
      }
    }
    if (resource === "audit" && method === "GET") return json(s.audits(w));
    if (resource === "backups" && method === "POST")
      return json(
        jobs.enqueue(
          w,
          action === "restore" ? "restore" : "backup",
          action === "restore" ? { backupId: key } : {},
        ),
        202,
      );
    if (resource === "checkpoints") {
      if (method === "GET") return json(s.list("checkpoint", w));
      if (method === "POST") {
        if (key && action === "clone")
          return json(await cloneCheckpoint(s, w, key), 201);
        const c = z
          .object({ name: z.string().min(1).max(100) })
          .parse(await body(req));
        return json(jobs.enqueue(w, "checkpoint", { name: c.name }), 202);
      }
    }
    if (resource === "demo" && method === "POST") {
      if (key === "reset") return json(await resetExample(s, w), 201);
      if (key === "change") return json(await introduceChange(s, w), 202);
    }
    throw new AppError("NOT_FOUND", "Endpoint not found", 404);
  }
  async function fetch(req: Request) {
    try {
      const response = await route(req);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "same-origin");
      response.headers.set("X-Frame-Options", "DENY");
      return response;
    } catch (e) {
      if (e instanceof ZodError)
        return json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: e.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "),
            },
          },
          422,
        );
      if (e instanceof AppError)
        return json(
          { error: { code: e.code, message: e.message, details: e.details } },
          e.status,
        );
      console.error(
        "Tracework request failed:",
        e instanceof Error ? e.name : "UnknownError",
      );
      return json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message:
              "This operation could not be completed. Your accepted work is preserved.",
          },
        },
        500,
      );
    }
  }
  return {
    s,
    jobs,
    runtime,
    fetch,
    close: async () => {
      await jobs.stop();
      s.close();
    },
  };
}
