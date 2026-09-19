// This module runs in a bounded Bun child process, never in the HTTP hot path.
import { extname } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { parseDocument } from "yaml";
import { load } from "cheerio";
import mammoth from "mammoth";
import { unzipSync } from "fflate";
import type { ExtractedBlock } from "../../../../packages/contracts";
export const EXTRACTOR_VERSION = "tracework-extract-1";
export async function extract(
  name: string,
  bytes: Uint8Array,
): Promise<{ blocks: ExtractedBlock[]; warnings: string[] }> {
  const ext = extname(name).toLowerCase(),
    warnings: string[] = [],
    blocks: ExtractedBlock[] = [];
  const decoded = new TextDecoder("utf-8", { fatal: true });
  if (ext === ".pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    const doc = await loading.promise;
    if (doc.numPages > 200) throw new Error("PDF exceeds the 200-page limit");
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page);
      const content = await p.getTextContent();
      const t = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
      if (t.trim())
        blocks.push({
          text: t,
          locator: { kind: "page", page, start: 0, end: t.length },
        });
    }
    await loading.destroy();
    if (!blocks.length)
      throw new Error("This PDF has no usable text. OCR is not supported.");
    warnings.push(
      "Text extraction only; images and visual layout are not interpreted.",
    );
  } else if (ext === ".docx") {
    let total = 0;
    unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > 100 * 1024 * 1024 || f.originalSize > 30 * 1024 * 1024)
          throw new Error("DOCX expansion limit exceeded");
        return false;
      },
    });
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
    );
    const $ = load(result.value);
    $("p,h1,h2,h3,h4,h5,h6,table").each((i, e) => {
      if ($(e).parents("table").length) return;
      const t = $(e).text();
      if (t.trim())
        blocks.push({
          text: t,
          locator: {
            kind: "block",
            block: `block-${i + 1}`,
            start: 0,
            end: t.length,
          },
        });
    });
    warnings.push(
      "Headings, paragraphs and tables extracted in document order; images and original formatting are not interpreted.",
      ...result.messages.map((m) => m.message),
    );
  } else if (ext === ".html" || ext === ".htm") {
    const $ = load(decoded.decode(bytes));
    $("script,style,iframe,object,embed,noscript,link,img").remove();
    $("h1,h2,h3,h4,p,li,table,pre,article,section").each((i, e) => {
      if ($(e).find("p,li,table,pre,article,section").length) return;
      const t = $(e).text().trim();
      if (t)
        blocks.push({
          text: t,
          locator: {
            kind: "block",
            block: `block-${i + 1}`,
            start: 0,
            end: t.length,
          },
        });
    });
    if (!blocks.length) {
      const t = $("body").text().trim();
      if (t)
        blocks.push({
          text: t,
          locator: { kind: "block", block: "body", start: 0, end: t.length },
        });
    }
  } else if (ext === ".csv") {
    const rows = parseCsv(decoded.decode(bytes), {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    }) as string[][];
    if (rows.length > 50000) throw new Error("CSV exceeds 50,000 rows");
    const headers = rows[0] ?? [];
    rows.slice(1).forEach((row, i) =>
      row.forEach((t, j) =>
        blocks.push({
          text: `${headers[j]}: ${t}`,
          locator: {
            kind: "csv",
            row: i + 2,
            column: headers[j] ?? String(j + 1),
            start: i + 2,
            end: i + 2,
          },
        }),
      ),
    );
  } else if ([".json", ".yaml", ".yml"].includes(ext)) {
    const t = decoded.decode(bytes);
    const parsed =
      ext === ".json"
        ? JSON.parse(t)
        : parseDocument(t, {
            uniqueKeys: true,
            maxAliasCount: 30,
          } as never).toJS({ maxAliasCount: 30 });
    let count = 0;
    const walk = (v: unknown, pointer: string, depth: number) => {
      if (depth > 40 || ++count > 20000)
        throw new Error("Structured document nesting or item limit exceeded");
      if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v))
          walk(
            child,
            `${pointer}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`,
            depth + 1,
          );
      } else
        blocks.push({
          text: `${pointer || "/"}: ${JSON.stringify(v)}`,
          locator: {
            kind: "pointer",
            pointer: pointer || "",
            start: 0,
            end: t.length,
          },
        });
    };
    walk(parsed, "", 0);
  } else if (
    [
      ".md",
      ".txt",
      ".text",
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".sql",
      ".toml",
      ".ini",
      ".sh",
      ".css",
      ".xml",
      ".gitignore",
      "",
    ].includes(ext)
  ) {
    const t = decoded.decode(bytes).replace(/\r\n?/g, "\n");
    if (t.includes("\0")) throw new Error("Binary content is not supported");
    const lines = t.split("\n");
    for (let i = 0; i < lines.length; i += 24) {
      const excerpt = lines.slice(i, i + 24).join("\n");
      if (excerpt.trim())
        blocks.push({
          text: excerpt,
          locator: {
            kind: "lines",
            start: i + 1,
            end: Math.min(lines.length, i + 24),
          },
        });
    }
  } else throw new Error(`Unsupported file format: ${ext || "unknown"}`);
  if (!blocks.length) throw new Error("No readable text found");
  if (
    blocks.length > 20000 ||
    blocks.reduce((n, b) => n + b.text.length, 0) > 12 * 1024 * 1024
  )
    throw new Error("Extracted content limit exceeded");
  return { blocks, warnings };
}
if (import.meta.main) {
  try {
    const p = process.argv[2]!,
      name = process.argv[3]!;
    const result = await extract(
      name,
      new Uint8Array(await Bun.file(p).arrayBuffer()),
    );
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stderr.write((e as Error).message);
    process.exit(1);
  }
}
