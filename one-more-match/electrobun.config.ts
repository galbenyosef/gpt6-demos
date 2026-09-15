export default {
  app: {
    name: "One More Match",
    identifier: "com.onemorematch.football",
    version: "1.0.0",
    description: "Football, just for the love of it.",
  },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "apps/desktop/index.ts" },
    copy: { dist: "web" },
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        "disable-gpu": false,
        "disable-gpu-compositing": false,
        "enable-unsafe-swiftshader": true,
      },
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        "disable-gpu": false,
        "disable-gpu-compositing": false,
        "enable-unsafe-swiftshader": true,
      },
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        // CEF's native helper may return through a frame created before the
        // zygote changes its stack canary. Keep that canary stable on Linux.
        // This retains stack checks; it disables only re-keying after fork.
        // https://github.com/chromiumembedded/cef/issues/3912
        "change-stack-guard-on-fork": "disable",
        "disable-gpu": false,
        "disable-gpu-compositing": false,
        "enable-unsafe-swiftshader": true,
      },
    },
  },
  runtime: { exitOnLastWindowClosed: false },
};
