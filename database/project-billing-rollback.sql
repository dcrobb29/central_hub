SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.ProjectBillingUnits',N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.ProjectBillingUnits)
    THROW 51000, 'Rollback stopped: project scope/occurrence snapshots exist. Preserve completion and billing history.', 1;
IF OBJECT_ID(N'dbo.ProjectIssuedInvoices',N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.ProjectIssuedInvoices)
    THROW 51000, 'Rollback stopped: issued invoices exist.', 1;

DROP TRIGGER IF EXISTS dbo.TR_BillingAllocations_Validate;
DROP TRIGGER IF EXISTS dbo.TR_ProjectIssuedInvoices_Immutable;
DROP TRIGGER IF EXISTS dbo.TR_ProjectBillingSettings_Immutable;
DROP TRIGGER IF EXISTS dbo.TR_ProjectBillingScopes_Snapshot;
DROP TRIGGER IF EXISTS dbo.TR_ProjectBillingUnits_Snapshot;
DROP TRIGGER IF EXISTS dbo.TR_ServiceVisits_BillingProtection;
DROP TABLE IF EXISTS dbo.ProjectInvoiceAllocations;
DROP TABLE IF EXISTS dbo.ProjectIssuedInvoices;
DROP TABLE IF EXISTS dbo.ProjectBillingSettings;
DROP TABLE IF EXISTS dbo.ProjectBillingScopes;
DROP TABLE IF EXISTS dbo.ProjectBillingUnits;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Invoices') AND name='IX_Invoices_InvoiceNo')
    DROP INDEX IX_Invoices_InvoiceNo ON dbo.Invoices;
GO
CREATE OR ALTER TRIGGER dbo.TR_Invoices_CompletedProjectReadOnly ON dbo.Invoices AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH(HOLDLOCK) ON p.ProjectID=c.ProjectID WHERE p.ProjectStatus='Complete')
       OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH(HOLDLOCK) ON p.ProjectID=c.ProjectID WHERE p.ProjectStatus='Complete')
       THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
END;
GO
IF COL_LENGTH(N'dbo.Invoices',N'IsProjectBilling') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Invoices DROP CONSTRAINT DF_Invoices_ProjectBilling;
    ALTER TABLE dbo.Invoices DROP COLUMN IsProjectBilling;
END;
-- Retain the widened invoice amount column to avoid truncating Finance records.
-- Retain invoice InternalNotes/CustomerNotes so Finance notes are not lost.
COMMIT TRANSACTION;
