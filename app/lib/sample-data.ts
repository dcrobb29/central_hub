import crypto from "node:crypto";
import { getPool, sql } from "@/app/lib/db";
import { getActiveOrganizationId } from "@/app/lib/auth";

export type SampleDataStatus = {
  hasSampleData: boolean;
  recordCount: number;
  sampleRecordCount: number;
  organizationId: number;
};

export type SampleDataResult = {
  success: boolean;
  hasSampleData: boolean;
  recordCount: number;
  message: string;
  details?: Record<string, number>;
};

class SampleTracker {
  private records: { tableName: string; recordKey: string }[] = [];
  organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  get totalCount(): number {
    return this.records.length;
  }

  add(tableName: string, recordKey: string | number) {
    this.records.push({ tableName, recordKey: String(recordKey) });
  }

  async persist(transaction: sql.Transaction) {
    if (this.records.length === 0) return;
    for (const record of this.records) {
      await transaction
        .request()
        .input("orgId", sql.Int, this.organizationId)
        .input("table", sql.NVarChar(80), record.tableName)
        .input("key", sql.NVarChar(100), record.recordKey)
        .query(`
          INSERT INTO dbo.SampleDataRecords (OrganizationID, TableName, RecordKey)
          VALUES (@orgId, @table, @key);
        `);
    }
  }

  getCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of this.records) {
      counts[r.tableName] = (counts[r.tableName] || 0) + 1;
    }
    return counts;
  }
}

/**
 * Check whether sample data currently exists for the specified or active organization.
 */
export async function isSampleDataIncluded(organizationId?: number): Promise<SampleDataStatus> {
  const orgId = organizationId ?? (await getActiveOrganizationId());
  const pool = await getPool();
  const result = await pool
    .request()
    .input("orgId", sql.Int, orgId)
    .query<{ total: number }>(`
      SELECT COUNT(1) AS total
      FROM dbo.SampleDataRecords
      WHERE OrganizationID = @orgId;
    `);

  const count = result.recordset[0]?.total ?? 0;
  return {
    hasSampleData: count > 0,
    recordCount: count,
    sampleRecordCount: count,
    organizationId: orgId,
  };
}

/**
 * Date helper formatting Date to YYYY-MM-DD string
 */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d.getTime());
  res.setDate(res.getDate() + days);
  return res;
}

/**
 * Creates rich sample data covering all application modules and lifecycle stages.
 */
export async function includeSampleData(organizationId?: number): Promise<SampleDataResult> {
  const orgId = organizationId ?? (await getActiveOrganizationId());
  const currentStatus = await isSampleDataIncluded(orgId);
  if (currentStatus.hasSampleData) {
    return {
      success: true,
      hasSampleData: true,
      recordCount: currentStatus.sampleRecordCount,
      message: "Sample data is already included.",
      details: { existingRecords: currentStatus.sampleRecordCount },
    };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const tracker = new SampleTracker(orgId);

  try {
    const now = new Date();
    const todayStr = toDateString(now);

    // =========================================================================
    // 1. ROLES & PERSONNEL HIERARCHY
    // =========================================================================
    let managerRoleId: number;
    let leadRoleId: number;
    let techRoleId: number;

    const existingRoles = await transaction.request().query<{ RoleID: number; RoleName: string }>(`
      SELECT RoleID, RoleName FROM dbo.Roles
    `);

    const pmRole = existingRoles.recordset.find((r) => r.RoleName.toLowerCase().includes("project manager") || r.RoleName.toLowerCase().includes("manager"));
    if (pmRole) {
      managerRoleId = pmRole.RoleID;
    } else {
      const rRes = await transaction.request()
        .input("name", sql.NVarChar(80), "Operations Manager (Sample)")
        .query<{ id: number }>("INSERT INTO dbo.Roles (RoleName) VALUES (@name); SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;");
      managerRoleId = rRes.recordset[0].id;
      tracker.add("Roles", managerRoleId);
    }

    const leadRole = existingRoles.recordset.find((r) => r.RoleName.toLowerCase().includes("lead") || r.RoleName.toLowerCase().includes("foreman"));
    if (leadRole) {
      leadRoleId = leadRole.RoleID;
    } else {
      const rRes = await transaction.request()
        .input("name", sql.NVarChar(80), "Crew Lead (Sample)")
        .query<{ id: number }>("INSERT INTO dbo.Roles (RoleName) VALUES (@name); SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;");
      leadRoleId = rRes.recordset[0].id;
      tracker.add("Roles", leadRoleId);
    }

    const techRole = existingRoles.recordset.find((r) => r.RoleName.toLowerCase().includes("technician") || r.RoleName.toLowerCase().includes("laborer"));
    if (techRole) {
      techRoleId = techRole.RoleID;
    } else {
      const rRes = await transaction.request()
        .input("name", sql.NVarChar(80), "Field Technician (Sample)")
        .query<{ id: number }>("INSERT INTO dbo.Roles (RoleName) VALUES (@name); SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;");
      techRoleId = rRes.recordset[0].id;
      tracker.add("Roles", techRoleId);
    }

    // Top Level: Operations Manager
    const mgrRes = await transaction.request()
      .input("name", sql.NVarChar(200), "Morgan Vance (Sample)")
      .input("roleId", sql.Int, managerRoleId)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
        VALUES (@name, @roleId, NULL, @orgId, 1);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const managerId = mgrRes.recordset[0].id;
    tracker.add("Employees", managerId);

    // Crew Leads reporting to Manager
    const lead1Res = await transaction.request()
      .input("name", sql.NVarChar(200), "Jordan Reed (Sample)")
      .input("roleId", sql.Int, leadRoleId)
      .input("managerId", sql.Int, managerId)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
        VALUES (@name, @roleId, @managerId, @orgId, 1);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const lead1Id = lead1Res.recordset[0].id;
    tracker.add("Employees", lead1Id);

    const lead2Res = await transaction.request()
      .input("name", sql.NVarChar(200), "Taylor Brooks (Sample)")
      .input("roleId", sql.Int, leadRoleId)
      .input("managerId", sql.Int, managerId)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
        VALUES (@name, @roleId, @managerId, @orgId, 1);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const lead2Id = lead2Res.recordset[0].id;
    tracker.add("Employees", lead2Id);

    // Technicians reporting to Crew Leads
    const tech1Res = await transaction.request()
      .input("name", sql.NVarChar(200), "Casey Miller (Sample)")
      .input("roleId", sql.Int, techRoleId)
      .input("managerId", sql.Int, lead1Id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
        VALUES (@name, @roleId, @managerId, @orgId, 1);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const tech1Id = tech1Res.recordset[0].id;
    tracker.add("Employees", tech1Id);

    const tech2Res = await transaction.request()
      .input("name", sql.NVarChar(200), "Riley Hayes (Sample)")
      .input("roleId", sql.Int, techRoleId)
      .input("managerId", sql.Int, lead1Id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
        VALUES (@name, @roleId, @managerId, @orgId, 1);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const tech2Id = tech2Res.recordset[0].id;
    tracker.add("Employees", tech2Id);

    const tech3Res = await transaction.request()
      .input("name", sql.NVarChar(200), "Alex Bennett (Sample)")
      .input("roleId", sql.Int, techRoleId)
      .input("managerId", sql.Int, lead2Id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
        VALUES (@name, @roleId, @managerId, @orgId, 1);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const tech3Id = tech3Res.recordset[0].id;
    tracker.add("Employees", tech3Id);

    // Employee History entries
    const employeesList = [
      { id: managerId, note: "Onboarded as Operations Director (Sample record)" },
      { id: lead1Id, note: "Promoted to North Route Crew Lead (Sample record)" },
      { id: lead2Id, note: "Assigned as Hardscape Specialist Lead (Sample record)" },
      { id: tech1Id, note: "Completed Equipment Safety Certification (Sample record)" },
      { id: tech2Id, note: "Completed Irrigation Systems Training (Sample record)" },
      { id: tech3Id, note: "Joined Field Operations Team (Sample record)" },
    ];
    for (const emp of employeesList) {
      const hRes = await transaction.request()
        .input("empId", sql.Int, emp.id)
        .input("eventDate", sql.Date, toDateString(addDays(now, -60)))
        .input("notes", sql.NVarChar(4000), emp.note)
        .input("orgId", sql.Int, orgId)
        .query<{ id: number }>(`
          INSERT INTO dbo.EmployeeHistory (EmployeeID, EventDate, Notes, OrganizationID)
          VALUES (@empId, @eventDate, @notes, @orgId);
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
        `);
      tracker.add("EmployeeHistory", hRes.recordset[0].id);
    }

    // Routes
    const routeRes = await transaction.request()
      .input("name", sql.NVarChar(150), "North Metro Commercial Route (Sample)")
      .input("leadId", sql.Int, lead1Id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Routes (RouteName, CrewLeadEmployeeID, OrganizationID)
        VALUES (@name, @leadId, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const routeId = routeRes.recordset[0].id;
    tracker.add("Routes", routeId);

    // =========================================================================
    // 2. CUSTOMERS
    // =========================================================================
    const cust1Res = await transaction.request()
      .input("fn", sql.NVarChar(100), "David")
      .input("ln", sql.NVarChar(100), "Highland")
      .input("co", sql.NVarChar(150), "Highland Commercial Properties (Sample)")
      .input("email", sql.NVarChar(254), "david.highland.sample@example.com")
      .input("phone", sql.NVarChar(50), "(303) 555-0128")
      .input("addr1", sql.NVarChar(200), "100 Innovation Way, Suite 400")
      .input("city", sql.NVarChar(100), "Denver")
      .input("state", sql.NVarChar(50), "CO")
      .input("zip", sql.NVarChar(20), "80202")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Customers (
          FirstName, LastName, CompanyName, Email, Phone,
          BillingAddressLine1, BillingAddressCity, BillingAddressState, BillingAddressZip,
          ShippingAddressLine1, ShippingAddressCity, ShippingAddressState, ShippingAddressZip,
          IsActive, OrganizationID
        )
        VALUES (
          @fn, @ln, @co, @email, @phone,
          @addr1, @city, @state, @zip,
          @addr1, @city, @state, @zip,
          1, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const cust1Id = cust1Res.recordset[0].id;
    tracker.add("Customers", cust1Id);

    const cust2Res = await transaction.request()
      .input("fn", sql.NVarChar(100), "Eleanor")
      .input("ln", sql.NVarChar(100), "Vance")
      .input("co", sql.NVarChar(150), "Oakwood Estates HOA (Sample)")
      .input("email", sql.NVarChar(254), "eleanor.vance.sample@example.com")
      .input("phone", sql.NVarChar(50), "(303) 555-0144")
      .input("addr1", sql.NVarChar(200), "450 Whispering Pines Dr")
      .input("city", sql.NVarChar(100), "Boulder")
      .input("state", sql.NVarChar(50), "CO")
      .input("zip", sql.NVarChar(20), "80302")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Customers (
          FirstName, LastName, CompanyName, Email, Phone,
          BillingAddressLine1, BillingAddressCity, BillingAddressState, BillingAddressZip,
          ShippingAddressLine1, ShippingAddressCity, ShippingAddressState, ShippingAddressZip,
          IsActive, OrganizationID
        )
        VALUES (
          @fn, @ln, @co, @email, @phone,
          @addr1, @city, @state, @zip,
          @addr1, @city, @state, @zip,
          1, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const cust2Id = cust2Res.recordset[0].id;
    tracker.add("Customers", cust2Id);

    const cust3Res = await transaction.request()
      .input("fn", sql.NVarChar(100), "Marcus")
      .input("ln", sql.NVarChar(100), "Sterling")
      .input("co", sql.NVarChar(150), "Marcus Sterling (Sample)")
      .input("email", sql.NVarChar(254), "marcus.sterling.sample@example.com")
      .input("phone", sql.NVarChar(50), "(970) 555-0199")
      .input("addr1", sql.NVarChar(200), "820 Red Mountain Rd")
      .input("city", sql.NVarChar(100), "Aspen")
      .input("state", sql.NVarChar(50), "CO")
      .input("zip", sql.NVarChar(20), "81611")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Customers (
          FirstName, LastName, CompanyName, Email, Phone,
          BillingAddressLine1, BillingAddressCity, BillingAddressState, BillingAddressZip,
          ShippingAddressLine1, ShippingAddressCity, ShippingAddressState, ShippingAddressZip,
          IsActive, OrganizationID
        )
        VALUES (
          @fn, @ln, @co, @email, @phone,
          @addr1, @city, @state, @zip,
          @addr1, @city, @state, @zip,
          1, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const cust3Id = cust3Res.recordset[0].id;
    tracker.add("Customers", cust3Id);

    // =========================================================================
    // 3. MATERIALS CATALOG (SAMPLE ITEMS)
    // =========================================================================
    const sampleMaterials = [
      { name: "Premium Hardwood Mulch (Sample)", unit: "CY", cost: 38.5 },
      { name: "Colorado Buff Flagstone (Sample)", unit: "TN", cost: 285.0 },
      { name: "Commercial Drip Line 100ft (Sample)", unit: "EA", cost: 45.0 },
    ];
    const createdMaterialIds: number[] = [];
    for (const mat of sampleMaterials) {
      const mRes = await transaction.request()
        .input("name", sql.NVarChar(100), mat.name)
        .input("unit", sql.NVarChar(20), mat.unit)
        .input("orgId", sql.Int, orgId)
        .query<{ id: number }>(`
          INSERT INTO dbo.Materials (MaterialName, UnitName, IsActive, OrganizationID)
          VALUES (@name, @unit, 1, @orgId);
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
        `);
      const matId = mRes.recordset[0].id;
      createdMaterialIds.push(matId);
      tracker.add("Materials", matId);

      const pRes = await transaction.request()
        .input("matId", sql.Int, matId)
        .input("cost", sql.Decimal(18, 4), mat.cost)
        .input("vendor", sql.NVarChar(100), "Apex Landscape Supply (Sample)")
        .input("orgId", sql.Int, orgId)
        .query<{ id: number }>(`
          INSERT INTO dbo.MaterialPrices (MaterialID, UnitCost, QuotedDate, VendorName, OrganizationID)
          VALUES (@matId, @cost, GETUTCDATE(), @vendor, @orgId);
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
        `);
      tracker.add("MaterialPrices", pRes.recordset[0].id);
    }

    // =========================================================================
    // 4. ESTIMATES ACROSS LIFECYCLE
    // =========================================================================

    // --- ESTIMATE 1: New / Draft (Pending Review) ---
    const est1Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Highland Office Park - Landscape Revamp (Sample)")
      .input("cust", sql.NVarChar(150), "Highland Commercial Properties (Sample)")
      .input("status", sql.VarChar(16), "Draft")
      .input("eng", sql.VarChar(16), "Project")
      .input("start", sql.Date, toDateString(addDays(now, 14)))
      .input("end", sql.Date, toDateString(addDays(now, 35)))
      .input("intNotes", sql.NVarChar(4000), "Draft estimate pending review by client facilities board.")
      .input("custNotes", sql.NVarChar(4000), "Proposal includes modern low-water landscaping and irrigation refresh.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Estimates (
          EstimateName, CustomerName, EstimateStatus, EngagementType, RecurrenceFrequency,
          ExpectedStartDate, ExpectedEndDate, ShowQuantities, ShowLineTotals, ShowSummaryTotal, ShowScopesOfWork,
          InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @name, @cust, @status, @eng, NULL,
          @start, @end, 1, 1, 1, 1,
          @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const est1Id = est1Res.recordset[0].id;
    tracker.add("Estimates", est1Id);

    const rev1Res = await transaction.request()
      .input("estId", sql.Int, est1Id)
      .input("total", sql.Decimal(19, 2), 4850.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, EstimateMarkupPercent, QuotedTotal, TaxPercent, GroupingMode, OrganizationID)
        VALUES (@estId, 1, 'estimate', 15.0, @total, 0.0, 'Scope', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const rev1Id = rev1Res.recordset[0].id;
    tracker.add("EstimateRevisions", rev1Id);

    const scope1a = await transaction.request()
      .input("revId", sql.Int, rev1Id)
      .input("name", sql.NVarChar(150), "Demolition & Ground Prep")
      .input("sort", sql.Int, 0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope1a.recordset[0].id);

    const line1a = await transaction.request()
      .input("revId", sql.Int, rev1Id)
      .input("lineNum", sql.Int, 1)
      .input("desc", sql.NVarChar(255), "Site clearing and sod stripping")
      .input("qty", sql.Decimal(18, 4), 12.0)
      .input("unit", sql.NVarChar(20), "HR")
      .input("cost", sql.Decimal(18, 4), 65.0)
      .input("type", sql.VarChar(16), "Labor")
      .input("scopeId", sql.Int, scope1a.recordset[0].id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateLineItems (EstimateRevisionID, LineNumber, Description, Quantity, UnitName, UnitCost, LineMarkupPercent, LineType, EstimateScopeOfWorkID, OrganizationID)
        VALUES (@revId, @lineNum, @desc, @qty, @unit, @cost, 15.0, @type, @scopeId, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateLineItems", line1a.recordset[0].id);

    // --- ESTIMATE 2: Won / Converted to In Progress One-Time Project ---
    const est2Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Oakwood Community Park - Hardscape & Patio (Sample)")
      .input("cust", sql.NVarChar(150), "Oakwood Estates HOA (Sample)")
      .input("status", sql.VarChar(16), "Won")
      .input("eng", sql.VarChar(16), "Project")
      .input("start", sql.Date, toDateString(addDays(now, -14)))
      .input("end", sql.Date, toDateString(addDays(now, 28)))
      .input("intNotes", sql.NVarChar(4000), "Deposit invoice issued. Scopes underway.")
      .input("custNotes", sql.NVarChar(4000), "Construction of outdoor community patio and seating wall.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Estimates (
          EstimateName, CustomerName, EstimateStatus, EngagementType, RecurrenceFrequency,
          ExpectedStartDate, ExpectedEndDate, ShowQuantities, ShowLineTotals, ShowSummaryTotal, ShowScopesOfWork,
          InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @name, @cust, @status, @eng, NULL,
          @start, @end, 1, 1, 1, 1,
          @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const est2Id = est2Res.recordset[0].id;
    tracker.add("Estimates", est2Id);

    const rev2Res = await transaction.request()
      .input("estId", sql.Int, est2Id)
      .input("total", sql.Decimal(19, 2), 7600.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, EstimateMarkupPercent, QuotedTotal, TaxPercent, GroupingMode, OrganizationID)
        VALUES (@estId, 1, 'estimate', 15.0, @total, 0.0, 'Scope', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const rev2Id = rev2Res.recordset[0].id;
    tracker.add("EstimateRevisions", rev2Id);

    const scope2a = await transaction.request()
      .input("revId", sql.Int, rev2Id)
      .input("name", sql.NVarChar(150), "Excavation & Base Prep")
      .input("sort", sql.Int, 0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope2a.recordset[0].id);

    const scope2b = await transaction.request()
      .input("revId", sql.Int, rev2Id)
      .input("name", sql.NVarChar(150), "Paver Installation & Edging")
      .input("sort", sql.Int, 1)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope2b.recordset[0].id);

    const scope2c = await transaction.request()
      .input("revId", sql.Int, rev2Id)
      .input("name", sql.NVarChar(150), "Perimeter Sealing & Clean-up")
      .input("sort", sql.Int, 2)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope2c.recordset[0].id);

    const line2a = await transaction.request()
      .input("revId", sql.Int, rev2Id)
      .input("lineNum", sql.Int, 1)
      .input("desc", sql.NVarChar(255), "Excavator grading and sub-base compaction")
      .input("qty", sql.Decimal(18, 4), 3200.0)
      .input("unit", sql.NVarChar(20), "LS")
      .input("cost", sql.Decimal(18, 4), 1.0)
      .input("type", sql.VarChar(16), "Labor")
      .input("scopeId", sql.Int, scope2a.recordset[0].id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateLineItems (EstimateRevisionID, LineNumber, Description, Quantity, UnitName, UnitCost, LineMarkupPercent, LineType, EstimateScopeOfWorkID, OrganizationID)
        VALUES (@revId, @lineNum, @desc, @qty, @unit, @cost, 0.0, @type, @scopeId, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateLineItems", line2a.recordset[0].id);

    // --- ESTIMATE 3: Won / Converted to Active Recurring Agreement ---
    const est3Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Highland Commercial - Biweekly Grounds Care (Sample)")
      .input("cust", sql.NVarChar(150), "Highland Commercial Properties (Sample)")
      .input("status", sql.VarChar(16), "Won")
      .input("eng", sql.VarChar(16), "Service")
      .input("freq", sql.VarChar(16), "Biweekly")
      .input("start", sql.Date, toDateString(addDays(now, -35)))
      .input("end", sql.Date, toDateString(addDays(now, 105)))
      .input("intNotes", sql.NVarChar(4000), "Regular biweekly maintenance schedule.")
      .input("custNotes", sql.NVarChar(4000), "Full grounds management: turf mowing, bed care, and hardscape clearing.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Estimates (
          EstimateName, CustomerName, EstimateStatus, EngagementType, RecurrenceFrequency,
          ExpectedStartDate, ExpectedEndDate, ShowQuantities, ShowLineTotals, ShowSummaryTotal, ShowScopesOfWork,
          InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @name, @cust, @status, @eng, @freq,
          @start, @end, 1, 1, 1, 1,
          @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const est3Id = est3Res.recordset[0].id;
    tracker.add("Estimates", est3Id);

    const rev3Res = await transaction.request()
      .input("estId", sql.Int, est3Id)
      .input("total", sql.Decimal(19, 2), 580.0) // Quoted total PER OCCURRENCE
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, EstimateMarkupPercent, QuotedTotal, TaxPercent, GroupingMode, OrganizationID)
        VALUES (@estId, 1, 'estimate', 10.0, @total, 0.0, 'Scope', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const rev3Id = rev3Res.recordset[0].id;
    tracker.add("EstimateRevisions", rev3Id);

    const scope3a = await transaction.request()
      .input("revId", sql.Int, rev3Id)
      .input("name", sql.NVarChar(150), "Turf Mowing & Line Trimming")
      .input("sort", sql.Int, 0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope3a.recordset[0].id);

    const scope3b = await transaction.request()
      .input("revId", sql.Int, rev3Id)
      .input("name", sql.NVarChar(150), "Shrub Pruning & Bed Weeding")
      .input("sort", sql.Int, 1)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope3b.recordset[0].id);

    // --- ESTIMATE 4: Won / Converted to Completed One-Time Project ---
    const est4Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Sterling Residence - Flagstone Walkway & Lighting (Sample)")
      .input("cust", sql.NVarChar(150), "Marcus Sterling (Sample)")
      .input("status", sql.VarChar(16), "Won")
      .input("eng", sql.VarChar(16), "Project")
      .input("start", sql.Date, toDateString(addDays(now, -60)))
      .input("end", sql.Date, toDateString(addDays(now, -20)))
      .input("intNotes", sql.NVarChar(4000), "Project 100% complete. Final invoice fully paid.")
      .input("custNotes", sql.NVarChar(4000), "Installation of natural flagstone path with warm LED landscape path lights.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Estimates (
          EstimateName, CustomerName, EstimateStatus, EngagementType, RecurrenceFrequency,
          ExpectedStartDate, ExpectedEndDate, ShowQuantities, ShowLineTotals, ShowSummaryTotal, ShowScopesOfWork,
          InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @name, @cust, @status, @eng, NULL,
          @start, @end, 1, 1, 1, 1,
          @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const est4Id = est4Res.recordset[0].id;
    tracker.add("Estimates", est4Id);

    const rev4Res = await transaction.request()
      .input("estId", sql.Int, est4Id)
      .input("total", sql.Decimal(19, 2), 6500.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, EstimateMarkupPercent, QuotedTotal, TaxPercent, GroupingMode, OrganizationID)
        VALUES (@estId, 1, 'estimate', 15.0, @total, 0.0, 'Scope', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const rev4Id = rev4Res.recordset[0].id;
    tracker.add("EstimateRevisions", rev4Id);

    const scope4a = await transaction.request()
      .input("revId", sql.Int, rev4Id)
      .input("name", sql.NVarChar(150), "Excavation & Electrical Conduit")
      .input("sort", sql.Int, 0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope4a.recordset[0].id);

    const scope4b = await transaction.request()
      .input("revId", sql.Int, rev4Id)
      .input("name", sql.NVarChar(150), "Natural Flagstone Masonry")
      .input("sort", sql.Int, 1)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder, OrganizationID)
        VALUES (@revId, @name, @sort, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("EstimateScopesOfWork", scope4b.recordset[0].id);

    // =========================================================================
    // 5. PROJECTS ACROSS LIFECYCLE
    // =========================================================================

    // --- PROJECT 1: In Progress One-Time Project ---
    const proj1Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Oakwood Community Park - Hardscape & Patio (Sample)")
      .input("status", sql.VarChar(24), "Active")
      .input("intNotes", sql.NVarChar(4000), "Scope 1 complete and billed. Scope 2 underway.")
      .input("custNotes", sql.NVarChar(4000), "Patio construction in progress.")
      .input("revId", sql.Int, rev2Id)
      .input("start", sql.Date, toDateString(addDays(now, -14)))
      .input("end", sql.Date, toDateString(addDays(now, 28)))
      .input("pmId", sql.Int, managerId)
      .input("custId", sql.Int, cust2Id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Projects (
          ProjectName, ProjectStatus, InternalNotes, CustomerNotes, AcceptedEstimateRevisionID,
          EngagementType, RecurrenceFrequency, ExpectedStartDate, ExpectedEndDate,
          ProjectManagerID, CustomerID, OrganizationID
        )
        VALUES (
          @name, @status, @intNotes, @custNotes, @revId,
          'Project', NULL, @start, @end,
          @pmId, @custId, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const proj1Id = proj1Res.recordset[0].id;
    tracker.add("Projects", proj1Id);

    // Project 1 Billing Unit & Scopes
    const bUnit1Res = await transaction.request()
      .input("projId", sql.Int, proj1Id)
      .input("revId", sql.Int, rev2Id)
      .input("val", sql.Decimal(19, 2), 7600.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingUnits (ProjectID, ServiceVisitID, SourceRevisionID, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@projId, NULL, @revId, @val, 'In Progress', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bUnit1Id = bUnit1Res.recordset[0].id;
    tracker.add("ProjectBillingUnits", bUnit1Id);

    const bScope1a = await transaction.request()
      .input("unitId", sql.Int, bUnit1Id)
      .input("srcId", sql.Int, scope2a.recordset[0].id)
      .input("name", sql.NVarChar(150), "Excavation & Base Prep")
      .input("sort", sql.Int, 0)
      .input("val", sql.Decimal(19, 2), 3200.0)
      .input("status", sql.VarChar(16), "Complete")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, @status, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bScope1aId = bScope1a.recordset[0].id;
    tracker.add("ProjectBillingScopes", bScope1aId);

    const bScope1b = await transaction.request()
      .input("unitId", sql.Int, bUnit1Id)
      .input("srcId", sql.Int, scope2b.recordset[0].id)
      .input("name", sql.NVarChar(150), "Paver Installation & Edging")
      .input("sort", sql.Int, 1)
      .input("val", sql.Decimal(19, 2), 3400.0)
      .input("status", sql.VarChar(16), "In Progress")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, @status, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillingScopes", bScope1b.recordset[0].id);

    const bScope1c = await transaction.request()
      .input("unitId", sql.Int, bUnit1Id)
      .input("srcId", sql.Int, scope2c.recordset[0].id)
      .input("name", sql.NVarChar(150), "Perimeter Sealing & Clean-up")
      .input("sort", sql.Int, 2)
      .input("val", sql.Decimal(19, 2), 1000.0)
      .input("status", sql.VarChar(16), "Upcoming")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, @status, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillingScopes", bScope1c.recordset[0].id);

    // Project 1 Billing Settings (locked to Scopes)
    await transaction.request()
      .input("projId", sql.Int, proj1Id)
      .input("method", sql.VarChar(20), "Scopes")
      .input("orgId", sql.Int, orgId)
      .query(`
        INSERT INTO dbo.ProjectBillingSettings (ProjectID, BillingMethod, OrganizationID)
        VALUES (@projId, @method, @orgId);
      `);
    tracker.add("ProjectBillingSettings", proj1Id);

    // --- PROJECT 2: Complete One-Time Project ---
    const proj2Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Sterling Residence - Flagstone Walkway & Lighting (Sample)")
      .input("status", sql.VarChar(24), "Active")
      .input("intNotes", sql.NVarChar(4000), "Project successfully completed and closed out. Customer satisfied.")
      .input("custNotes", sql.NVarChar(4000), "Final walkway and lighting fully installed.")
      .input("revId", sql.Int, rev4Id)
      .input("start", sql.Date, toDateString(addDays(now, -60)))
      .input("end", sql.Date, toDateString(addDays(now, -20)))
      .input("pmId", sql.Int, managerId)
      .input("custId", sql.Int, cust3Id)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Projects (
          ProjectName, ProjectStatus, InternalNotes, CustomerNotes, AcceptedEstimateRevisionID,
          EngagementType, RecurrenceFrequency, ExpectedStartDate, ExpectedEndDate,
          ProjectManagerID, CustomerID, OrganizationID
        )
        VALUES (
          @name, @status, @intNotes, @custNotes, @revId,
          'Project', NULL, @start, @end,
          @pmId, @custId, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const proj2Id = proj2Res.recordset[0].id;
    tracker.add("Projects", proj2Id);

    // Project 2 Billing Unit & Scopes (all Complete)
    const bUnit2Res = await transaction.request()
      .input("projId", sql.Int, proj2Id)
      .input("revId", sql.Int, rev4Id)
      .input("val", sql.Decimal(19, 2), 6500.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingUnits (ProjectID, ServiceVisitID, SourceRevisionID, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@projId, NULL, @revId, @val, 'Complete', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bUnit2Id = bUnit2Res.recordset[0].id;
    tracker.add("ProjectBillingUnits", bUnit2Id);

    const bScope2a = await transaction.request()
      .input("unitId", sql.Int, bUnit2Id)
      .input("srcId", sql.Int, scope4a.recordset[0].id)
      .input("name", sql.NVarChar(150), "Excavation & Electrical Conduit")
      .input("sort", sql.Int, 0)
      .input("val", sql.Decimal(19, 2), 2500.0)
      .input("status", sql.VarChar(16), "Complete")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, @status, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bScope2aId = bScope2a.recordset[0].id;
    tracker.add("ProjectBillingScopes", bScope2aId);

    const bScope2b = await transaction.request()
      .input("unitId", sql.Int, bUnit2Id)
      .input("srcId", sql.Int, scope4b.recordset[0].id)
      .input("name", sql.NVarChar(150), "Natural Flagstone Masonry")
      .input("sort", sql.Int, 1)
      .input("val", sql.Decimal(19, 2), 4000.0)
      .input("status", sql.VarChar(16), "Complete")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, @status, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bScope2bId = bScope2b.recordset[0].id;
    tracker.add("ProjectBillingScopes", bScope2bId);

    await transaction.request()
      .input("projId", sql.Int, proj2Id)
      .input("method", sql.VarChar(20), "Scopes")
      .input("orgId", sql.Int, orgId)
      .query(`
        INSERT INTO dbo.ProjectBillingSettings (ProjectID, BillingMethod, OrganizationID)
        VALUES (@projId, @method, @orgId);
      `);
    tracker.add("ProjectBillingSettings", proj2Id);

    // --- PROJECT 3: Active Recurring Agreement ---
    const proj3Res = await transaction.request()
      .input("name", sql.NVarChar(150), "Highland Commercial - Biweekly Grounds Care (Sample)")
      .input("status", sql.VarChar(24), "Active")
      .input("intNotes", sql.NVarChar(4000), "Assigned to North Metro Commercial Route.")
      .input("custNotes", sql.NVarChar(4000), "Biweekly grounds maintenance agreement.")
      .input("revId", sql.Int, rev3Id)
      .input("freq", sql.VarChar(16), "Biweekly")
      .input("start", sql.Date, toDateString(addDays(now, -35)))
      .input("end", sql.Date, toDateString(addDays(now, 105)))
      .input("pmId", sql.Int, managerId)
      .input("custId", sql.Int, cust1Id)
      .input("routeId", sql.Int, routeId)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Projects (
          ProjectName, ProjectStatus, InternalNotes, CustomerNotes, AcceptedEstimateRevisionID,
          EngagementType, RecurrenceFrequency, ExpectedStartDate, ExpectedEndDate,
          ProjectManagerID, CustomerID, RouteID, OrganizationID
        )
        VALUES (
          @name, @status, @intNotes, @custNotes, @revId,
          'Service', @freq, @start, @end,
          @pmId, @custId, @routeId, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const proj3Id = proj3Res.recordset[0].id;
    tracker.add("Projects", proj3Id);

    // Recurring Template Billing Unit (ServiceVisitID is NULL)
    const bUnit3Template = await transaction.request()
      .input("projId", sql.Int, proj3Id)
      .input("revId", sql.Int, rev3Id)
      .input("val", sql.Decimal(19, 2), 580.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingUnits (ProjectID, ServiceVisitID, SourceRevisionID, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@projId, NULL, @revId, @val, 'Upcoming', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillingUnits", bUnit3Template.recordset[0].id);

    const bScope3TemplateA = await transaction.request()
      .input("unitId", sql.Int, bUnit3Template.recordset[0].id)
      .input("srcId", sql.Int, scope3a.recordset[0].id)
      .input("name", sql.NVarChar(150), "Turf Mowing & Line Trimming")
      .input("sort", sql.Int, 0)
      .input("val", sql.Decimal(19, 2), 380.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, 'Upcoming', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillingScopes", bScope3TemplateA.recordset[0].id);

    const bScope3TemplateB = await transaction.request()
      .input("unitId", sql.Int, bUnit3Template.recordset[0].id)
      .input("srcId", sql.Int, scope3b.recordset[0].id)
      .input("name", sql.NVarChar(150), "Shrub Pruning & Bed Weeding")
      .input("sort", sql.Int, 1)
      .input("val", sql.Decimal(19, 2), 200.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, 'Upcoming', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillingScopes", bScope3TemplateB.recordset[0].id);

    // Recurring Visits:
    // 1 Past Completed Visit (-14 days)
    const visitPast = await transaction.request()
      .input("projId", sql.Int, proj3Id)
      .input("vDate", sql.Date, toDateString(addDays(now, -14)))
      .input("rDate", sql.Date, toDateString(addDays(now, -14)))
      .input("status", sql.VarChar(24), "Completed")
      .input("notes", sql.NVarChar(4000), "Biweekly grounds maintenance performed. Site cleared.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate, RecurrenceDate, Status, Notes, OrganizationID)
        VALUES (@projId, @vDate, @rDate, @status, @notes, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const visitPastId = visitPast.recordset[0].id;
    tracker.add("ServiceVisits", visitPastId);

    // Unit & Scopes for past visit
    const bUnitPast = await transaction.request()
      .input("projId", sql.Int, proj3Id)
      .input("visitId", sql.Int, visitPastId)
      .input("revId", sql.Int, rev3Id)
      .input("val", sql.Decimal(19, 2), 580.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingUnits (ProjectID, ServiceVisitID, SourceRevisionID, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@projId, @visitId, @revId, @val, 'Complete', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bUnitPastId = bUnitPast.recordset[0].id;
    tracker.add("ProjectBillingUnits", bUnitPastId);

    const bScopePastA = await transaction.request()
      .input("unitId", sql.Int, bUnitPastId)
      .input("srcId", sql.Int, scope3a.recordset[0].id)
      .input("name", sql.NVarChar(150), "Turf Mowing & Line Trimming")
      .input("sort", sql.Int, 0)
      .input("val", sql.Decimal(19, 2), 380.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, 'Complete', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bScopePastAId = bScopePastA.recordset[0].id;
    tracker.add("ProjectBillingScopes", bScopePastAId);

    const bScopePastB = await transaction.request()
      .input("unitId", sql.Int, bUnitPastId)
      .input("srcId", sql.Int, scope3b.recordset[0].id)
      .input("name", sql.NVarChar(150), "Shrub Pruning & Bed Weeding")
      .input("sort", sql.Int, 1)
      .input("val", sql.Decimal(19, 2), 200.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillingScopes (BillingUnitID, SourceScopeID, ScopeName, SortOrder, ContractValue, CompletionStatus, OrganizationID)
        VALUES (@unitId, @srcId, @name, @sort, @val, 'Complete', @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const bScopePastBId = bScopePastB.recordset[0].id;
    tracker.add("ProjectBillingScopes", bScopePastBId);

    // 1 Current Scheduled Visit (today/current week)
    const visitCurrent = await transaction.request()
      .input("projId", sql.Int, proj3Id)
      .input("vDate", sql.Date, todayStr)
      .input("rDate", sql.Date, todayStr)
      .input("status", sql.VarChar(24), "Scheduled")
      .input("notes", sql.NVarChar(4000), "Scheduled biweekly service visit.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate, RecurrenceDate, Status, Notes, OrganizationID)
        VALUES (@projId, @vDate, @rDate, @status, @notes, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const visitCurrentId = visitCurrent.recordset[0].id;
    tracker.add("ServiceVisits", visitCurrentId);

    // 2 Future Scheduled Visits (+14, +28 days)
    for (const daysAhead of [14, 28]) {
      const vDateStr = toDateString(addDays(now, daysAhead));
      const vRes = await transaction.request()
        .input("projId", sql.Int, proj3Id)
        .input("vDate", sql.Date, vDateStr)
        .input("rDate", sql.Date, vDateStr)
        .input("status", sql.VarChar(24), "Scheduled")
        .input("orgId", sql.Int, orgId)
        .query<{ id: number }>(`
          INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate, RecurrenceDate, Status, OrganizationID)
          VALUES (@projId, @vDate, @rDate, @status, @orgId);
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
        `);
      tracker.add("ServiceVisits", vRes.recordset[0].id);
    }

    // =========================================================================
    // 6. FIELD OPERATIONS (TASKS & ASSIGNMENTS)
    // =========================================================================
    // Task 1 on current visit (Mowing)
    const task1 = await transaction.request()
      .input("visitId", sql.Int, visitCurrentId)
      .input("name", sql.NVarChar(150), "Turf Mowing & Line Trimming (Sample)")
      .input("hours", sql.Decimal(6, 2), 3.0)
      .input("sort", sql.Int, 0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours, SortOrder, IsActive, OrganizationID)
        VALUES (@visitId, @name, @hours, @sort, 1, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const task1Id = task1.recordset[0].id;
    tracker.add("FieldOperationsTasks", task1Id);

    // Assign Crew Lead (Jordan Reed) & Technician (Casey Miller) to Task 1
    const assign1a = await transaction.request()
      .input("taskId", sql.Int, task1Id)
      .input("empId", sql.Int, lead1Id)
      .input("mode", sql.VarChar(12), "custom")
      .input("hours", sql.Decimal(6, 2), 1.5)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.FieldOperationsTaskAssignments (FieldOperationsTaskID, EmployeeID, HoursMode, CustomHours, IsActive, OrganizationID)
        VALUES (@taskId, @empId, @mode, @hours, 1, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("FieldOperationsTaskAssignments", assign1a.recordset[0].id);

    const assign1b = await transaction.request()
      .input("taskId", sql.Int, task1Id)
      .input("empId", sql.Int, tech1Id)
      .input("mode", sql.VarChar(12), "custom")
      .input("hours", sql.Decimal(6, 2), 1.5)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.FieldOperationsTaskAssignments (FieldOperationsTaskID, EmployeeID, HoursMode, CustomHours, IsActive, OrganizationID)
        VALUES (@taskId, @empId, @mode, @hours, 1, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("FieldOperationsTaskAssignments", assign1b.recordset[0].id);

    // Task 2 on current visit (Pruning)
    const task2 = await transaction.request()
      .input("visitId", sql.Int, visitCurrentId)
      .input("name", sql.NVarChar(150), "Shrub Pruning & Bed Weeding (Sample)")
      .input("hours", sql.Decimal(6, 2), 2.0)
      .input("sort", sql.Int, 1)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours, SortOrder, IsActive, OrganizationID)
        VALUES (@visitId, @name, @hours, @sort, 1, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const task2Id = task2.recordset[0].id;
    tracker.add("FieldOperationsTasks", task2Id);

    // Assign Technician (Riley Hayes) to Task 2
    const assign2 = await transaction.request()
      .input("taskId", sql.Int, task2Id)
      .input("empId", sql.Int, tech2Id)
      .input("mode", sql.VarChar(12), "custom")
      .input("hours", sql.Decimal(6, 2), 2.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.FieldOperationsTaskAssignments (FieldOperationsTaskID, EmployeeID, HoursMode, CustomHours, IsActive, OrganizationID)
        VALUES (@taskId, @empId, @mode, @hours, 1, @orgId);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("FieldOperationsTaskAssignments", assign2.recordset[0].id);

    // =========================================================================
    // 7. INVOICES & BILLS (WITH PAID STATUS FOR FINISHED JOBS)
    // =========================================================================

    // --- FINISHED JOB: Project 2 (Sterling Residence) ---
    // Paid Invoice for Project 2
    const invFinished = await transaction.request()
      .input("invNo", sql.NChar(10), "900001")
      .input("invDate", sql.Date, toDateString(addDays(now, -35)))
      .input("dueDate", sql.Date, toDateString(addDays(now, -15)))
      .input("paidDate", sql.Date, toDateString(addDays(now, -10))) // PAID!
      .input("amt", sql.NVarChar(32), "6500.00")
      .input("projId", sql.Int, proj2Id)
      .input("custId", sql.Int, cust3Id)
      .input("fn", sql.NVarChar(100), "Marcus")
      .input("ln", sql.NVarChar(100), "Sterling")
      .input("co", sql.NVarChar(150), "Marcus Sterling (Sample)")
      .input("addr1", sql.NVarChar(200), "820 Red Mountain Rd")
      .input("city", sql.NVarChar(100), "Aspen")
      .input("state", sql.NVarChar(50), "CO")
      .input("zip", sql.NVarChar(20), "81611")
      .input("intNotes", sql.NVarChar(4000), "Final invoice paid in full by client check.")
      .input("custNotes", sql.NVarChar(4000), "Thank you for your business! All warranty terms active.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Invoices (
          [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Paid Date], [Invoice Amount],
          ProjectID, CustomerID, [First Name], [Last Name], [Company Name],
          [Billing Address Line 1], [Billing Address City], [Billing Address State], [Billing Address Zip],
          IsProjectBilling, InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @invNo, @invDate, @dueDate, @paidDate, @amt,
          @projId, @custId, @fn, @ln, @co,
          @addr1, @city, @state, @zip,
          0, @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const invFinishedId = invFinished.recordset[0].id;
    tracker.add("Invoices", invFinishedId);

    // Paid Bill for Project 2
    const billFinishedId = "SMP-B01";
    await transaction.request()
      .input("id", sql.NChar(10), billFinishedId)
      .input("billNo", sql.NChar(10), "SB-001")
      .input("bDate", sql.Date, toDateString(addDays(now, -45)))
      .input("dueDate", sql.Date, toDateString(addDays(now, -25)))
      .input("paidDate", sql.Date, toDateString(addDays(now, -20))) // PAID!
      .input("amt", sql.NVarChar(32), "2450.00")
      .input("co", sql.NChar(10), "RockSupply")
      .input("projId", sql.Int, proj2Id)
      .input("orgId", sql.Int, orgId)
      .query(`
        INSERT INTO dbo.Bills (
          [id], [Bill No], [Bill Date], [Bill Due Date], [Bill Paid Date], [Bill Amount],
          [Company Name], ProjectID, IsSplit, OrganizationID
        )
        VALUES (
          @id, @billNo, @bDate, @dueDate, @paidDate, @amt,
          @co, @projId, 0, @orgId
        );
      `);
    tracker.add("Bills", billFinishedId);

    // Bill cost allocation to Project 2
    const bCostFinished = await transaction.request()
      .input("projId", sql.Int, proj2Id)
      .input("billId", sql.NChar(10), billFinishedId)
      .input("desc", sql.NVarChar(255), "Colorado Buff Flagstone pallets (Sample)")
      .input("cDate", sql.Date, toDateString(addDays(now, -45)))
      .input("qty", sql.Decimal(10, 2), 5.0)
      .input("unit", sql.NVarChar(50), "Pallet")
      .input("unitCost", sql.Decimal(19, 2), 490.0)
      .input("amt", sql.Decimal(19, 2), 2450.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillCosts (
          ProjectID, BillID, Description, CostDate,
          Quantity, UnitName, UnitCost, FreightAmount, TaxAmount, Amount,
          IsActive, OrganizationID
        )
        VALUES (
          @projId, @billId, @desc, @cDate,
          @qty, @unit, @unitCost, 0.0, 0.0, @amt,
          1, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillCosts", bCostFinished.recordset[0].id);

    // Now that Project 2 has its scopes, paid invoice, and paid bill attached, mark it Complete
    await transaction.request()
      .input("projId", sql.Int, proj2Id)
      .query(`
        UPDATE dbo.Projects SET ProjectStatus = 'Complete' WHERE ProjectID = @projId;
      `);

    // --- ACTIVE JOB: Project 1 (Oakwood Community Park) ---
    // Active (Unpaid / Outstanding) Invoice for Scope 1
    const invActive = await transaction.request()
      .input("invNo", sql.NChar(10), "900002")
      .input("invDate", sql.Date, toDateString(addDays(now, -5)))
      .input("dueDate", sql.Date, toDateString(addDays(now, 25)))
      .input("amt", sql.NVarChar(32), "3200.00")
      .input("projId", sql.Int, proj1Id)
      .input("custId", sql.Int, cust2Id)
      .input("fn", sql.NVarChar(100), "Eleanor")
      .input("ln", sql.NVarChar(100), "Vance")
      .input("co", sql.NVarChar(150), "Oakwood Estates HOA (Sample)")
      .input("addr1", sql.NVarChar(200), "450 Whispering Pines Dr")
      .input("city", sql.NVarChar(100), "Boulder")
      .input("state", sql.NVarChar(50), "CO")
      .input("zip", sql.NVarChar(20), "80302")
      .input("intNotes", sql.NVarChar(4000), "Phase 1 Excavation milestone invoice.")
      .input("custNotes", sql.NVarChar(4000), "Scope 1 Excavation and ground prep complete.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Invoices (
          [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Paid Date], [Invoice Amount],
          ProjectID, CustomerID, [First Name], [Last Name], [Company Name],
          [Billing Address Line 1], [Billing Address City], [Billing Address State], [Billing Address Zip],
          IsProjectBilling, InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @invNo, @invDate, @dueDate, NULL, @amt,
          @projId, @custId, @fn, @ln, @co,
          @addr1, @city, @state, @zip,
          0, @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const invActiveId = invActive.recordset[0].id;
    tracker.add("Invoices", invActiveId);

    // Active (Unpaid / Pending) Bill for Project 1
    const billActiveId = "SMP-B02";
    await transaction.request()
      .input("id", sql.NChar(10), billActiveId)
      .input("billNo", sql.NChar(10), "SB-002")
      .input("bDate", sql.Date, toDateString(addDays(now, -7)))
      .input("dueDate", sql.Date, toDateString(addDays(now, 23)))
      .input("amt", sql.NVarChar(32), "1120.00")
      .input("co", sql.NChar(10), "FrontRange")
      .input("projId", sql.Int, proj1Id)
      .input("orgId", sql.Int, orgId)
      .query(`
        INSERT INTO dbo.Bills (
          [id], [Bill No], [Bill Date], [Bill Due Date], [Bill Paid Date], [Bill Amount],
          [Company Name], ProjectID, IsSplit, OrganizationID
        )
        VALUES (
          @id, @billNo, @bDate, @dueDate, NULL, @amt,
          @co, @projId, 0, @orgId
        );
      `);
    tracker.add("Bills", billActiveId);

    const bCostActive = await transaction.request()
      .input("projId", sql.Int, proj1Id)
      .input("billId", sql.NChar(10), billActiveId)
      .input("desc", sql.NVarChar(255), "Crushed aggregate base rock (Sample)")
      .input("cDate", sql.Date, toDateString(addDays(now, -7)))
      .input("qty", sql.Decimal(10, 2), 16.0)
      .input("unit", sql.NVarChar(50), "Ton")
      .input("unitCost", sql.Decimal(19, 2), 70.0)
      .input("amt", sql.Decimal(19, 2), 1120.0)
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.ProjectBillCosts (
          ProjectID, BillID, Description, CostDate,
          Quantity, UnitName, UnitCost, FreightAmount, TaxAmount, Amount,
          IsActive, OrganizationID
        )
        VALUES (
          @projId, @billId, @desc, @cDate,
          @qty, @unit, @unitCost, 0.0, 0.0, @amt,
          1, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    tracker.add("ProjectBillCosts", bCostActive.recordset[0].id);

    // --- RECURRING OCCURRENCE: Paid Invoice for Visit 1 ---
    const invRecurring = await transaction.request()
      .input("invNo", sql.NChar(10), "900003")
      .input("invDate", sql.Date, toDateString(addDays(now, -12)))
      .input("dueDate", sql.Date, toDateString(addDays(now, 18)))
      .input("paidDate", sql.Date, toDateString(addDays(now, -2))) // PAID occurrence invoice!
      .input("amt", sql.NVarChar(32), "580.00")
      .input("projId", sql.Int, proj3Id)
      .input("custId", sql.Int, cust1Id)
      .input("fn", sql.NVarChar(100), "David")
      .input("ln", sql.NVarChar(100), "Highland")
      .input("co", sql.NVarChar(150), "Highland Commercial Properties (Sample)")
      .input("addr1", sql.NVarChar(200), "100 Innovation Way, Suite 400")
      .input("city", sql.NVarChar(100), "Denver")
      .input("state", sql.NVarChar(50), "CO")
      .input("zip", sql.NVarChar(20), "80202")
      .input("intNotes", sql.NVarChar(4000), "Biweekly occurrence billed and paid.")
      .input("custNotes", sql.NVarChar(4000), "Biweekly grounds maintenance invoice.")
      .input("orgId", sql.Int, orgId)
      .query<{ id: number }>(`
        INSERT INTO dbo.Invoices (
          [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Paid Date], [Invoice Amount],
          ProjectID, CustomerID, [First Name], [Last Name], [Company Name],
          [Billing Address Line 1], [Billing Address City], [Billing Address State], [Billing Address Zip],
          IsProjectBilling, InternalNotes, CustomerNotes, OrganizationID
        )
        VALUES (
          @invNo, @invDate, @dueDate, @paidDate, @amt,
          @projId, @custId, @fn, @ln, @co,
          @addr1, @city, @state, @zip,
          0, @intNotes, @custNotes, @orgId
        );
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
      `);
    const invRecurringId = invRecurring.recordset[0].id;
    tracker.add("Invoices", invRecurringId);

    // =========================================================================
    // PERSIST TRACKING ENTRIES
    // =========================================================================

    // =========================================================================
    // PERSIST TRACKING ENTRIES
    // =========================================================================
    await tracker.persist(transaction);

    await transaction.commit();

    return {
      success: true,
      hasSampleData: true,
      recordCount: tracker.totalCount,
      message: "Sample data included successfully.",
      details: tracker.getCounts(),
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // rollback error suppressed
    }
    throw err;
  }
}

/**
 * Cleanly and surgically deletes all sample data previously generated for the organization.
 * Real user data is untouched.
 */
export async function excludeSampleData(organizationId?: number): Promise<SampleDataResult> {
  const orgId = organizationId ?? (await getActiveOrganizationId());
  const pool = await getPool();

  const tracked = await pool
    .request()
    .input("orgId", sql.Int, orgId)
    .query<{ TableName: string; RecordKey: string }>(`
      SELECT TableName, RecordKey
      FROM dbo.SampleDataRecords
      WHERE OrganizationID = @orgId
      ORDER BY SampleRecordID DESC;
    `);

  if (tracked.recordset.length === 0) {
    return {
      success: true,
      hasSampleData: false,
      recordCount: 0,
      message: "No sample data found to remove.",
    };
  }

  const byTable = new Map<string, string[]>();
  for (const row of tracked.recordset) {
    const list = byTable.get(row.TableName) ?? [];
    list.push(row.RecordKey);
    byTable.set(row.TableName, list);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Reopen any completed sample projects to 'Active' first so that triggers like
    // TR_Invoices_CompletedProjectReadOnly, TR_Bills_CompletedProjectReadOnly, etc.
    // do not block deletion of child records.
    const projectKeys = byTable.get("Projects");
    if (projectKeys && projectKeys.length > 0) {
      const projList = projectKeys.join(",");
      await transaction.request().input("orgId", sql.Int, orgId).query(`
        UPDATE dbo.Projects
        SET ProjectStatus = 'Active'
        WHERE OrganizationID = @orgId AND ProjectID IN (${projList}) AND ProjectStatus = 'Complete';
      `);
    }

    // Helper to delete by keys
    const deleteKeys = async (tableName: string, colName: string, isString = false) => {
      const keys = byTable.get(tableName);
      if (!keys || keys.length === 0) return;
      const paramList = keys
        .map((k) => (isString ? `'${k.replace(/'/g, "''")}'` : Number(k)))
        .join(",");
      await transaction.request().input("orgId", sql.Int, orgId).query(`
        DELETE FROM dbo.${tableName}
        WHERE OrganizationID = @orgId AND [${colName}] IN (${paramList});
      `);
    };

    // 1. Bill costs & Bills
    await deleteKeys("ProjectBillCosts", "ProjectBillCostID");
    await deleteKeys("Bills", "id", true);

    // 2. Invoice Allocations, ProjectIssuedInvoices, Invoices
    const invoiceKeys = byTable.get("Invoices");
    if (invoiceKeys && invoiceKeys.length > 0) {
      const invList = invoiceKeys.join(",");
      await transaction.request().input("orgId", sql.Int, orgId).query(`
        DELETE FROM dbo.ProjectInvoiceAllocations WHERE OrganizationID = @orgId AND InvoiceID IN (${invList});
        DELETE FROM dbo.ProjectIssuedInvoices WHERE OrganizationID = @orgId AND InvoiceID IN (${invList});
        DELETE FROM dbo.Invoices WHERE OrganizationID = @orgId AND [id] IN (${invList});
      `);
    }

    // 3. Field operations task assignments & tasks
    await deleteKeys("FieldOperationsTaskAssignments", "FieldOperationsTaskAssignmentID");
    await deleteKeys("FieldOperationsTasks", "FieldOperationsTaskID");

    // 4. Billing scopes, units, and project settings
    await deleteKeys("ProjectBillingScopes", "BillingScopeID");
    await deleteKeys("ProjectBillingUnits", "BillingUnitID");

    if (projectKeys && projectKeys.length > 0) {
      const projList = projectKeys.join(",");
      await transaction.request().input("orgId", sql.Int, orgId).query(`
        IF OBJECT_ID('dbo.ProjectAttachments', 'U') IS NOT NULL
          DELETE FROM dbo.ProjectAttachments WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
        DELETE FROM dbo.ProjectBillingSettings WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
        DELETE FROM dbo.ProjectBillingMilestones WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
        DELETE FROM dbo.ProjectResourceAssignments WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
        DELETE FROM dbo.ProjectActualCosts WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
        DELETE FROM dbo.ServiceVisits WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
        DELETE FROM dbo.Projects WHERE OrganizationID = @orgId AND ProjectID IN (${projList});
      `);
    }

    // 5. Routes
    await deleteKeys("Routes", "RouteID");

    // 6. Estimate line items, scopes, revisions, estimates
    await deleteKeys("EstimateLineItems", "EstimateLineItemID");
    await deleteKeys("EstimateScopesOfWork", "EstimateScopeOfWorkID");
    await deleteKeys("EstimateRevisions", "EstimateRevisionID");
    await deleteKeys("Estimates", "EstimateID");

    // 7. Material prices & materials
    await deleteKeys("MaterialPrices", "MaterialPriceID");
    await deleteKeys("Materials", "MaterialID");

    // 8. Employees & history
    await deleteKeys("EmployeeHistory", "EmployeeHistoryID");

    const empKeys = byTable.get("Employees");
    if (empKeys && empKeys.length > 0) {
      const empList = empKeys.join(",");
      // Break self-referencing manager relationships first
      await transaction.request().input("orgId", sql.Int, orgId).query(`
        UPDATE dbo.Employees SET ManagerID = NULL WHERE OrganizationID = @orgId AND EmployeeID IN (${empList});
        DELETE FROM dbo.Employees WHERE OrganizationID = @orgId AND EmployeeID IN (${empList});
      `);
    }

    // 9. Roles (if created by sample)
    const roleKeys = byTable.get("Roles");
    if (roleKeys && roleKeys.length > 0) {
      const roleList = roleKeys.join(",");
      await transaction.request().query(`
        DELETE FROM dbo.Roles WHERE RoleID IN (${roleList});
      `);
    }

    // 10. Customers
    await deleteKeys("Customers", "CustomerID");

    // 11. Remove tracking records
    await transaction.request().input("orgId", sql.Int, orgId).query(`
      DELETE FROM dbo.SampleDataRecords WHERE OrganizationID = @orgId;
    `);

    await transaction.commit();

    return {
      success: true,
      hasSampleData: false,
      recordCount: 0,
      message: "Sample data removed successfully.",
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // rollback error suppressed
    }
    throw err;
  }
}
