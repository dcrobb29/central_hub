import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectAccessError } from "./project-access-error.ts";

const originalCwd = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "central-hub-access-"));
process.chdir(tempRoot);
after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});
const state = { session: null, calls: [], invoices: [] };
globalThis.accessBoundaryTest = state;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const call = (name) => `async (...args) => { globalThis.accessBoundaryTest.calls.push({name: "${name}", args}); return {}; }`;
    const sources = {
      "project-access.ts": `
        import { ProjectAccessError } from "./project-access-error.ts";
        export { ProjectAccessError };
        export async function requireProjectSession(request, permission) {
          const session = globalThis.accessBoundaryTest.session;
          if (!session) throw new ProjectAccessError("Please sign in.", 401);
          if (!session.permissions.includes(permission)) throw new ProjectAccessError("Forbidden", 403);
          return session;
        }
        export const requireProject = async () => {};`,
      "account.ts": [
        "getOrganizationSettings", "updateOrganizationName", "addOrganizationMember",
        "updateOrganizationMember", "linkMembershipEmployee", "unlinkMembershipEmployee",
        "setEmployeeActiveStatus", "deleteOrArchiveEmployee",
      ].map((name) => `export const ${name} = ${call(name)};`).join("\n"),
      "invoice-settings.ts": `
        export const updateOrganizationInvoiceSettings = ${call("updateOrganizationInvoiceSettings")};
        export const getOrganizationInvoiceSettings = ${call("getOrganizationInvoiceSettings")};
        export const peekNextInvoiceNumber = ${call("peekNextInvoiceNumber")};
        export const interpolateEmailTemplate = () => "";`,
      "invoices.ts": `
        export const getInvoices = async (...args) => {
          globalThis.accessBoundaryTest.calls.push({name: "getInvoices", args});
          return globalThis.accessBoundaryTest.invoices;
        };
        export const addInvoice = ${call("addInvoice")};
        export const updateInvoice = ${call("updateInvoice")};
        export const deleteInvoice = ${call("deleteInvoice")};
        export const recordInvoiceEmailed = ${call("recordInvoiceEmailed")};`,
      "project-invoice-pdf.ts": `export const renderProjectInvoicePdf = async () => Buffer.from("PDF");`,
      "project-billing.ts": `export const getProjectInvoiceBilling = async () => null;`,
      "customers.ts": `export const getCustomers = async () => [];`,
      "email.ts": `export const sendEmail = ${call("sendEmail")};`,
    };
    for (const [file, source] of Object.entries(sources)) {
      if (url === new URL(`./${file}`, import.meta.url).href) return { format: "module", shortCircuit: true, source };
    }
    return nextLoad(url, context);
  },
});

const { NextRequest } = await import("next/server.js");
const settings = await import("../api/account/settings/route.ts");
const template = await import("../api/account/settings/invoice-template/preview/route.ts");
const invoices = await import("../api/finances/invoices/route.ts");
const invoice = await import("../api/finances/invoices/[id]/route.ts");
const number = await import("../api/finances/invoices/next-number/route.ts");
const email = await import("../api/finances/invoices/[id]/email/route.ts");
const fileList = await import("../api/files/list/route.ts");
const fileContent = await import("../api/files/content/route.ts");
const filePreview = await import("../api/files/preview/route.ts");
const fileUpload = await import("../api/files/upload/route.ts");
const fileFolder = await import("../api/files/create-folder/route.ts");
const storage = await import("./file-storage.ts");
const session = (permissions, organizationId = 7) => {
  state.session = { organization: { organizationId }, permissions };
  state.calls = [];
};
const request = (url, body) => new NextRequest(`http://localhost${url}`, body === undefined ? undefined : {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const invoiceParams = () => ({ params: Promise.resolve({ id: "12" }) });
const invoiceBody = {
  invoiceDate: "2026-10-16", invoiceDueDate: "2026-11-16", invoiceAmount: "100.00",
};

test("settings and template routes reject anonymous, non-admin, and cross-tenant access", async () => {
  for (const permissions of [null, []]) {
    state.session = null;
    if (permissions) session(permissions);
    const expected = permissions ? 403 : 401;
    assert.equal((await settings.GET(request("/api/account/settings"))).status, expected);
    assert.equal((await settings.POST(request("/api/account/settings", { action: "update-organization-name", name: "Other" }))).status, expected);
    assert.equal((await template.GET(request("/api/account/settings/invoice-template/preview"))).status, expected);
    assert.equal((await template.POST(request("/api/account/settings/invoice-template/preview", {}))).status, expected);
  }
  session(["organization.manage", "members.manage"]);
  assert.equal((await settings.GET(request("/api/account/settings?organizationId=8"))).status, 403);
  assert.equal((await settings.POST(request("/api/account/settings", {
    action: "update-member", organizationId: 8, membershipId: 3, accessRoleId: 4,
  }))).status, 403);
  assert.equal((await template.GET(request("/api/account/settings/invoice-template/preview?organizationId=8"))).status, 403);
  assert.deepEqual(state.calls, []);
  assert.equal((await settings.GET(request("/api/account/settings"))).status, 200);
  assert.equal(state.calls[0].args[0], 7);
  state.calls = [];
  assert.equal((await template.GET(request("/api/account/settings/invoice-template/preview"))).status, 200);
  assert.deepEqual(state.calls[0], { name: "getOrganizationInvoiceSettings", args: [7] });
  assert.equal((await template.POST(request("/api/account/settings/invoice-template/preview", {}))).status, 200);
});

test("settings mutations require action-specific grants and always use the session tenant", async () => {
  const actions = [
    { action: "add-member", email: "new@example.com", displayName: "New", accessRoleId: 2 },
    { action: "update-member", membershipId: 3, accessRoleId: 2 },
    { action: "link-employee", membershipId: 3, employeeId: 4 },
    { action: "unlink-employee", membershipId: 3 },
    { action: "toggle-employee-active", employeeId: 4, isActive: false },
    { action: "delete-employee", employeeId: 4 },
    { action: "update-invoice-settings", invoiceSettings: {} },
  ];
  for (const body of actions) {
    session(["organization.manage"]);
    assert.equal((await settings.POST(request("/api/account/settings", body))).status, 403, body.action);
    assert.deepEqual(state.calls, []);
  }
  session(["organization.manage", "members.manage", "personnel.write", "finances.write"]);
  for (const body of actions) {
    const response = await settings.POST(request("/api/account/settings", body));
    assert.ok([200, 201].includes(response.status), `${body.action}: ${await response.text()}`);
  }
  assert.ok(state.calls.every((call) => call.args[0] === 7));
});

test("invoice routes enforce finance reads/writes independently of UI visibility", async () => {
  state.session = null;
  state.calls = [];
  assert.equal((await invoices.GET(request("/api/finances/invoices"))).status, 401);
  assert.equal((await number.GET(request("/api/finances/invoices/next-number"))).status, 401);
  assert.equal((await invoices.POST(request("/api/finances/invoices", invoiceBody))).status, 401);
  assert.equal((await invoice.PUT(request("/api/finances/invoices/12", invoiceBody), invoiceParams())).status, 401);
  assert.equal((await invoice.DELETE(request("/api/finances/invoices/12"), invoiceParams())).status, 401);
  assert.equal((await email.POST(request("/api/finances/invoices/12/email", {}), invoiceParams())).status, 401);
  assert.deepEqual(state.calls, []);
  session([]);
  assert.equal((await invoices.GET(request("/api/finances/invoices"))).status, 403);
  assert.equal((await number.GET(request("/api/finances/invoices/next-number"))).status, 403);
  session(["finances.read"]);
  assert.equal((await invoices.GET(request("/api/finances/invoices?organizationId=8"))).status, 200);
  assert.deepEqual(state.calls[0].args, [{ organizationId: 7 }]);
  assert.equal((await number.GET(request("/api/finances/invoices/next-number"))).status, 200);
  state.calls = [];
  assert.equal((await invoices.POST(request("/api/finances/invoices", invoiceBody))).status, 403);
  assert.equal((await invoice.PUT(request("/api/finances/invoices/12", invoiceBody), invoiceParams())).status, 403);
  assert.equal((await invoice.DELETE(request("/api/finances/invoices/12"), invoiceParams())).status, 403);
  assert.equal((await email.POST(request("/api/finances/invoices/12/email", {}), invoiceParams())).status, 403);
  assert.deepEqual(state.calls, []);
  session(["finances.write"]);
  assert.equal((await invoices.POST(request("/api/finances/invoices", invoiceBody))).status, 201);
  assert.equal((await invoice.PUT(request("/api/finances/invoices/12", invoiceBody), invoiceParams())).status, 200);
  assert.equal((await invoice.DELETE(request("/api/finances/invoices/12"), invoiceParams())).status, 200);
  assert.equal((await email.POST(request("/api/finances/invoices/12/email", {}), invoiceParams())).status, 404);
  assert.equal(state.calls.find((call) => call.name === "addInvoice").args[1], 7);
  assert.equal(state.calls.find((call) => call.name === "updateInvoice").args[2], 7);
  assert.deepEqual(state.calls.find((call) => call.name === "deleteInvoice").args, [12, 7]);
  assert.deepEqual(state.calls.find((call) => call.name === "getInvoices").args, [{ invoiceId: 12, organizationId: 7 }]);
  assert.ok(!state.calls.some((call) => call.name === "sendEmail"));
});

function uploadRequest(name = "private.txt", contents = "Tenant seven") {
  const form = new FormData();
  form.set("path", "");
  form.set("file", new File([contents], name));
  return new NextRequest("http://localhost/api/files/upload", { method: "POST", body: form });
}

test("all file routes enforce read/write grants before touching tenant files", async () => {
  state.session = null;
  assert.equal((await fileList.GET(request("/api/files/list"))).status, 401);
  assert.equal((await fileContent.GET(request("/api/files/content?path=private.txt"))).status, 401);
  assert.equal((await filePreview.GET(request("/api/files/preview?path=private.docx"))).status, 401);
  assert.equal((await fileUpload.POST(uploadRequest())).status, 401);
  assert.equal((await fileFolder.POST(request("/api/files/create-folder", { path: "", name: "folder" }))).status, 401);
  session(["projects.read"]);
  assert.equal((await fileUpload.POST(uploadRequest())).status, 403);
  assert.equal((await fileFolder.POST(request("/api/files/create-folder", { path: "", name: "folder" }))).status, 403);
});

test("tenant file storage separates list/read/preview/upload/folders and leaves legacy files private", async () => {
  await fs.mkdir(storage.FILES_ROOT, { recursive: true });
  await fs.writeFile(path.join(storage.FILES_ROOT, "legacy.txt"), "Legacy shared data");
  session(["projects.read", "projects.write"]);
  assert.deepEqual(await (await fileList.GET(request("/api/files/list"))).json(), { entries: [] });
  assert.equal((await fileUpload.POST(uploadRequest())).status, 201);
  assert.equal((await fileUpload.POST(uploadRequest())).status, 409);
  const listed = await (await fileList.GET(request("/api/files/list"))).json();
  assert.deepEqual(listed.entries.map((entry) => entry.path), ["private.txt"]);
  const content = await fileContent.GET(request("/api/files/content?path=private.txt"));
  assert.equal(content.status, 200);
  assert.equal(await content.text(), "Tenant seven");
  assert.equal(content.headers.get("cache-control"), "private, no-store");
  assert.equal((await fileFolder.POST(request("/api/files/create-folder", { path: "", name: "folder" }))).status, 201);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", "<slide><text>Company seven</text></slide>");
  assert.equal((await fileUpload.POST(uploadRequest("slides.pptx", await zip.generateAsync({ type: "nodebuffer" })))).status, 201);
  const preview = await filePreview.GET(request("/api/files/preview?path=slides.pptx"));
  assert.equal(preview.status, 200);
  assert.deepEqual(await preview.json(), { kind: "slides", slides: [{ index: 1, texts: ["Company seven"] }] });

  session(["projects.read", "projects.write"], 8);
  assert.deepEqual(await (await fileList.GET(request("/api/files/list"))).json(), { entries: [] });
  assert.equal((await fileContent.GET(request("/api/files/content?path=private.txt"))).status, 404);
  assert.equal((await filePreview.GET(request("/api/files/preview?path=private.docx"))).status, 404);
  assert.equal((await filePreview.GET(request("/api/files/preview?path=slides.pptx"))).status, 404);
  assert.equal((await fileUpload.POST(uploadRequest("private.txt", "Tenant eight"))).status, 201);
  assert.equal(await (await fileContent.GET(request("/api/files/content?path=private.txt"))).text(), "Tenant eight");
  assert.equal(await fs.readFile(path.join(storage.organizationFilesRoot(7), "private.txt"), "utf8"), "Tenant seven");
  assert.equal(await fs.readFile(path.join(storage.FILES_ROOT, "legacy.txt"), "utf8"), "Legacy shared data");
});

test("tenant path resolver rejects traversal, alternate separators, reserved names and linked roots", async () => {
  for (const value of ["../7/private.txt", "..\\7\\private.txt", "/private.txt", "C:\\private.txt", "file:stream", "folder/../../private.txt", "folder.", "NUL.txt"]) {
    await assert.rejects(() => storage.resolveSafePath(value, 8), (error) => error instanceof ProjectAccessError && error.status === 400, value);
  }
  session(["projects.read", "projects.write"], 8);
  assert.equal((await fileList.GET(request("/api/files/list?path=..%2F7"))).status, 400);
  assert.equal((await fileContent.GET(request("/api/files/content?path=..%2F7%2Fprivate.txt"))).status, 400);
  assert.equal((await fileUpload.POST(uploadRequest("../7/overwrite.txt"))).status, 400);
  assert.equal((await fileFolder.POST(request("/api/files/create-folder", { path: "../7", name: "folder" }))).status, 400);
  for (const id of [0, -1, NaN, 1.5]) await assert.rejects(() => storage.resolveSafePath("", id), /Invalid organization/);
  const linkedRoot = storage.organizationFilesRoot(9);
  await fs.symlink(storage.organizationFilesRoot(7), linkedRoot, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => storage.resolveSafePath("private.txt", 9), (error) => error.status === 403);
  session(["projects.read"], 9);
  assert.equal((await fileContent.GET(request("/api/files/content?path=private.txt"))).status, 403);
});
