import { Store } from "../apps/server/src/storage/store";
import { seed, resetExample } from "../apps/server/src/modules/demo";
const s = new Store(process.env.TRACEWORK_DATA_DIR || ".tracework-data");
const action = process.argv[2];
if (action === "reset") {
  const i = process.argv.indexOf("--workspace");
  if (i < 0 || !process.argv[i + 1])
    throw new Error(
      "demo:reset requires --workspace <id> and refuses non-example workspaces",
    );
  console.log(
    JSON.stringify(await resetExample(s, process.argv[i + 1]!), null, 2),
  );
} else console.log(JSON.stringify(await seed(s), null, 2));
s.close();
