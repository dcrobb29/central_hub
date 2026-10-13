SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Invoices_Organization_InvoiceNo' AND object_id = OBJECT_ID('dbo.Invoices')
)
BEGIN
    DROP INDEX UX_Invoices_Organization_InvoiceNo ON dbo.Invoices;
END;

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'OrganizationInvoiceSettings' AND COLUMN_NAME = 'NextInvoiceSequence'
)
BEGIN
    DECLARE @constraintName sysname;
    SELECT @constraintName = d.name
    FROM sys.default_constraints d
    JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
    WHERE d.parent_object_id = OBJECT_ID(N'dbo.OrganizationInvoiceSettings') AND c.name = 'NextInvoiceSequence';

    IF @constraintName IS NOT NULL
        EXEC('ALTER TABLE dbo.OrganizationInvoiceSettings DROP CONSTRAINT ' + @constraintName);

    ALTER TABLE dbo.OrganizationInvoiceSettings DROP COLUMN NextInvoiceSequence;
END;

COMMIT TRANSACTION;
