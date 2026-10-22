import { getPool, sql } from "@/app/lib/db";
import {
  CUSTOMER_FIELD_GROUPS, customerBillingAddressText, customerEstimateName,
  type Customer, type CustomerDetails,
} from "@/app/lib/customer-fields";
import { ProjectAccessError } from "@/app/lib/project-access-error";

export class CustomerError extends Error {}

export type CustomerSearchResult = {
  customerId: number;
  displayName: string;
  contactName: string;
  email: string | null;
  address: string | null;
};

const DISPLAY_NAME_SQL = "COALESCE(NULLIF(LTRIM(RTRIM(CompanyName)), N''), LTRIM(RTRIM(CONCAT(FirstName, N' ', LastName))))";
const CONTACT_NAME_SQL = "LTRIM(RTRIM(CONCAT(FirstName, N' ', LastName)))";
const SEARCH_COLUMNS = `CustomerID AS customerId, ${DISPLAY_NAME_SQL} AS displayName, ${CONTACT_NAME_SQL} AS contactName, Email AS email,
  BillingAddressLine1 AS billingAddressLine1, BillingAddressLine2 AS billingAddressLine2,
  BillingAddressCity AS billingAddressCity, BillingAddressState AS billingAddressState, BillingAddressZip AS billingAddressZip`;

type SearchRow = Omit<CustomerSearchResult, "address"> & Pick<CustomerDetails,
  "billingAddressLine1" | "billingAddressLine2" | "billingAddressCity" | "billingAddressState" | "billingAddressZip">;

function toSearchResult(row: SearchRow): CustomerSearchResult {
  return {
    customerId: row.customerId, displayName: row.displayName, contactName: row.contactName,
    email: row.email, address: customerBillingAddressText(row),
  };
}

// Active customers of one organization whose company or contact name contains the typed text.
export async function searchCustomers(organizationId: number, query: string, limit = 15): Promise<CustomerSearchResult[]> {
  const text = query.trim().slice(0, 100);
  const escape = (value: string) => value.replace(/[\\%_[]/g, (character) => `\\${character}`);
  const pool = await getPool();
  const result = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .input("limit", sql.Int, Math.min(Math.max(limit, 1), 25))
    .input("contains", sql.NVarChar(210), `%${escape(text)}%`)
    .input("prefix", sql.NVarChar(210), `${escape(text)}%`)
    .query<SearchRow>(`
      SELECT TOP (@limit) ${SEARCH_COLUMNS}
      FROM dbo.Customers
      WHERE OrganizationID = @orgId AND IsActive = 1
        AND (CompanyName LIKE @contains ESCAPE '\\' OR ${CONTACT_NAME_SQL} LIKE @contains ESCAPE '\\')
      ORDER BY CASE WHEN ${DISPLAY_NAME_SQL} LIKE @prefix ESCAPE '\\' THEN 0 ELSE 1 END, ${DISPLAY_NAME_SQL}, CustomerID
    `);
  return result.recordset.map(toSearchResult);
}

// Existing customers in the organization that a new customer might duplicate.
export async function findSimilarCustomers(organizationId: number, details: CustomerDetails): Promise<CustomerSearchResult[]> {
  const pool = await getPool();
  const result = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .input("name", sql.NVarChar(260), customerEstimateName(details).toLowerCase())
    .input("email", sql.NVarChar(254), details.email?.toLowerCase() ?? null)
    .query<SearchRow>(`
      SELECT TOP (5) ${SEARCH_COLUMNS}
      FROM dbo.Customers
      WHERE OrganizationID = @orgId
        AND (LOWER(${DISPLAY_NAME_SQL}) = @name OR (@email IS NOT NULL AND LOWER(Email) = @email))
      ORDER BY ${DISPLAY_NAME_SQL}, CustomerID
    `);
  return result.recordset.map(toSearchResult);
}

export type EstimateCustomerSnapshot = { customerId: number; customerName: string; customerAddress: string | null };

// Confirms the customer belongs to the organization (and is active unless already linked) and returns the values to snapshot.
export async function resolveEstimateCustomer(
  runner: { request(): sql.Request },
  organizationId: number,
  customerId: number,
  currentCustomerId: number | null = null,
): Promise<EstimateCustomerSnapshot> {
  const result = await runner.request()
    .input("orgId", sql.Int, organizationId)
    .input("customerId", sql.Int, customerId)
    .query<CustomerDetails & { isActive: boolean }>(`
      SELECT FirstName AS firstName, LastName AS lastName, CompanyName AS companyName, IsActive AS isActive,
        BillingAddressLine1 AS billingAddressLine1, BillingAddressLine2 AS billingAddressLine2,
        BillingAddressCity AS billingAddressCity, BillingAddressState AS billingAddressState, BillingAddressZip AS billingAddressZip
      FROM dbo.Customers WHERE CustomerID = @customerId AND OrganizationID = @orgId
    `);
  const customer = result.recordset[0];
  if (!customer || (!customer.isActive && customerId !== currentCustomerId)) {
    throw new ProjectAccessError("Choose an existing customer from your customer list.", 400);
  }
  return { customerId, customerName: customerEstimateName(customer), customerAddress: customerBillingAddressText(customer) };
}

export async function getCustomers(organizationId: number): Promise<Customer[]> {
  const pool = await getPool();
  const result = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .query<Customer>(`
    SELECT CustomerID AS customerId, FirstName AS firstName, LastName AS lastName, CompanyName AS companyName,
      Email AS email, Phone AS phone, IsActive AS isActive,
      BillingAddressLine1 AS billingAddressLine1, BillingAddressLine2 AS billingAddressLine2,
      BillingAddressCity AS billingAddressCity, BillingAddressState AS billingAddressState, BillingAddressZip AS billingAddressZip,
      ShippingAddressLine1 AS shippingAddressLine1, ShippingAddressLine2 AS shippingAddressLine2,
      ShippingAddressCity AS shippingAddressCity, ShippingAddressState AS shippingAddressState, ShippingAddressZip AS shippingAddressZip
    FROM dbo.Customers
    WHERE OrganizationID = @orgId
    ORDER BY COALESCE(CompanyName, FirstName), LastName, CustomerID
  `);
  return result.recordset;
}

export async function saveCustomer(input: CustomerDetails, customerId: number | null, organizationId: number): Promise<number> {
  const pool = await getPool();
  const request = pool.request().input("customerId", sql.Int, customerId).input("orgId", sql.Int, organizationId);
  for (const { fields } of CUSTOMER_FIELD_GROUPS) {
    for (const field of fields) request.input(field.key, sql.NVarChar(field.maxLength), input[field.key]);
  }
  const result = await request.query<{ customerId: number }>(`
    IF @customerId IS NULL
    BEGIN
      INSERT INTO dbo.Customers (FirstName, LastName, CompanyName, Email, Phone, OrganizationID,
        BillingAddressLine1, BillingAddressLine2, BillingAddressCity, BillingAddressState, BillingAddressZip,
        ShippingAddressLine1, ShippingAddressLine2, ShippingAddressCity, ShippingAddressState, ShippingAddressZip)
      VALUES (@firstName, @lastName, @companyName, @email, @phone, @orgId,
        @billingAddressLine1, @billingAddressLine2, @billingAddressCity, @billingAddressState, @billingAddressZip,
        @shippingAddressLine1, @shippingAddressLine2, @shippingAddressCity, @shippingAddressState, @shippingAddressZip);
      SELECT CONVERT(int, SCOPE_IDENTITY()) AS customerId;
    END
    ELSE
    BEGIN
      DECLARE @updated TABLE(customerId int);
      UPDATE dbo.Customers SET FirstName = @firstName, LastName = @lastName, CompanyName = @companyName,
        Email = @email, Phone = @phone,
        BillingAddressLine1 = @billingAddressLine1, BillingAddressLine2 = @billingAddressLine2,
        BillingAddressCity = @billingAddressCity, BillingAddressState = @billingAddressState, BillingAddressZip = @billingAddressZip,
        ShippingAddressLine1 = @shippingAddressLine1, ShippingAddressLine2 = @shippingAddressLine2,
        ShippingAddressCity = @shippingAddressCity, ShippingAddressState = @shippingAddressState, ShippingAddressZip = @shippingAddressZip,
        UpdatedAt = SYSUTCDATETIME()
      OUTPUT inserted.CustomerID INTO @updated
      WHERE CustomerID = @customerId AND OrganizationID = @orgId;
      SELECT customerId FROM @updated;
    END
  `);
  if (!result.recordset[0]) throw new CustomerError("Customer not found");
  return result.recordset[0].customerId;
}

export async function setCustomerActive(customerId: number, isActive: boolean, organizationId: number): Promise<void> {
  const pool = await getPool();
  const result = await pool.request().input("customerId", sql.Int, customerId).input("isActive", sql.Bit, isActive)
    .input("orgId", sql.Int, organizationId)
    .query("UPDATE dbo.Customers SET IsActive = @isActive, UpdatedAt = SYSUTCDATETIME() WHERE CustomerID = @customerId AND OrganizationID = @orgId");
  if (result.rowsAffected[0] !== 1) throw new CustomerError("Customer not found");
}
