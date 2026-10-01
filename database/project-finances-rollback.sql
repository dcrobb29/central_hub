IF OBJECT_ID(N'dbo.Projects', N'U') IS NULL
    THROW 51000, 'Rollback stopped: dbo.Projects does not exist.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.Projects)
    THROW 51000, 'Rollback stopped: project records exist.', 1;
GO

IF COL_LENGTH(N'dbo.Invoices', N'ProjectID') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Invoices WHERE ProjectID IS NOT NULL)
    THROW 51000, 'Rollback stopped: invoices are assigned to projects.', 1;
GO

IF COL_LENGTH(N'dbo.Bills', N'ProjectID') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Bills WHERE ProjectID IS NOT NULL)
    THROW 51000, 'Rollback stopped: bills are assigned to projects.', 1;
GO

IF OBJECT_ID(N'dbo.ProjectFinancialSummary', N'V') IS NOT NULL
    DROP VIEW dbo.ProjectFinancialSummary;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Invoices_Projects')
    ALTER TABLE dbo.Invoices DROP CONSTRAINT FK_Invoices_Projects;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Bills_Projects')
    ALTER TABLE dbo.Bills DROP CONSTRAINT FK_Bills_Projects;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Invoices') AND name = N'IX_Invoices_ProjectID')
    DROP INDEX IX_Invoices_ProjectID ON dbo.Invoices;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Bills') AND name = N'IX_Bills_ProjectID')
    DROP INDEX IX_Bills_ProjectID ON dbo.Bills;
GO

IF COL_LENGTH(N'dbo.Invoices', N'ProjectID') IS NOT NULL
    ALTER TABLE dbo.Invoices DROP COLUMN ProjectID;
IF COL_LENGTH(N'dbo.Bills', N'ProjectID') IS NOT NULL
    ALTER TABLE dbo.Bills DROP COLUMN ProjectID;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
    REVOKE INSERT ON OBJECT::dbo.Projects FROM [applicationLogin];
GO

DROP TABLE dbo.Projects;
GO
