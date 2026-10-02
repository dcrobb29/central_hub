IF EXISTS (SELECT 1 FROM dbo.Estimates WHERE ShowScopesOfWork <> 0)
    THROW 51000, 'Rollback stopped: estimates have scopes-of-work printing enabled.', 1;
IF OBJECT_ID(N'dbo.EstimateScopesOfWork', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.EstimateScopesOfWork)
    THROW 51000, 'Rollback stopped: scope-of-work records exist.', 1;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'LineType') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.EstimateLineItems WHERE LineType <> 'Material')
    THROW 51000, 'Rollback stopped: line items have a non-default line type.', 1;
IF COL_LENGTH(N'dbo.EstimateRevisions', N'GroupingMode') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.EstimateRevisions WHERE GroupingMode <> 'None')
    THROW 51000, 'Rollback stopped: revisions have a non-default grouping mode.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Estimates_ShowScopesOfWork')
    ALTER TABLE dbo.Estimates DROP CONSTRAINT DF_Estimates_ShowScopesOfWork;
IF COL_LENGTH(N'dbo.Estimates', N'ShowScopesOfWork') IS NOT NULL
    ALTER TABLE dbo.Estimates DROP COLUMN ShowScopesOfWork;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateLineItems_LineType')
    ALTER TABLE dbo.EstimateLineItems DROP CONSTRAINT CK_EstimateLineItems_LineType;
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_EstimateLineItems_LineType')
    ALTER TABLE dbo.EstimateLineItems DROP CONSTRAINT DF_EstimateLineItems_LineType;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'LineType') IS NOT NULL
    ALTER TABLE dbo.EstimateLineItems DROP COLUMN LineType;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.EstimateLineItems') AND name = N'IX_EstimateLineItems_ScopeOfWorkID')
    DROP INDEX IX_EstimateLineItems_ScopeOfWorkID ON dbo.EstimateLineItems;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_EstimateLineItems_ScopesOfWork')
    ALTER TABLE dbo.EstimateLineItems DROP CONSTRAINT FK_EstimateLineItems_ScopesOfWork;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'EstimateScopeOfWorkID') IS NOT NULL
    ALTER TABLE dbo.EstimateLineItems DROP COLUMN EstimateScopeOfWorkID;
GO

IF OBJECT_ID(N'dbo.EstimateScopesOfWork', N'U') IS NOT NULL
    DROP TABLE dbo.EstimateScopesOfWork;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateRevisions_GroupingMode')
    ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT CK_EstimateRevisions_GroupingMode;
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_EstimateRevisions_GroupingMode')
    ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT DF_EstimateRevisions_GroupingMode;
IF COL_LENGTH(N'dbo.EstimateRevisions', N'GroupingMode') IS NOT NULL
    ALTER TABLE dbo.EstimateRevisions DROP COLUMN GroupingMode;
GO
