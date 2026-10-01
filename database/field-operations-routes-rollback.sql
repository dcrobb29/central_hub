IF OBJECT_ID(N'dbo.ServiceVisits', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.ServiceVisits)
    THROW 51000, 'Rollback stopped: service visit records exist.', 1;
IF OBJECT_ID(N'dbo.Routes', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Routes)
    THROW 51000, 'Rollback stopped: route records exist.', 1;
IF COL_LENGTH(N'dbo.Projects', N'EngagementType') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Projects WHERE EngagementType <> 'Project')
    THROW 51000, 'Rollback stopped: projects use a non-default engagement type.', 1;
IF COL_LENGTH(N'dbo.Projects', N'RouteID') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Projects WHERE RouteID IS NOT NULL)
    THROW 51000, 'Rollback stopped: projects are assigned to a route.', 1;
GO

IF OBJECT_ID(N'dbo.ServiceVisits', N'U') IS NOT NULL DROP TABLE dbo.ServiceVisits;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_Routes')
    ALTER TABLE dbo.Projects DROP CONSTRAINT FK_Projects_Routes;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'IX_Projects_RouteID')
    DROP INDEX IX_Projects_RouteID ON dbo.Projects;
IF COL_LENGTH(N'dbo.Projects', N'RouteID') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN RouteID;
GO

IF OBJECT_ID(N'dbo.Routes', N'U') IS NOT NULL DROP TABLE dbo.Routes;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_RecurrenceFrequency')
    ALTER TABLE dbo.Projects DROP CONSTRAINT CK_Projects_RecurrenceFrequency;
IF COL_LENGTH(N'dbo.Projects', N'RecurrenceFrequency') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN RecurrenceFrequency;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_EngagementType')
    ALTER TABLE dbo.Projects DROP CONSTRAINT CK_Projects_EngagementType;
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Projects_EngagementType')
    ALTER TABLE dbo.Projects DROP CONSTRAINT DF_Projects_EngagementType;
IF COL_LENGTH(N'dbo.Projects', N'EngagementType') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN EngagementType;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.Routes FROM [applicationLogin];
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.ServiceVisits FROM [applicationLogin];
END;
GO
