import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { calls: [] };
globalThis.tenantBoundaryTest = state;

const customer = {
  customerId: 202, firstName: "Tenant", lastName: "Customer", companyName: "Tenant Co",
  email: "tenant@example.test", phone: null, isActive: true,
  billingAddressLine1: null, billingAddressLine2: null, billingAddressCity: null,
  billingAddressState: null, billingAddressZip: null, shippingAddressLine1: null,
  shippingAddressLine2: null, shippingAddressCity: null, shippingAddressState: null,
  shippingAddressZip: null,
};

function error(number, message) {
  return Object.assign(new Error(message), { number });
}

function runQuery(query, inputs) {
  state.calls.push({ query, inputs: { ...inputs } });
  const normalized = query.replace(/\s+/g, " ").trim();
  const org = inputs.organizationId ?? inputs.orgId;

  if (normalized.includes("FROM dbo.Bills b")) {
    return { recordset: org === 22 ? [{
      id: "TENANTBILL", projectId: null, projectName: null, isSplit: false,
      billNo: "B-22", billDate: "2040-10-01", billDueDate: null, billPaidDate: null,
      billAmount: "100.00", companyName: "Tenant Supplier", billingAddressLine1: null,
      billingAddressLine2: null, billingAddressCity: null, billingAddressState: null, billingAddressZip: null,
    }] : [] };
  }
  if (normalized.startsWith("SELECT") && normalized.includes("FROM dbo.Customers")) {
    return { recordset: org === 22 ? [customer] : [] };
  }
  if (normalized.includes("FROM dbo.ProjectFinancialSummary")) {
    return { recordset: org === 22 ? [{
      projectId: 404, projectName: "Tenant Project", projectStatus: "Active",
      income: 100, paidIncome: 0, unpaidIncome: 100, percentOfIncome: 0,
      costs: 0, paidCosts: 0, unpaidCosts: 0, percentOfCosts: 0, profit: 100, profitMargin: 100,
    }] : [] };
  }
  if (normalized.includes("FROM dbo.Projects WITH(UPDLOCK,HOLDLOCK)")) {
    return { recordset: inputs.organizationId === 22 && inputs.projectId === 404
      ? [{ revisionId: null, engagementType: "Project" }]
      : [] };
  }
  if (normalized.includes("UPDATE dbo.Projects SET ProjectStatus")) {
    return { rowsAffected: [inputs.organizationId === 22 && inputs.projectId === 404 ? 1 : 0], recordset: [] };
  }
  if (normalized.includes("FROM dbo.Roles") && normalized.startsWith("SELECT CAST(RoleID")) {
    return { recordset: org === 22 ? [{ id: "22", name: "Tenant role" }] : [] };
  }
  if (normalized.includes("FROM dbo.Employees e")) {
    return { recordset: org === 22 ? [{ id: "300", name: "Tenant employee", roleId: "22", managerId: null }] : [] };
  }
  if (normalized.includes("UPDATE dbo.Bills SET") && normalized.includes("OUTPUT inserted")) {
    return { recordset: inputs.organizationId === 22 && inputs.id === "TENANTBILL" ? [{ id: inputs.id }] : [] };
  }
  if (normalized.startsWith("UPDATE dbo.Customers SET")) {
    return { rowsAffected: [inputs.orgId === 22 && inputs.customerId === 202 ? 1 : 0], recordset: [] };
  }
  if (normalized.includes("DECLARE @updated TABLE(customerId int)")) {
    return { recordset: inputs.orgId === 22 && inputs.customerId === 202 ? [{ customerId: 202 }] : [] };
  }
  if (normalized.includes("UPDATE dbo.Projects SET CustomerID")) {
    if (inputs.organizationId !== 22 && inputs.customerId === 202) {
      throw error(51040, "Choose an active customer in your organization");
    }
    return { rowsAffected: [inputs.organizationId === 22 && inputs.projectId === 404 ? 1 : 0], recordset: [] };
  }
  if (normalized.includes("UPDATE dbo.Employees")) {
    if (inputs.organizationId !== 22 && inputs.roleId === 22) throw error(51050, "Foreign role");
    if (inputs.organizationId !== 22 && inputs.managerId === 300) throw error(51051, "Foreign manager");
    return { recordset: inputs.organizationId === 22 && inputs.id === 300 ? [{ EmployeeID: 300 }] : [] };
  }
  if (normalized.includes("INSERT INTO dbo.EmployeeHistory")) {
    if (inputs.organizationId !== 22 && inputs.employeeId === 300) throw error(51052, "Foreign employee");
    return { rowsAffected: [inputs.organizationId === 22 && inputs.employeeId === 300 ? 1 : 0], recordset: [] };
  }
  if (normalized.includes("INSERT INTO dbo.Bills")) {
    if (inputs.projectId === 404 && inputs.organizationId !== 22) throw error(51043, "Foreign project");
    return { recordset: [], rowsAffected: [1] };
  }
  if (normalized.includes("INSERT INTO dbo.Projects")) return { recordset: [{ ProjectID: 505 }], rowsAffected: [1] };
  return { recordset: [], rowsAffected: [0] };
}

class FakeRequest {
  constructor() { this.inputs = {}; }
  input(name, _type, value) { this.inputs[name] = value; return this; }
  async query(query) { return runQuery(query, this.inputs); }
}

const fakeSql = {
  Int: "int", Bit: "bit", Date: "date", MAX: "max",
  VarChar: (size) => `varchar(${size})`,
  NChar: (size) => `nchar(${size})`,
  NVarChar: (size) => `nvarchar(${size})`,
  Decimal: (precision, scale) => `decimal(${precision},${scale})`,
  Transaction: class {
    constructor() { return globalThis.tenantBoundaryTest.transaction; }
  },
};
const transaction = {
  request: () => new FakeRequest(),
  begin: async () => {},
  commit: async () => {},
  rollback: async () => {},
};
state.transaction = transaction;
state.pool = { request: () => new FakeRequest() };

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/lib/")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = async () => globalThis.tenantBoundaryTest.pool; export const sql = globalThis.tenantBoundaryTest.sql;",
    };
    return nextLoad(url, context);
  },
});
state.sql = fakeSql;

const bills = await import("./bills.ts");
const customers = await import("./customers.ts");
const projects = await import("./projects.ts");
const personnel = await import("./personnel.ts");

test("tenant reads bind one organization and exclude other organizations", async () => {
  state.calls = [];
  assert.deepEqual((await bills.getBills({ organizationId: 11 })).map((row) => row.id), []);
  assert.deepEqual((await bills.getBills({ organizationId: 22 })).map((row) => row.id), ["TENANTBILL"]);
  assert.deepEqual((await customers.getCustomers(11)).map((row) => row.customerId), []);
  assert.deepEqual((await customers.getCustomers(22)).map((row) => row.customerId), [202]);
  assert.deepEqual((await projects.getProjectFinancialSummary({ organizationId: 11 })).map((row) => row.projectId), []);
  assert.deepEqual((await projects.getProjectFinancialSummary({ organizationId: 22 })).map((row) => row.projectId), [404]);
  assert.deepEqual((await personnel.getPersonnelData(11)).people, []);
  assert.deepEqual((await personnel.getPersonnelData(22)).people.map((row) => row.id), ["300"]);

  for (const { query, inputs } of state.calls) {
    assert.ok(query.includes("OrganizationID = @organizationId") || query.includes("OrganizationID = @orgId"), query);
    assert.ok([11, 22].includes(inputs.organizationId ?? inputs.orgId));
  }
});

test("bill and customer mutations reject foreign rows and allow same-tenant rows", async () => {
  state.calls = [];
  const billInput = {
    projectId: null, billNo: "B-22", billDate: new Date("2040-10-01"), billDueDate: null,
    billPaidDate: null, billAmount: "100.00", companyName: null,
    billingAddressLine1: null, billingAddressLine2: null, billingAddressCity: null,
    billingAddressState: null, billingAddressZip: null,
  };
  await assert.rejects(() => bills.updateBill("TENANTBILL", billInput, 11), bills.BillTenantError);
  await bills.updateBill("TENANTBILL", billInput, 22);

  const customerInput = {
    firstName: "Tenant", lastName: "Customer", companyName: null, email: null, phone: null,
    billingAddressLine1: null, billingAddressLine2: null, billingAddressCity: null,
    billingAddressState: null, billingAddressZip: null, shippingAddressLine1: null,
    shippingAddressLine2: null, shippingAddressCity: null, shippingAddressState: null,
    shippingAddressZip: null,
  };
  await assert.rejects(() => customers.saveCustomer(customerInput, 202, 11), customers.CustomerError);
  assert.equal(await customers.saveCustomer(customerInput, 202, 22), 202);

  for (const { query, inputs } of state.calls) {
    if (query.includes("UPDATE dbo.Bills SET")) {
      assert.match(query, /WHERE \[id\] = @id AND OrganizationID = @organizationId/);
      assert.equal(inputs.organizationId, inputs.organizationId === 11 ? 11 : 22);
    }
    if (query.includes("DECLARE @updated TABLE(customerId int)")) {
      assert.match(query, /WHERE CustomerID = @customerId AND OrganizationID = @orgId/);
      assert.ok([11, 22].includes(inputs.orgId));
    }
  }
});

test("project and personnel linked IDs cannot cross organization boundaries", async () => {
  state.calls = [];
  await assert.rejects(() => projects.updateProjectCustomer(404, 202, 11), (err) => err.number === 51040);
  assert.equal(await projects.updateProjectCustomer(404, 202, 22), true);

  const person = { id: 300, name: "Tenant employee", roleId: 22, managerId: null };
  await assert.rejects(() => personnel.updatePerson(person, 11), (err) => err.number === 51050);
  await assert.rejects(() => personnel.updatePerson({ ...person, roleId: 11, managerId: 300 }, 11), (err) => err.number === 51051);
  await personnel.updatePerson(person, 22);
  await assert.rejects(() => personnel.addEmployeeHistory({
    employeeId: 300, eventDate: "2040-10-01", notes: "Foreign history",
  }, 11), (err) => err.number === 51052);
  await personnel.addEmployeeHistory({ employeeId: 300, eventDate: "2040-10-01", notes: "Same tenant" }, 22);

  const projectCustomerCalls = state.calls.filter((call) => call.query.includes("UPDATE dbo.Projects SET CustomerID"));
  assert.ok(projectCustomerCalls.every(({ query }) =>
    query.includes("CustomerID = @customerId AND IsActive = 1 AND OrganizationID = @organizationId")
    && query.includes("ProjectID = @projectId AND CustomerID = @customerId AND OrganizationID = @organizationId")));
  const personCalls = state.calls.filter((call) => call.query.includes("DECLARE @updated TABLE(EmployeeID int)"));
  assert.ok(personCalls.every(({ query }) =>
    query.includes("Roles WHERE RoleID = @roleId AND OrganizationID = @organizationId")
    && query.includes("Employees WHERE EmployeeID = @managerId AND OrganizationID = @organizationId")
    && query.includes("WHERE EmployeeID = @id AND OrganizationID = @organizationId")));
});

test("project status reads and writes remain organization-scoped", async () => {
  state.calls = [];
  assert.equal(await projects.updateProjectStatus(404, "Active", 11), false);
  assert.equal(await projects.updateProjectStatus(404, "Active", 22), true);

  const reads = state.calls.filter((call) => call.query.includes("FROM dbo.Projects WITH(UPDLOCK,HOLDLOCK)"));
  const writes = state.calls.filter((call) => call.query.includes("UPDATE dbo.Projects SET ProjectStatus"));
  assert.equal(reads.length, 2);
  assert.equal(writes.length, 1);
  assert.ok(reads.every(({ query, inputs }) =>
    query.includes("WHERE ProjectID=@projectId AND OrganizationID=@organizationId")
    && [11, 22].includes(inputs.organizationId)));
  assert.ok(writes.every(({ query, inputs }) =>
    query.includes("WHERE ProjectID=@projectId AND OrganizationID=@organizationId")
    && inputs.organizationId === 22));
});

test("new projects and bills write explicit organization IDs and validate tenant references", async () => {
  state.calls = [];
  assert.equal(await projects.createProject("Tenant project", 11), 505);
  const billInput = {
    id: "NEWBILL", organizationId: 11, projectId: 404, billNo: "B-22",
    billDate: new Date("2040-10-01"), billDueDate: null, billPaidDate: null,
    billAmount: "100.00", companyName: null, billingAddressLine1: null,
    billingAddressLine2: null, billingAddressCity: null, billingAddressState: null, billingAddressZip: null,
  };
  await assert.rejects(() => bills.addBill(billInput), (err) => err.number === 51043);
  await bills.addBill({ ...billInput, organizationId: 22 });

  const projectInsert = state.calls.find((call) => call.query.includes("INSERT INTO dbo.Projects"));
  assert.equal(projectInsert.inputs.organizationId, 11);
  assert.match(projectInsert.query, /INSERT INTO dbo\.Projects \(ProjectName, OrganizationID\)/);
  for (const { query } of state.calls.filter((call) => call.query.includes("INSERT INTO dbo.Bills"))) {
    assert.match(query, /SELECT 1 FROM dbo\.Projects WHERE ProjectID = @projectId AND OrganizationID = @organizationId/);
    assert.match(query, /Billing Address Zip\], OrganizationID/);
  }
});
