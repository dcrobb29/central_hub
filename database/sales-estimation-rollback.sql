IF OBJECT_ID(N'dbo.Estimates', N'U') IS NULL
    THROW 51000, 'Rollback stopped: dbo.Estimates does not exist.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.Estimates)
    THROW 51000, 'Rollback stopped: estimate records exist.', 1;
GO

IF COL_LENGTH(N'dbo.Projects', N'AcceptedEstimateRevisionID') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Projects WHERE AcceptedEstimateRevisionID IS NOT NULL)
    THROW 51000, 'Rollback stopped: projects are linked to accepted estimates.', 1;
GO

IF COL_LENGTH(N'dbo.Projects', N'ProjectStatus') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Projects WHERE ProjectStatus <> 'Planning')
    THROW 51000, 'Rollback stopped: project statuses have been changed.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_AcceptedEstimateRevision')
    ALTER TABLE dbo.Projects DROP CONSTRAINT FK_Projects_AcceptedEstimateRevision;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'UX_Projects_AcceptedEstimateRevision')
    DROP INDEX UX_Projects_AcceptedEstimateRevision ON dbo.Projects;
GO

IF COL_LENGTH(N'dbo.Projects', N'AcceptedEstimateRevisionID') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN AcceptedEstimateRevisionID;
IF COL_LENGTH(N'dbo.Projects', N'ProjectStatus') IS NOT NULL
    ALTER TABLE dbo.Projects DROP CONSTRAINT DF_Projects_ProjectStatus;
IF COL_LENGTH(N'dbo.Projects', N'ProjectStatus') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN ProjectStatus;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.Estimates FROM [applicationLogin];
    REVOKE SELECT, INSERT ON OBJECT::dbo.EstimateRevisions FROM [applicationLogin];
    REVOKE SELECT, INSERT ON OBJECT::dbo.EstimateLineItems FROM [applicationLogin];
    REVOKE UPDATE ON OBJECT::dbo.Projects FROM [applicationLogin];
END;
GO

DROP TABLE dbo.EstimateLineItems;
DROP TABLE dbo.EstimateRevisions;
DROP TABLE dbo.Estimates;
GO
