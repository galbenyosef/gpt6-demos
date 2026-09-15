type Task = { id: string; token: string; operation: string; input: unknown };
function render(task: Task, signal: AbortSignal): Promise<{ result?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.title = "Model renderer";
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); signal.removeEventListener("abort", abort); frame.remove(); };
    const abort = () => { cleanup(); reject(new DOMException("Rendering cancelled", "AbortError")); };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.ready) { frame.contentWindow!.postMessage({ operation: task.operation, input: task.input }, "*"); return; }
      cleanup(); resolve(event.data);
    };
    const timer = setTimeout(() => { cleanup(); resolve({ error: "Model rendering exceeded 60 seconds. Try a simpler model." }); }, 60000);
    signal.addEventListener("abort", abort, { once: true });
    window.addEventListener("message", receive);
    frame.src = "/api/render/worker";
    document.body.append(frame);
  });
}
export function startRenderClient() {
  const controller = new AbortController(), { signal } = controller;
  const loop = async () => {
    while (!signal.aborted) {
      try {
        const response = await fetch("/api/render/tasks", { signal, cache: "no-store" });
        if (response.ok && response.status !== 204) {
          const task: Task = await response.json();
          const path = `/api/render/tasks/${task.id}`;
          const headers = { "Content-Type": "application/json", "X-Render-Token": task.token };
          const taskController = new AbortController();
          const stopTask = () => taskController.abort();
          signal.addEventListener("abort", stopTask, { once: true });
          const heartbeat = setInterval(() => {
            void fetch(`${path}/heartbeat`, { method: "POST", headers, signal }).then(response => {
              if (response.status === 409) stopTask();
            }).catch(() => {});
          }, 5000);
          try {
            const result = await render(task, taskController.signal);
            await fetch(path, { method: "POST", headers, body: JSON.stringify(result), signal });
          } finally { clearInterval(heartbeat); signal.removeEventListener("abort", stopTask); }
          continue;
        }
      } catch { /* Reconnect after transient network failures or server restarts. */ }
      if (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };
  void loop();
  return () => controller.abort();
}
