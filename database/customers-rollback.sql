SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Customers', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Customers)
    THROW 51000, 'Rollback stopped: customer records exist. Preserve the directory and its references.', 1;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Invoices_Customers')
    ALTER TABLE dbo.Invoices DROP CONSTRAINT FK_Invoices_Customers;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_Customers')
    ALTER TABLE dbo.Projects DROP CONSTRAINT FK_Projects_Customers;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Invoices') AND name = N'IX_Invoices_CustomerID')
    DROP INDEX IX_Invoices_CustomerID ON dbo.Invoices;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'IX_Projects_CustomerID')
    DROP INDEX IX_Projects_CustomerID ON dbo.Projects;
IF COL_LENGTH(N'dbo.Invoices', N'CustomerID') IS NOT NULL
    ALTER TABLE dbo.Invoices DROP COLUMN CustomerID;
IF COL_LENGTH(N'dbo.Projects', N'CustomerID') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN CustomerID;
IF OBJECT_ID(N'dbo.Customers', N'U') IS NOT NULL
    DROP TABLE dbo.Customers;

DECLARE @columns nvarchar(max) = (
    SELECT STRING_AGG(CAST(QUOTENAME(name) AS nvarchar(max)), ',')
    FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name <> 'ProjectStatus' AND is_computed = 0
);
DECLARE @trigger nvarchar(max) = N'
CREATE OR ALTER TRIGGER dbo.TR_Projects_CompletedReadOnly ON dbo.Projects AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.ProjectID = d.ProjectID
        WHERE d.ProjectStatus = ''Complete'' AND (
            i.ProjectID IS NULL OR i.ProjectStatus NOT IN (''Complete'', ''Active'')
            OR EXISTS (SELECT ' + @columns + N' FROM deleted WHERE ProjectID = d.ProjectID
                       EXCEPT SELECT ' + @columns + N' FROM inserted WHERE ProjectID = d.ProjectID))
    )
        THROW 51030, ''This job is Complete and read-only. Reopen it to Active in Project Management before making changes.'', 1;
END';
EXEC sys.sp_executesql @trigger;

-- Widened invoice snapshot columns are retained to avoid truncating historical details.
COMMIT TRANSACTION;
