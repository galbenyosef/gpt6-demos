import { BrowserWindow, Utils, PATHS, Screen } from "electrobun/main";
import { join } from "node:path";
import { startServer } from "../server/server";
let quitting = false;
const quit = async () => {
  if (quitting) return;
  quitting = true;
  await app.close();
  Utils.quit();
};
const token = crypto.randomUUID();
const app = await startServer({
  port: 0,
  dataDir: process.env.ONE_MORE_MATCH_DATA_DIR ?? Utils.paths.userData,
  assetsDir: join(PATHS.RESOURCES_FOLDER, "app", "web"),
  desktop: true,
  launchToken: token,
  quit: () => void quit(),
});
console.log(`One More Match desktop · http://127.0.0.1:${app.server.port}`);
const display = Screen.getPrimaryDisplay();
const scale =
  process.platform === "linux" ? Math.max(1, display.scaleFactor) : 1;
const width = Math.min(1440 * scale, (display.workArea.width || 1440) * scale);
const height = Math.min(
  900 * scale,
  ((display.workArea.height || 940) - 40) * scale,
);
console.log("Desktop display", JSON.stringify(display));
const win = new BrowserWindow({
  title: "One More Match",
  url: `http://127.0.0.1:${app.server.port}/#token=${token}`,
  renderer: "cef",
  frame: { width, height },
  sandbox: true,
});
win.on("close", () => void quit());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void quit());
