import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const markdown = `# Service desk brief

Synthetic document for reader verification.

## Request intake

Customers can **request a repair** without creating an account. The service desk confirms a time by email.

> Keep the original request attached to the appointment.

### Required information

- Customer name and contact details
- Device model and a description of the issue
- Preferred appointment time

| Field | Required |
| --- | --- |
| Email address | Yes |
| Device model | Yes |

\`\`\`json
{ "status": "requested", "channel": "email" }
\`\`\`

## Review and ownership

The service desk owns scheduling. A technician records the diagnosis and confirms the repair estimate before work begins.

<script>window.readerUnsafe = true</script>
`;

async function workspace(page: any, name: string, content: number[] | string) {
  await page.goto("/");
  await page.evaluate(
    async ({ name, content }: { name: string; content: number[] | string }) => {
      const { csrf } = await (await fetch("/api/session")).json();
      const w = await (
        await fetch("/api/workspaces", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tracework-CSRF": csrf,
          },
          body: JSON.stringify({
            name: "Synthetic reader test",
            description: "Automated source viewer verification",
          }),
        })
      ).json();
      const form = new FormData();
      form.set(
        "file",
        new File(
          [typeof content === "string" ? content : new Uint8Array(content)],
          name,
        ),
      );
      form.set("classification", "public");
      await fetch(`/api/workspaces/${w.id}/sources`, {
        method: "POST",
        headers: { "X-Tracework-CSRF": csrf },
        body: form,
      });
      localStorage.setItem("tracework.workspace", w.id);
    },
    { name, content },
  );
  await page.reload();
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: name })
      .getByText("ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(name.replace(".", "\\.")) })
    .filter({ has: page.locator("strong") })
    .click();
  await expect(
    page.getByRole("region", { name: "Source document" }),
  ).toBeVisible();
}

test("Markdown reading, draft recovery, versioned editing and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await workspace(page, "service-desk.md", markdown);
  await expect(
    page.getByRole("heading", { name: "Service desk brief" }),
  ).toBeVisible();
  await expect(page.locator(".document-prose table")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).readerUnsafe),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.getByLabel("Document content")).toContainText(
    "# Service desk brief",
  );
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await mkdir(".impeccable/review", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: ".impeccable/review/source-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/source-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document text" })
    .fill(markdown + "\nUpdated by the source owner.\n");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".document-prose")).toContainText(
    "Updated by the source owner.",
  );
  await page.getByRole("button", { name: "All sources", exact: true }).click();
  await page.locator(".source-name").click();
  await page.getByRole("button", { name: "Resume edits", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document text" })
    .press("ControlOrMeta+End");
  await expect(
    page.getByRole("textbox", { name: "Document text" }),
  ).toContainText("Updated by the source owner.");
  await page.screenshot({
    path: ".impeccable/review/source-edit-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(
    page.getByLabel("Document version").locator("option:checked"),
  ).toContainText("Version 2");
  await expect(page.locator(".document-prose")).toContainText(
    "Updated by the source owner.",
  );
  const versions = page.getByLabel("Document version");
  await versions.selectOption({ label: "Version 1 · ready" });
  await expect(page.locator(".document-prose")).not.toContainText(
    "Updated by the source owner.",
  );
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  const historicalVersion = await versions.inputValue();
  await page.evaluate((vid) => {
    const wid = localStorage.getItem("tracework.workspace");
    localStorage.setItem(
      `tracework.source-draft.${wid}.${vid}`,
      "Retained edits from another tab.",
    );
  }, historicalVersion);
  await versions.selectOption({ index: 0 });
  await versions.selectOption(historicalVersion);
  await expect(
    page.getByRole("button", { name: "Download draft", exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download draft", exact: true })
    .click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("draft-service-desk.md");
  let recovered = "";
  for await (const chunk of (await downloaded.createReadStream())!)
    recovered += chunk.toString();
  expect(recovered).toBe("Retained edits from another tab.");
  await page.screenshot({
    path: ".impeccable/review/source-draft-desktop.png",
    fullPage: true,
  });
  await versions.selectOption({ index: 0 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document text" })
    .fill("Discard this change");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".document-prose")).toContainText(
    "Updated by the source owner.",
  );
  await page.reload();
  await page.locator(".source-name").click();
  await expect(page.locator(".document-prose")).toContainText(
    "Updated by the source owner.",
  );
  expect(errors).toEqual([]);
});

function pdf() {
  const stream = (text: string) => {
    const data = `BT /F1 24 Tf 50 740 Td (${text}) Tj ET`;
    return `<< /Length ${data.length} >>\nstream\n${data}\nendstream`;
  };
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    stream("Synthetic PDF - service desk brief"),
    stream("Page two - reviewed requirements"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let doc = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(doc.length);
    doc += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = doc.length;
  doc += `xref\n0 8\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return [...new TextEncoder().encode(doc)];
}

test("PDF renders selectable pages, zoom and rotation on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await workspace(page, "service-desk.pdf", pdf());
  await expect(page.locator(".pdf-viewport")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".textLayer")).toContainText("Synthetic PDF");
  await page.screenshot({
    path: ".impeccable/review/pdf-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".textLayer")).toContainText("Page two");
  await page.getByLabel("PDF zoom").selectOption("1.5");
  await expect(page.locator(".pdf-viewport")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("button", { name: "Rotate page", exact: true }).click();
  await expect(page.locator(".pdf-viewport")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByLabel("PDF zoom").selectOption("fit");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pdf-viewport")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.screenshot({
    path: ".impeccable/review/pdf-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.locator(".textLayer")).toContainText("Synthetic PDF");
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("plain text opens literally and can be edited", async ({ page }) => {
  await workspace(
    page,
    "notes.txt",
    "<h1>Keep this literal</h1>\nPlain source notes.",
  );
  await expect(page.getByLabel("Document content")).toContainText(
    "<h1>Keep this literal</h1>",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document text" })
    .fill("Revised plain text.");
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(page.getByLabel("Document content")).toHaveText(
    "Revised plain text.",
  );
});

test("CodeMirror highlights Markdown and fenced code, with read-only source and persistent edit history", async ({
  page,
}) => {
  await workspace(
    page,
    "syntax.md",
    '# Markdown source\n\nSynthetic syntax-colouring fixture.\n\n**Bold**, *italic*, and a [reference](https://example.com).\n\n> Keep the original source.\n\n- A list item\n\n```json\n{ "status": "requested", "count": 2 }\n```\n\nCustomers can request a repair.\n',
  );
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const source = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  await expect(source).toHaveAttribute("aria-readonly", "true");
  await expect(source).toHaveAttribute("contenteditable", "false");
  await expect(source.locator(".cm-md-heading").first()).toBeVisible();
  await expect(source.locator(".cm-md-strong").first()).toBeVisible();
  await expect(source.locator(".cm-md-link").first()).toBeVisible();
  // JSON code fences load their own language support.
  await expect(
    source.locator(".cm-md-property").filter({ hasText: '"status"' }),
  ).toBeVisible();
  expect(
    await source
      .locator(".cm-md-heading")
      .first()
      .evaluate((e) => getComputedStyle(e).color),
  ).not.toBe(await source.evaluate((e) => getComputedStyle(e).color));
  const original = await source.textContent();
  await source.focus();
  await page.keyboard.press("x");
  expect(await source.textContent()).toBe(original);
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.locator(".cm-search")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Find", exact: true })
    .pressSequentially("Customers");
  await expect(page.locator(".cm-searchMatch").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
  await source.press("ControlOrMeta+Home");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: ".impeccable/review/codemirror-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/codemirror-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Document text",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("aria-readonly", "false");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nA syntax-coloured edit.");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".document-prose")).toContainText(
    "A syntax-coloured edit.",
  );
  await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(editor).toBeFocused();
  await editor.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("A syntax-coloured edit.");
  await editor.press("ControlOrMeta+Shift+z");
  await expect(editor).toContainText("A syntax-coloured edit.");
  await editor.press("ControlOrMeta+Home");
  await expect(editor.locator(".cm-md-heading").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".impeccable/review/codemirror-edit-desktop.png",
    fullPage: true,
  });
  await editor.press("Tab");
  await expect(editor).not.toBeFocused();
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(page.locator(".document-prose")).toContainText(
    "A syntax-coloured edit.",
  );
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(source).toContainText("A syntax-coloured edit.");
});
