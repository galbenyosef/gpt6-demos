const children = [
  Bun.spawn([process.execPath, "--watch", "apps/server/src/index.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn([process.execPath, "--bun", "node_modules/vite/bin/vite.js"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
];
function close() {
  for (const c of children) c.kill();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
await Promise.race(children.map((c) => c.exited));
close();

export {};
