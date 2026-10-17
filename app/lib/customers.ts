import { getPool, sql } from "@/app/lib/db";
import { CUSTOMER_FIELD_GROUPS, type Customer, type CustomerDetails } from "@/app/lib/customer-fields";

export class CustomerError extends Error {}

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
