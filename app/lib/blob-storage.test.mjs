import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { Readable } from "node:stream";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const originalCwd = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "central-hub-blobs-"));
process.chdir(tempRoot);
const envNames = ["AZURE_STORAGE_ACCOUNT_NAME", "AZURE_STORAGE_CONTAINER_NAME", "WEBSITE_INSTANCE_ID"];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
process.env.AZURE_STORAGE_ACCOUNT_NAME = "overheadfilesstorage";
process.env.AZURE_STORAGE_CONTAINER_NAME = "application-files";
process.env.WEBSITE_INSTANCE_ID = "test-instance";
after(async () => {
  process.chdir(originalCwd);
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

const blobs = new Map();
const state = { organizationId: 2, permissions: ["projects.read", "projects.write"], outage: null, sqlFailure: false, metadata: [], credentials: [] };
const storageError = statusCode => Object.assign(new Error(`Storage ${statusCode}`), { statusCode });
const container = {
  getBlobClient(key) {
    return {
      async getProperties() {
        if (state.outage) throw storageError(state.outage);
        if (!blobs.has(key)) throw storageError(404);
        return { contentLength: blobs.get(key).length };
      },
      async download(start = 0, count) {
        if (state.outage) throw storageError(state.outage);
        if (!blobs.has(key)) throw storageError(404);
        const buffer = blobs.get(key);
        return { readableStreamBody: Readable.from([buffer.subarray(start, count === undefined ? undefined : start + count)]) };
      },
      async delete() { blobs.delete(key); },
    };
  },
  getBlockBlobClient(key) {
    return {
      async uploadData(buffer, options) {
        if (state.outage) throw storageError(state.outage);
        assert.equal(options.conditions.ifNoneMatch, "*", "uploads must never overwrite");
        assert.ok(options.blobHTTPHeaders.blobContentType);
        if (blobs.has(key)) throw storageError(412);
        blobs.set(key, buffer);
      },
    };
  },
  async *listBlobsByHierarchy(delimiter, { prefix }) {
    if (state.outage) throw storageError(state.outage);
    assert.equal(delimiter, "/");
    const emitted = new Set();
    for (const [key, value] of blobs) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const slash = suffix.indexOf("/");
      const name = slash < 0 ? key : prefix + suffix.slice(0, slash + 1);
      if (emitted.has(name)) continue;
      emitted.add(name);
      yield slash < 0
        ? { kind: "blob", name, properties: { contentLength: value.length, lastModified: new Date("2026-10-18") } }
        : { kind: "prefix", name };
    }
  },
};
globalThis.blobStorageTest = { state, container, getPool: async () => ({
  request() {
    const inputs = {};
    return {
      input(name, type, value) { inputs[name] = value; return this; },
      async query(query) {
        if (state.sqlFailure) throw new Error("Database insert failed");
        if (query.includes("INSERT INTO dbo.ProjectAttachments")) {
          state.metadata.push(inputs);
          return { recordset: [{ attachmentId: state.metadata.length }] };
        }
        const row = state.metadata.find(item => item.org === inputs.org && item.project === inputs.project && state.metadata.indexOf(item) + 1 === inputs.id);
        return { recordset: row ? [{ fileName: row.name, storageKey: row.key, contentType: row.type, sizeBytes: row.size }] : [] };
      },
    };
  },
}) };

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/")) return nextResolve(`${specifier}.ts`, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    let source;
    if (url.includes("/node_modules/@azure/identity/")) source = `
      export class ManagedIdentityCredential { constructor() { globalThis.blobStorageTest.state.credentials.push("managed"); } }
      export class DefaultAzureCredential { constructor() { globalThis.blobStorageTest.state.credentials.push("default"); } }`;
    if (url.includes("/node_modules/@azure/storage-blob/")) source = `
      export class BlobServiceClient {
        constructor(url) { if (url !== "https://overheadfilesstorage.blob.core.windows.net") throw new Error("Wrong account"); }
        getContainerClient(name) { if (name !== "application-files") throw new Error("Wrong container"); return globalThis.blobStorageTest.container; }
      }`;
    if (url === new URL("./db.ts", import.meta.url).href) source = `
      export const sql = { Int: {}, VarChar: () => ({}), NVarChar: () => ({}), BigInt: {} };
      export const getPool = globalThis.blobStorageTest.getPool;`;
    if (url === new URL("./project-access.ts", import.meta.url).href) source = `
      import { ProjectAccessError } from "./project-access-error.ts";
      export { ProjectAccessError };
      export async function requireProjectSession(request, permission) {
        const state = globalThis.blobStorageTest.state;
        if (!state.permissions.includes(permission)) throw new ProjectAccessError("Forbidden", 403);
        return { organization: { organizationId: state.organizationId } };
      }
      export async function requireProject() {}`;
    return source === undefined ? nextLoad(url, context) : { format: "module", shortCircuit: true, source };
  },
});

const { NextRequest } = await import("next/server.js");
const storage = await import("./file-storage.ts");
const config = await import("./blob-storage.ts");
const attachments = await import("./project-attachments.ts");
const list = await import("../api/files/list/route.ts");
const content = await import("../api/files/content/route.ts");
const preview = await import("../api/files/preview/route.ts");
const upload = await import("../api/files/upload/route.ts");
const folder = await import("../api/files/create-folder/route.ts");
const attachmentRoute = await import("../api/projects/[projectId]/attachments/[attachmentId]/route.ts");
const request = url => new NextRequest(`http://localhost${url}`);
function uploadRequest(name, contents = "Company A") {
  const form = new FormData();
  form.set("path", "");
  form.set("file", new File([contents], name));
  return new NextRequest("http://localhost/api/files/upload", { method: "POST", body: form });
}
const params = id => ({ params: Promise.resolve({ projectId: "13", attachmentId: String(id) }) });

test("App Service requires complete configuration and uses its managed identity", () => {
  assert.ok(config.blobContainer());
  assert.deepEqual(state.credentials, ["managed"]);
  delete process.env.AZURE_STORAGE_CONTAINER_NAME;
  assert.throws(() => config.blobContainer(), /Configure valid/);
  delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
  assert.throws(() => config.blobContainer(), /Configure valid/, "Azure must not fall back to local disk");
  process.env.AZURE_STORAGE_ACCOUNT_NAME = "overheadfilesstorage";
  process.env.AZURE_STORAGE_CONTAINER_NAME = "application-files";
});

test("blob-backed Files preserves listing, empty folders, previews, duplicates and tenant isolation", async () => {
  assert.equal((await upload.POST(uploadRequest("private.txt"))).status, 201);
  assert.equal((await upload.POST(uploadRequest("private.txt", "overwrite"))).status, 409);
  const create = () => new NextRequest("http://localhost/api/files/create-folder", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: "", name: "empty" }),
  });
  assert.equal((await folder.POST(create())).status, 201);
  assert.equal((await folder.POST(create())).status, 409);
  assert.deepEqual((await (await list.GET(request("/api/files/list"))).json()).entries.map(item => [item.name, item.type]), [
    ["empty", "directory"], ["private.txt", "file"],
  ]);
  assert.deepEqual(await storage.listDirectory("empty", 2), []);
  assert.equal(await (await content.GET(request("/api/files/content?path=private.txt"))).text(), "Company A");
  assert.equal((await content.GET(request("/api/files/content?path=empty"))).status, 404);
  assert.equal((await upload.POST(uploadRequest("empty"))).status, 409);
  assert.equal((await upload.POST(uploadRequest("private.txt/child"))).status, 409);
  assert.equal((await upload.POST(uploadRequest("nested/deeper/test.txt"))).status, 201);
  assert.deepEqual((await storage.listDirectory("nested", 2)).map(item => item.name), ["deeper"]);

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", "<slide><text>Private A slide</text></slide>");
  assert.equal((await upload.POST(uploadRequest("slides.pptx", await zip.generateAsync({ type: "nodebuffer" })))).status, 201);
  assert.deepEqual(await (await preview.GET(request("/api/files/preview?path=slides.pptx"))).json(),
    { kind: "slides", slides: [{ index: 1, texts: ["Private A slide"] }] });
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Test sheet").addRow(["Private A cell"]);
  assert.equal((await upload.POST(uploadRequest("sheet.xlsx", await workbook.xlsx.writeBuffer()))).status, 201);
  const sheetPreview = await preview.GET(request("/api/files/preview?path=sheet.xlsx"));
  assert.equal(sheetPreview.status, 200);
  assert.match((await sheetPreview.json()).html, /Private A cell/);

  state.organizationId = 3;
  assert.deepEqual(await (await list.GET(request("/api/files/list"))).json(), { entries: [] });
  assert.equal((await content.GET(request("/api/files/content?path=private.txt"))).status, 404);
  assert.equal((await preview.GET(request("/api/files/preview?path=slides.pptx"))).status, 404);
  assert.equal((await upload.POST(uploadRequest("private.txt", "Company B"))).status, 201);
  assert.equal(await (await content.GET(request("/api/files/content?path=private.txt"))).text(), "Company B");
  assert.equal(blobs.get("files/organizations/2/private.txt").toString(), "Company A");
  for (const value of ["../2/private.txt", "..\\2\\private.txt", "/private.txt", "C:\\private.txt", "NUL.txt"]) {
    await assert.rejects(() => storage.writeFile(value, 3, Buffer.from("bad")), error => error.status === 400);
  }
  state.permissions = ["projects.read"];
  assert.equal(await (await content.GET(request("/api/files/content?path=private.txt"))).text(), "Company B");
  assert.equal((await upload.POST(uploadRequest("blocked.txt"))).status, 403);
  assert.equal((await folder.POST(create())).status, 403);
  state.permissions.push("projects.write");
  await assert.rejects(() => fs.stat(path.join(tempRoot, "storage")), { code: "ENOENT" });
});

test("Azure authorization and service failures are not disguised as empty directories or local success", async () => {
  const missingContainer = Object.assign(storageError(404), { code: "ContainerNotFound" });
  assert.throws(() => config.describeBlobError(missingContainer), error => error === missingContainer);
  await assert.rejects(() => config.blobSize({
    getBlobClient: () => ({ getProperties: async () => ({}) }),
  }, "missing-length"), /invalid content length/);
  for (const status of [403, 503]) {
    state.outage = status;
    await assert.rejects(() => storage.listDirectory("", 3), error => error.statusCode === status);
    await assert.rejects(() => storage.writeFile("failed.txt", 3, Buffer.from("failed")), error => error.statusCode === status);
    await assert.rejects(() => storage.readFileContent("private.txt", 3), error => error.statusCode === status);
  }
  state.outage = null;
});

test("project uploads use a separate tenant namespace, preserve ranges, and clean up after SQL failure", async () => {
  state.organizationId = 2;
  const id = await attachments.saveProjectAttachment(13, 2, 3, "document", new File(["0123456789"], "test.pdf"));
  const row = await attachments.getProjectAttachment(13, 2, id);
  assert.ok(blobs.has(`project-attachments/organizations/2/${row.storageKey}`));
  const response = await attachmentRoute.GET(new NextRequest("http://localhost/api/projects/13/attachments/1", { headers: { Range: "bytes=2-5" } }), params(id));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await response.text(), "2345");
  const invalid = await attachmentRoute.GET(new NextRequest("http://localhost/api/projects/13/attachments/1", { headers: { Range: "bytes=99-100" } }), params(id));
  assert.equal(invalid.status, 416);
  state.organizationId = 3;
  assert.equal((await attachmentRoute.GET(request("/api/projects/13/attachments/1"), params(id))).status, 404);
  const before = new Set(blobs.keys());
  state.sqlFailure = true;
  await assert.rejects(() => attachments.saveProjectAttachment(14, 3, 5, "document", new File(["failed"], "failed.pdf")), /Database insert failed/);
  state.sqlFailure = false;
  assert.deepEqual(new Set(blobs.keys()), before);
  await assert.rejects(() => fs.stat(path.join(tempRoot, "storage")), { code: "ENOENT" });
});

test("unconfigured local development preserves project attachment storage and range downloads", async () => {
  for (const name of envNames) delete process.env[name];
  assert.equal(config.blobContainer(), null);
  state.organizationId = 2;
  const id = await attachments.saveProjectAttachment(13, 2, 3, "document", new File(["local content"], "local.txt"));
  const row = await attachments.getProjectAttachment(13, 2, id);
  assert.equal(await fs.readFile(attachments.attachmentPath(row.storageKey), "utf8"), "local content");
  assert.equal(await attachments.projectAttachmentSize(row.storageKey, 2), 13);
  const body = await attachments.projectAttachmentContent(row.storageKey, 2, { start: 0, end: 4 });
  assert.equal(await new Response(body).text(), "local");
});
