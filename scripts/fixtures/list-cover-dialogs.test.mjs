// Browser-only UI fixture: real dialogs, mocked actions, no credentials or app DB.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../..");
const WORK = resolve(ROOT, "node_modules/.cache/watchflow-cover-browser");
const executable = process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : chromium.executablePath();

test("real create/edit cover dialogs: selection, retry, remove/undo, cancellation and mobile layout", {
  timeout: 120000, skip: !existsSync(executable),
}, async () => {
  await mkdir(WORK, { recursive: true });
  await writeFile(resolve(WORK, "index.html"), '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(resolve(WORK, "actions.ts"), `
    export async function createListAction(previous, data) { return submit(previous, data); }
    export async function updateListAction(previous, data) { return submit(previous, data); }
    function submit(previous, data) {
      const file=data.get('coverImage');
      window.__submissions.push({ name:data.get('name'), operation:data.get('coverOperation'), fileSize:file?.size||0 });
      return {status:window.__fail?'error':'success',message:window.__fail?'Try again safely.':'List saved.',fieldErrors:{},requestId:previous.requestId+1};
    }
  `);
  await writeFile(resolve(WORK, "navigation.ts"), "export function useRouter(){return {replace(){}}}");
  await writeFile(resolve(WORK, "image.tsx"), `import React from 'react';export default function Image({unoptimized,fill,...props}){return <img {...props}/>}`);
  await writeFile(resolve(WORK, "main.tsx"), `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CreateListDialog} from '@/components/lists/create-list-dialog';
    import {EditListDialog} from '@/components/lists/edit-list-dialog';
    import '@/app/globals.css';
    window.__submissions=[];window.__fail=false;
    const list={id:'22222222-2222-4222-8222-222222222222',name:'Weekend Movies',description:'Movies worth making time for.',visibility:'private',createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z',thumbnailPath:'list-thumbnails/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp'};
    createRoot(document.getElementById('root')).render(<main style={{padding:24,display:'flex',gap:16}}><CreateListDialog/><EditListDialog list={list}/></main>);
  `);
  const image = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#253849" } }).png().toBuffer();
  const server = await createServer({ root: WORK, configFile: false, envDir: false, cacheDir: resolve(WORK, ".vite"),
    logLevel: "error", oxc: { jsx: { runtime: "automatic" } },
    define: { "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("https://fixture.invalid"),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("fixture-only-public-key") },
    resolve: { dedupe: ["react", "react-dom"], alias: [
      { find: "@/app/(app)/actions/lists", replacement: resolve(WORK, "actions.ts") },
      { find: "next/navigation", replacement: resolve(WORK, "navigation.ts") },
      { find: "next/image", replacement: resolve(WORK, "image.tsx") }, { find: "@", replacement: ROOT },
    ] }, css: { postcss: ROOT }, server: { host: "127.0.0.1", port: 0, fs: { allow: [ROOT] } } });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch({ executablePath: executable, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname.startsWith("/api/artwork/")) return route.fulfill({ contentType: "image/png", body: image });
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("button", { name: "Create a custom movie list" }).click();
    let dialog = page.getByRole("dialog", { name: "Create a custom list" });
    await dialog.getByLabel("List name", { exact: true }).fill("Friday Films");
    assert.equal(await dialog.getByRole("button", { name: "Upload cover image" }).count(), 1);
    await page.screenshot({ path: resolve(WORK, "create-desktop.png") });
    assert.ok((await dialog.getByRole("button", { name: "Create List", exact: true }).boundingBox()).y < 850);
    await dialog.getByLabel("Choose cover image", { exact: true }).setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: image });
    await dialog.getByAltText("Selected cover preview").waitFor();
    await page.evaluate(() => { window.__fail = true; });
    await dialog.getByRole("button", { name: "Create List", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Try again safely." }).waitFor();
    // Native form reset must not lose the selected bytes while preview persists.
    await dialog.getByRole("button", { name: "Create List", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__submissions.length), 2);
    assert.ok((await page.evaluate(() => window.__submissions)).every(s => s.fileSize > 0 && s.operation === "upload" && s.name === "Friday Films"));
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Create a custom movie list" }).click();
    dialog = page.getByRole("dialog", { name: "Create a custom list" });
    assert.equal(await dialog.getByAltText("Selected cover preview").count(), 0);
    assert.equal(await dialog.getByLabel("List name", { exact: true }).inputValue(), "");
    await dialog.getByLabel("Choose cover image", { exact: true }).setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    assert.equal(await dialog.getByRole("button", { name: "Create List", exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "Clear selection" }).click();
    assert.equal(await dialog.getByRole("button", { name: "Create List", exact: true }).isDisabled(), false);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Edit Weekend Movies" }).click();
    dialog = page.getByRole("dialog", { name: "Edit list" });
    await dialog.getByAltText("Current list cover").waitFor();
    await dialog.getByRole("button", { name: "Remove cover", exact: true }).click();
    assert.equal(await dialog.locator('input[name="coverOperation"]').inputValue(), "remove");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__submissions.length), 2);
    await page.getByRole("button", { name: "Edit Weekend Movies" }).click();
    dialog = page.getByRole("dialog", { name: "Edit list" });
    await dialog.getByAltText("Current list cover").waitFor();
    assert.equal(await dialog.locator('input[name="coverOperation"]').inputValue(), "keep");
    await dialog.getByRole("button", { name: "Remove cover", exact: true }).click();
    await dialog.getByRole("button", { name: "Undo removal" }).click();
    assert.equal(await dialog.locator('input[name="coverOperation"]').inputValue(), "keep");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(WORK, "edit-mobile.png") });
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    const cancelBounds = await dialog.getByRole("button", { name: "Cancel", exact: true }).boundingBox();
    assert.ok(cancelBounds.y + cancelBounds.height <= 844);
    await dialog.getByRole("button", { name: "Remove cover", exact: true }).click();
    await page.evaluate(() => { window.__fail = false; });
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__submissions.at(-1).operation), "remove");
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
