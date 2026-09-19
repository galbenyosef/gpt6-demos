import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, hash, id } from "../apps/server/src/storage/store";
import {
  createWorkspace,
  validEvidence,
} from "../apps/server/src/modules/model";
import { ingest, extractVersion } from "../apps/server/src/modules/sources";
import { extract } from "../apps/server/src/modules/extractor";
import {
  registerRepository,
  importRepository,
  compareRepositories,
} from "../apps/server/src/modules/repository";
import type { Evidence } from "../packages/contracts";
const signal = () => new AbortController().signal;
function pdf(text: string) {
  const stream = `BT /F1 14 Tf 50 740 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let doc = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(doc.length);
    doc += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = doc.length;
  doc += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(doc);
}
test("text PDF extracts page evidence; empty PDF cannot imply OCR success", async () => {
  const parsed = await extract(
    "brief.pdf",
    pdf("A library edition identifies a publication."),
  );
  expect(parsed.blocks[0]?.text).toBe(
    "A library edition identifies a publication.",
  );
  expect(parsed.blocks[0]?.locator.page).toBe(1);
  await expect(extract("scan.pdf", pdf(""))).rejects.toThrow(
    "OCR is not supported",
  );
  const dir = mkdtempSync(join(tmpdir(), "tracework-pdf-"));
  const s = new Store(dir);
  try {
    const w = createWorkspace(s, { name: "PDF subprocess" });
    const uploaded = await ingest(
      s,
      w.id,
      "brief.pdf",
      pdf("A library edition identifies a publication."),
    );
    await extractVersion(s, w.id, uploaded.version.id, signal(), () => {});
    const e = s.list<Evidence>("evidence", w.id)[0]!;
    expect(validEvidence(s, w.id, e.id).locator.page).toBe(1);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("evidence locator and text must resolve to immutable extracted bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracework-evidence-"));
  const s = new Store(dir);
  try {
    const w = createWorkspace(s, { name: "Evidence integrity" });
    const result = await ingest(
      s,
      w.id,
      "brief.md",
      new TextEncoder().encode("A fixed original passage."),
    );
    await extractVersion(s, w.id, result.version.id, signal(), () => {});
    const e = s.list<Evidence>("evidence", w.id)[0]!;
    expect(validEvidence(s, w.id, e.id).excerpt).toBe(
      "A fixed original passage.",
    );
    expect(() =>
      s.update("evidence", w.id, { ...e, excerpt: "changed" }),
    ).toThrow("immutable evidence");
    const badLocator = {
      ...e,
      id: id(),
      locator: { ...e.locator, start: 999 },
    };
    s.insert("evidence", w.id, badLocator);
    expect(() => validEvidence(s, w.id, badLocator.id)).toThrow(
      "exact extracted passage",
    );
    const badText = {
      ...e,
      id: id(),
      excerpt: "Invented passage",
      hash: hash("Invented passage"),
    };
    s.insert("evidence", w.id, badText);
    expect(() => validEvidence(s, w.id, badText.id)).toThrow(
      "exact extracted passage",
    );
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Git imports pinned text with exact locators, excludes unsafe paths and preserves the checkout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracework-git-"));
  const repo = join(dir, "repo");
  const s = new Store(join(dir, "data"));
  const git = async (...args: string[]) => {
    const p = Bun.spawn(
      [
        "git",
        "-c",
        "user.name=Tracework fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-C",
        repo,
        ...args,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [out, err, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    if (code) throw new Error(err);
    return out;
  };
  try {
    await Bun.write(
      join(repo, "brief.md"),
      "An edition belongs to a publication.",
    );
    await Bun.write(join(repo, ".env"), "SYNTHETIC_FIXTURE=excluded");
    await Bun.write(join(repo, "image.bin"), new Uint8Array([0, 1, 2]));
    symlinkSync("brief.md", join(repo, "linked.md"));
    await git("init");
    await git("add", ".");
    await git("commit", "-m", "Synthetic library fixture");
    const head = (await git("rev-parse", "HEAD")).trim();
    await Bun.write(
      join(repo, "brief.md"),
      "Uncommitted text must not be imported.",
    );
    const before = await git("status", "--porcelain");
    const w = createWorkspace(s, { name: "Library repository" });
    const registered = await registerRepository(
      s,
      w.id,
      repo,
      "Library fixture",
    );
    const first = await importRepository(
      s,
      w.id,
      registered.id,
      "HEAD",
      signal(),
      () => {},
    );
    expect(first.commit).toBe(head);
    expect(first.dirty).toBe(true);
    expect(first.files.map((f) => f.path)).toEqual(["brief.md"]);
    expect(first.exclusions.map((f) => f.path).sort()).toEqual([
      ".env",
      "image.bin",
      "linked.md",
    ]);
    await extractVersion(
      s,
      w.id,
      first.files[0]!.sourceVersionId!,
      signal(),
      () => {},
    );
    const e = s.list<Evidence>("evidence", w.id)[0]!;
    expect(validEvidence(s, w.id, e.id).excerpt).toBe(
      "An edition belongs to a publication.",
    );
    expect(e.locator.commit).toBe(head);
    expect(e.locator.path).toBe("brief.md");
    expect(await git("status", "--porcelain")).toBe(before);
    expect((await git("rev-parse", "HEAD")).trim()).toBe(head);
    expect(await Bun.file(join(repo, "brief.md")).text()).toBe(
      "Uncommitted text must not be imported.",
    );
    await git("add", "brief.md");
    await git("commit", "-m", "Second fixture version");
    const second = await importRepository(
      s,
      w.id,
      registered.id,
      "HEAD",
      signal(),
      () => {},
    );
    expect(
      compareRepositories(s, w.id, first.id, second.id).changes[0]?.status,
    ).toBe("modified");
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SDK approval state resumes in a fresh Bun process for the exact arguments", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracework-sdk-restart-"));
  try {
    for (const mode of ["pause", "resume"]) {
      const proc = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "../scripts/sdk-restart-fixture.ts"),
          mode,
          join(dir, "state.json"),
        ],
        { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH! } },
      );
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect({ code, err }).toEqual({ code: 0, err: "" });
      expect(out.trim()).toBe(mode === "pause" ? "paused" : "resumed");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
