import { z } from "zod";
import * as contracts from "../packages/contracts";
const schemas = Object.fromEntries(
  Object.entries(contracts)
    .filter(([, value]) => value instanceof z.ZodType)
    .map(([name, value]) => [name, z.toJSONSchema(value as z.ZodType)]),
);
await Bun.write(
  new URL("../docs/contracts.schema.json", import.meta.url),
  JSON.stringify(
    {
      description:
        "Generated from packages/contracts/index.ts; refresh with bun scripts/api-schema.ts",
      schemas,
    },
    null,
    2,
  ),
);
console.log(`Exported ${Object.keys(schemas).length} shared schemas`);
