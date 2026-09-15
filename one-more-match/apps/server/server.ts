import { join, resolve, extname } from "node:path";
import { countries } from "../../packages/catalogue";
import {
  defaultProfile,
  inputSchema,
  profileSchema,
  resultOf,
  setupSchema,
  type Profile,
} from "../../packages/contracts";
import {
  createFileStorage,
  StorageError,
  type StorageProvider,
} from "../../packages/storage";
import {
  createMatch,
  initPhysics,
  Simulation,
} from "../../packages/simulation";
import type { ServerWebSocket } from "bun";
import { z } from "zod";
type SocketData = { session: string; controller: string };
export type ServerOptions = {
  port?: number;
  html?: Bun.HTMLBundle;
  dataDir?: string;
  assetsDir?: string;
  storage?: StorageProvider;
  desktop?: boolean;
  launchToken?: string;
  quit?: () => void;
};
export async function startServer(options: ServerOptions = {}) {
  await initPhysics();
  const storage =
    options.storage ??
    (await createFileStorage(
      options.dataDir ??
        process.env.ONE_MORE_MATCH_DATA_DIR ??
        resolve(".data"),
    ));
  let profile: Profile = await storage.profiles.get(),
    sim: Simulation | null = null,
    saveWarning = storage.warning;
  const recovered = await storage.matches.latest();
  if (recovered) {
    sim = new Simulation(recovered);
    if (recovered.phase === "loading") sim.ready();
    sim.pause("recovery");
  }
  const sessions = new Map<string, number>();
  const sockets = new Set<ServerWebSocket<SocketData>>();
  let controller: ServerWebSocket<SocketData> | null = null;
  let lastInput = 0;
  let disposed = false;
  let saving = false;
  let resave = false;
  let committed = "";
  let launchToken = options.launchToken;
  const idempotency = new Map<string, Promise<unknown>>();
  let mutation = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const p = mutation.then(fn);
    mutation = p.then(
      () => {},
      () => {},
    );
    return p;
  };
  async function persist() {
    if (saving) {
      resave = true;
      return;
    }
    if (!sim) return;
    saving = true;
    const state = structuredClone(sim.state);
    state.revision++;
    sim.state.revision = state.revision;
    try {
      if (state.phase === "finished") {
        await storage.results.record(resultOf(state));
        committed = state.id;
        await storage.matches.remove(state.id);
      } else if (state.phase === "abandoned")
        await storage.matches.remove(state.id);
      else await storage.matches.save(state);
      saveWarning = storage.warning;
    } catch (e) {
      saveWarning =
        "Your game is running, but changes could not be saved. Check available disk space.";
      console.error("Save failed", e);
    } finally {
      saving = false;
      if (resave) {
        resave = false;
        void persist();
      }
    }
  }
  const json = (
    data: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    });
  const error = (code: string, message: string, status = 400) =>
    json(
      {
        error: {
          code,
          message,
          requestId: crypto.randomUUID(),
          retryable: status >= 500,
        },
      },
      status,
    );
  const cookie = (req: Request) =>
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("omm_session="))
      ?.slice(12);
  const authorised = (req: Request) => {
    const key = cookie(req);
    if (!key || !sessions.has(key)) return null;
    sessions.set(key, Date.now());
    return key;
  };
  const owns = (session: string) =>
    !controller || controller.data.session === session;
  const assetsDir = resolve(options.assetsDir ?? "dist");
  let server!: Bun.Server<SocketData>;
  try {
    server = Bun.serve<SocketData>({
      hostname: "127.0.0.1",
      routes: options.html ? { "/": options.html } : undefined,
      development: options.html ? { hmr: true, console: true } : false,
      port: options.port ?? Number(process.env.PORT ?? 3210),
      maxRequestBodySize: 16 * 1024,
      async fetch(req, server) {
        const url = new URL(req.url);
        const origin = `http://127.0.0.1:${server.port}`;
        const host = req.headers.get("host");
        if (
          host !== `127.0.0.1:${server.port}` &&
          host !== `localhost:${server.port}`
        )
          return error("HOST", "Invalid application host", 403);
        const allowedOrigin = req.headers.get("origin");
        if (
          allowedOrigin &&
          allowedOrigin !== origin &&
          allowedOrigin !== `http://localhost:${server.port}`
        )
          return error(
            "ORIGIN",
            "Use the application window to make this request.",
            403,
          );
        try {
          if (url.pathname === "/api/v1/health")
            return json({ ok: true, version: "1.0.0", protocol: 1 });
          if (url.pathname === "/api/v1/session" && req.method === "POST") {
            const existing = authorised(req);
            if (existing) return json({ ok: true, desktop: !!options.desktop });
            if (launchToken) {
              const body = await req.json();
              if (body.token !== launchToken)
                return error("SESSION", "Invalid launch credential", 403);
              launchToken = undefined;
            }
            const session = crypto.randomUUID();
            sessions.set(session, Date.now());
            return json({ ok: true, desktop: !!options.desktop }, 200, {
              "Set-Cookie": `omm_session=${session}; HttpOnly; SameSite=Strict; Path=/`,
            });
          }
          if (url.pathname.startsWith("/api/")) {
            const session = authorised(req);
            if (!session)
              return error("SESSION", "Start a new application session.", 401);
            if (url.pathname === "/api/v1/play") {
              if (url.searchParams.get("version") !== "1")
                return error(
                  "VERSION",
                  "Reload the app to update the game connection.",
                  409,
                );
              if (!sim || url.searchParams.get("match") !== sim.state.id)
                return error("MATCH", "Match not found", 404);
              if (controller)
                return error(
                  "CONTROLLED",
                  "This match is open in another window. Take control to continue.",
                  409,
                );
              if (
                server.upgrade(req, {
                  data: { session, controller: crypto.randomUUID() },
                })
              )
                return;
              return error("SOCKET", "Unable to connect", 400);
            }
            if (url.pathname === "/api/v1/countries") return json(countries);
            if (url.pathname === "/api/v1/profile" && req.method === "GET")
              return json({
                profile,
                match: sim?.state ?? null,
                saveWarning,
                controlled: !!controller,
              });
            if (url.pathname === "/api/v1/results")
              return json(
                await storage.results.list(
                  Math.min(
                    100,
                    Math.max(1, Number(url.searchParams.get("limit")) || 20),
                  ),
                  Math.max(0, Number(url.searchParams.get("offset")) || 0),
                ),
              );
            if (url.pathname === "/api/v1/profile" && req.method === "PATCH")
              return await serial(async () => {
                const body = profileSchema.parse(await req.json());
                profile = await storage.profiles.update(body, body.revision);
                return json(profile);
              });
            if (url.pathname === "/api/v1/control" && req.method === "POST") {
              if (controller) {
                const old = controller;
                controller = null;
                old.send(JSON.stringify({ type: "controlLost" }));
                old.close(4001, "Control transferred");
              }
              sim?.pause("user");
              return json({ ok: true });
            }
            if (
              url.pathname === "/api/v1/quit" &&
              req.method === "POST" &&
              options.desktop
            ) {
              setTimeout(() => options.quit?.(), 100);
              return json({ ok: true });
            }
            if (!owns(session))
              return error(
                "CONTROLLED",
                "This match is controlled by another window.",
                409,
              );
            const matchRoute = url.pathname.match(
              /^\/api\/v1\/matches(?:\/([a-f0-9-]+)(?:\/(ready|pause|resume|abandon|rematch))?)?$/,
            );
            if (matchRoute) {
              const [, id, action] = matchRoute;
              if (id && sim?.state.id !== id)
                return error("MATCH", "Match not found", 404);
              if (req.method === "GET") return json(sim?.state ?? null);
              if (req.method !== "POST")
                return error("METHOD", "Use POST for this action", 405);
              if (!id || action === "rematch") {
                const key = req.headers.get("Idempotency-Key");
                if (!key || key.length > 100)
                  return error("IDEMPOTENCY", "Missing request key");
                const requestKey = `${session}:${url.pathname}:${key}`;
                if (!idempotency.has(requestKey)) {
                  if (idempotency.size > 500)
                    idempotency.delete(idempotency.keys().next().value!);
                  const body = await req.json();
                  idempotency.set(
                    requestKey,
                    serial(async () => {
                      const setup =
                        action === "rematch"
                          ? sim!.state.setup
                          : setupSchema.parse(body);
                      if (
                        sim &&
                        !["finished", "abandoned"].includes(sim.state.phase)
                      )
                        throw new StorageError(
                          "ACTIVE_MATCH",
                          "Finish or abandon the current match first.",
                        );
                      if (
                        sim?.state.phase === "finished" &&
                        committed !== sim.state.id
                      ) {
                        await storage.results.record(resultOf(sim.state));
                        await storage.matches.remove(sim.state.id);
                      }
                      const previous = sim;
                      sim = new Simulation(createMatch(setup));
                      previous?.dispose();
                      for (const socket of sockets)
                        socket.close(4000, "New match");
                      controller = null;
                      profile = await storage.profiles.update(
                        { ...profile, setup },
                        profile.revision,
                      );
                      await persist();
                      return sim.state;
                    }),
                  );
                }
                return json(await idempotency.get(requestKey), 201);
              }
              if (action === "ready") sim!.ready();
              else if (action === "pause") sim!.pause("user");
              else if (action === "resume") sim!.resume();
              else if (action === "abandon") {
                sim!.phase("abandoned");
                sim!.clearInput();
              } else return error("ACTION", "Unknown match action", 404);
              void persist();
              return json(sim!.state);
            }
            return error("NOT_FOUND", "Unknown endpoint", 404);
          }
          if (req.method !== "GET" && req.method !== "HEAD")
            return error("METHOD", "Method not allowed", 405);
          let name = decodeURIComponent(url.pathname);
          if (name === "/") name = "/index.html";
          const filePath = resolve(assetsDir, `.${name}`);
          if (!filePath.startsWith(assetsDir + "/"))
            return error("PATH", "Invalid asset path", 403);
          const file = Bun.file(filePath);
          if (!(await file.exists()))
            return new Response("Not found", { status: 404 });
          return new Response(req.method === "HEAD" ? null : file, {
            headers: {
              "Content-Security-Policy":
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
              "X-Content-Type-Options": "nosniff",
              "Cache-Control":
                extname(filePath) === ".html"
                  ? "no-cache"
                  : "public, max-age=3600",
            },
          });
        } catch (e) {
          if (e instanceof z.ZodError)
            return error(
              "VALIDATION",
              e.issues[0]?.message ?? "Invalid request",
            );
          if (e instanceof StorageError)
            return error(
              e.code,
              e.message,
              e.code === "REVISION_CONFLICT" || e.code === "ACTIVE_MATCH"
                ? 409
                : 500,
            );
          console.error(e);
          return error(
            "SERVER",
            "The request could not be completed. Please try again.",
            500,
          );
        }
      },
      websocket: {
        maxPayloadLength: 4096,
        idleTimeout: 30,
        open(ws) {
          sockets.add(ws);
          controller = ws;
          lastInput = performance.now();
          ws.send(
            JSON.stringify({
              type: "snapshot",
              state: sim?.state,
              saveWarning,
            }),
          );
        },
        message(ws, data) {
          if (ws !== controller || !sim) return;
          try {
            const input = inputSchema.parse(JSON.parse(String(data)));
            if (performance.now() - lastInput < 5) return;
            lastInput = performance.now();
            sim.accept(input);
          } catch {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid control input",
              }),
            );
          }
        },
        close(ws) {
          sockets.delete(ws);
          if (controller === ws) {
            controller = null;
            sim?.pause("connection");
            void persist();
          }
        },
      },
    });
  } catch (e) {
    sim?.dispose();
    await storage.close();
    throw e;
  }
  let prev = performance.now(),
    acc = 0,
    overload = 0;
  const tick = setInterval(() => {
    const now = performance.now();
    acc += Math.min((now - prev) / 1000, 0.25);
    prev = now;
    let n = 0;
    const event = sim?.state.event.id;
    while (acc >= 1 / 60 && n < 5) {
      if (sim) {
        if (now - lastInput > 250) {
          sim.clearInput();
          if (now - lastInput > 2000 && controller) sim.pause("connection");
        }
        sim.step();
      }
      acc -= 1 / 60;
      n++;
    }
    if (acc >= 1 / 60) {
      acc = 0;
      overload++;
      if (overload > 30) sim?.pause("performance");
    } else overload = Math.max(0, overload - 1);
    if (
      event !== sim?.state.event.id &&
      ["goalCelebration", "halfTime", "finished"].includes(
        sim?.state.phase ?? "",
      )
    )
      void persist();
  }, 8);
  const snapshots = setInterval(() => {
    if (sim && controller) {
      sim.state.seq++;
      controller.send(
        JSON.stringify({ type: "snapshot", state: sim.state, saveWarning }),
      );
    }
  }, 50);
  const checkpoint = setInterval(() => {
    void persist();
    for (const [session, time] of sessions)
      if (Date.now() - time > 86400000) sessions.delete(session);
  }, 5000);
  async function close() {
    if (disposed) return;
    disposed = true;
    clearInterval(tick);
    clearInterval(snapshots);
    clearInterval(checkpoint);
    sim?.pause("user");
    await persist();
    await mutation;
    while (saving) await new Promise((r) => setTimeout(r, 10));
    for (const ws of sockets) ws.close();
    server.stop(true);
    sim?.dispose();
    await storage.close();
  }
  return {
    server,
    close,
    get simulation() {
      return sim;
    },
    storage,
  };
}
