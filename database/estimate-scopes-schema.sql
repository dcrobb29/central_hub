SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Line items are rarely standalone — they're often grouped either by scope of work (e.g.
-- "Pavers" bundles the pavers, gravel, labor, and equipment needed to install) or by line
-- type (Material/Labor/Equipment, useful for tax and job-costing purposes). GroupingMode picks
-- which (if any) applies for a given revision; scopes are optional containers a line can
-- belong to; LineType is always captured regardless of grouping mode.
IF COL_LENGTH(N'dbo.EstimateRevisions', N'GroupingMode') IS NULL
BEGIN
    ALTER TABLE dbo.EstimateRevisions
        ADD GroupingMode varchar(16) NOT NULL
        CONSTRAINT DF_EstimateRevisions_GroupingMode DEFAULT 'None' WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateRevisions_GroupingMode')
    ALTER TABLE dbo.EstimateRevisions ADD CONSTRAINT CK_EstimateRevisions_GroupingMode CHECK (GroupingMode IN ('None', 'Scope', 'Type'));
GO

IF OBJECT_ID(N'dbo.EstimateScopesOfWork', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EstimateScopesOfWork (
        EstimateScopeOfWorkID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_EstimateScopesOfWork PRIMARY KEY,
        EstimateRevisionID int NOT NULL,
        ScopeName nvarchar(150) NOT NULL,
        SortOrder int NOT NULL CONSTRAINT DF_EstimateScopesOfWork_SortOrder DEFAULT 0,
        CONSTRAINT FK_EstimateScopesOfWork_Revisions FOREIGN KEY (EstimateRevisionID)
            REFERENCES dbo.EstimateRevisions(EstimateRevisionID),
        CONSTRAINT UQ_EstimateScopesOfWork_Name UNIQUE (EstimateRevisionID, ScopeName)
    );
END;
GO

-- A line can optionally belong to one scope container (NULL falls into the "Ungrouped" bucket
-- even when the revision's GroupingMode is 'Scope' — grouping is never forced per line).
IF COL_LENGTH(N'dbo.EstimateLineItems', N'EstimateScopeOfWorkID') IS NULL
    ALTER TABLE dbo.EstimateLineItems ADD EstimateScopeOfWorkID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_EstimateLineItems_ScopesOfWork')
    ALTER TABLE dbo.EstimateLineItems ADD CONSTRAINT FK_EstimateLineItems_ScopesOfWork
        FOREIGN KEY (EstimateScopeOfWorkID) REFERENCES dbo.EstimateScopesOfWork(EstimateScopeOfWorkID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.EstimateLineItems') AND name = N'IX_EstimateLineItems_ScopeOfWorkID')
    CREATE INDEX IX_EstimateLineItems_ScopeOfWorkID ON dbo.EstimateLineItems(EstimateScopeOfWorkID);
GO

IF COL_LENGTH(N'dbo.EstimateLineItems', N'LineType') IS NULL
BEGIN
    ALTER TABLE dbo.EstimateLineItems
        ADD LineType varchar(16) NOT NULL
        CONSTRAINT DF_EstimateLineItems_LineType DEFAULT 'Material' WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateLineItems_LineType')
    ALTER TABLE dbo.EstimateLineItems ADD CONSTRAINT CK_EstimateLineItems_LineType CHECK (LineType IN ('Material', 'Labor', 'Equipment'));
GO

-- Fourth independent PDF toggle: whether scope-of-work container headers/subtotals show on the
-- customer-facing export. Kept separate from GroupingMode so internal job-costing organization
-- doesn't have to leak onto every customer PDF.
IF COL_LENGTH(N'dbo.Estimates', N'ShowScopesOfWork') IS NULL
BEGIN
    ALTER TABLE dbo.Estimates
        ADD ShowScopesOfWork bit NOT NULL
        CONSTRAINT DF_Estimates_ShowScopesOfWork DEFAULT 0 WITH VALUES;
END;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT ON OBJECT::dbo.EstimateScopesOfWork TO [applicationLogin];
END;
GO
