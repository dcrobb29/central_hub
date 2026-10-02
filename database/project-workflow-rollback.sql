IF EXISTS (SELECT 1 FROM dbo.ProjectBillingMilestones)
    THROW 51000, 'Rollback stopped: billing milestone records exist.', 1;
IF OBJECT_ID(N'dbo.ProjectLineItemProgress', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.ProjectLineItemProgress)
    THROW 51000, 'Rollback stopped: line item progress records exist.', 1;
IF OBJECT_ID(N'dbo.ProjectActualCosts', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.ProjectActualCosts)
    THROW 51000, 'Rollback stopped: actual cost records exist.', 1;
IF OBJECT_ID(N'dbo.ProjectResourceAssignments', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.ProjectResourceAssignments)
    THROW 51000, 'Rollback stopped: resource assignment records exist.', 1;
IF OBJECT_ID(N'dbo.Equipment', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Equipment)
    THROW 51000, 'Rollback stopped: equipment records exist.', 1;
IF COL_LENGTH(N'dbo.Projects', N'ProjectManagerID') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Projects WHERE ProjectManagerID IS NOT NULL)
    THROW 51000, 'Rollback stopped: projects have an assigned project manager.', 1;
IF (COL_LENGTH(N'dbo.Estimates', N'ShowQuantities') IS NOT NULL
      AND EXISTS (SELECT 1 FROM dbo.Estimates WHERE ShowQuantities <> 0))
   OR (COL_LENGTH(N'dbo.Estimates', N'ShowLineTotals') IS NOT NULL
      AND EXISTS (SELECT 1 FROM dbo.Estimates WHERE ShowLineTotals <> 0))
   OR (COL_LENGTH(N'dbo.Estimates', N'ShowSummaryTotal') IS NOT NULL
      AND EXISTS (SELECT 1 FROM dbo.Estimates WHERE ShowSummaryTotal <> 1))
    THROW 51000, 'Rollback stopped: estimates have a non-default print preference.', 1;
GO

IF OBJECT_ID(N'dbo.ProjectBillingMilestones', N'U') IS NOT NULL DROP TABLE dbo.ProjectBillingMilestones;
IF OBJECT_ID(N'dbo.ProjectLineItemProgress', N'U') IS NOT NULL DROP TABLE dbo.ProjectLineItemProgress;
IF OBJECT_ID(N'dbo.ProjectActualCosts', N'U') IS NOT NULL DROP TABLE dbo.ProjectActualCosts;
IF OBJECT_ID(N'dbo.ProjectResourceAssignments', N'U') IS NOT NULL DROP TABLE dbo.ProjectResourceAssignments;
IF OBJECT_ID(N'dbo.Equipment', N'U') IS NOT NULL DROP TABLE dbo.Equipment;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_ProjectManager')
    ALTER TABLE dbo.Projects DROP CONSTRAINT FK_Projects_ProjectManager;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'IX_Projects_ProjectManagerID')
    DROP INDEX IX_Projects_ProjectManagerID ON dbo.Projects;
IF COL_LENGTH(N'dbo.Projects', N'ProjectManagerID') IS NOT NULL
    ALTER TABLE dbo.Projects DROP COLUMN ProjectManagerID;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Estimates_ShowQuantities')
    ALTER TABLE dbo.Estimates DROP CONSTRAINT DF_Estimates_ShowQuantities;
IF COL_LENGTH(N'dbo.Estimates', N'ShowQuantities') IS NOT NULL
    ALTER TABLE dbo.Estimates DROP COLUMN ShowQuantities;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Estimates_ShowLineTotals')
    ALTER TABLE dbo.Estimates DROP CONSTRAINT DF_Estimates_ShowLineTotals;
IF COL_LENGTH(N'dbo.Estimates', N'ShowLineTotals') IS NOT NULL
    ALTER TABLE dbo.Estimates DROP COLUMN ShowLineTotals;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Estimates_ShowSummaryTotal')
    ALTER TABLE dbo.Estimates DROP CONSTRAINT DF_Estimates_ShowSummaryTotal;
IF COL_LENGTH(N'dbo.Estimates', N'ShowSummaryTotal') IS NOT NULL
    ALTER TABLE dbo.Estimates DROP COLUMN ShowSummaryTotal;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.Equipment FROM [applicationLogin];
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectResourceAssignments FROM [applicationLogin];
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectActualCosts FROM [applicationLogin];
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectLineItemProgress FROM [applicationLogin];
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectBillingMilestones FROM [applicationLogin];
END;
GO
