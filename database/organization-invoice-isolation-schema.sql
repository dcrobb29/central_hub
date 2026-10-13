SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1. Add NextInvoiceSequence to dbo.OrganizationInvoiceSettings if not exists
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'OrganizationInvoiceSettings' AND COLUMN_NAME = 'NextInvoiceSequence'
)
BEGIN
    ALTER TABLE dbo.OrganizationInvoiceSettings
    ADD NextInvoiceSequence int NOT NULL CONSTRAINT DF_OrgInvoiceSettings_NextInvoiceSequence DEFAULT 1;
END;

-- 2. Add Unique Index on (OrganizationID, [Invoice No]) to enforce per-organization uniqueness
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Invoices_Organization_InvoiceNo' AND object_id = OBJECT_ID('dbo.Invoices')
)
BEGIN
    CREATE UNIQUE INDEX UX_Invoices_Organization_InvoiceNo ON dbo.Invoices(OrganizationID, [Invoice No]);
END;

-- 3. Ensure permissions for applicationLogin
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.OrganizationInvoiceSettings TO applicationLogin;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.Invoices TO applicationLogin;

COMMIT TRANSACTION;
