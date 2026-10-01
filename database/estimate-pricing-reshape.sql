SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Pricing reshape: tax becomes an internal-only percentage of cost (not a flat customer-visible
-- amount), and freight moves from a single job-level amount to a per-line vendor-quoted amount
-- that gets folded into that line's cost before markup. Refuse to alter if estimates already
-- exist under the old shape, since this is a structural change, not an additive one.
IF EXISTS (SELECT 1 FROM dbo.EstimateRevisions)
    THROW 51000, 'Migration stopped: EstimateRevisions already has data under the old pricing shape.', 1;
GO

IF COL_LENGTH(N'dbo.EstimateRevisions', N'TaxPercent') IS NULL
    ALTER TABLE dbo.EstimateRevisions ADD TaxPercent decimal(9,4) NOT NULL CONSTRAINT DF_EstimateRevisions_TaxPercent DEFAULT 0;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateRevisions_TaxPercent')
    ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT CK_EstimateRevisions_TaxPercent;
ALTER TABLE dbo.EstimateRevisions ADD CONSTRAINT CK_EstimateRevisions_TaxPercent CHECK (TaxPercent BETWEEN 0 AND 100);
GO

IF COL_LENGTH(N'dbo.EstimateRevisions', N'TaxAmount') IS NOT NULL
BEGIN
    DECLARE @taxDefault sysname = (
        SELECT dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.EstimateRevisions') AND c.name = N'TaxAmount'
    );
    IF @taxDefault IS NOT NULL EXEC('ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT ' + @taxDefault);
    ALTER TABLE dbo.EstimateRevisions DROP COLUMN TaxAmount;
END;
GO

IF COL_LENGTH(N'dbo.EstimateRevisions', N'FreightAmount') IS NOT NULL
BEGIN
    DECLARE @freightDefault sysname = (
        SELECT dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.EstimateRevisions') AND c.name = N'FreightAmount'
    );
    IF @freightDefault IS NOT NULL EXEC('ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT ' + @freightDefault);
    ALTER TABLE dbo.EstimateRevisions DROP COLUMN FreightAmount;
END;
GO

IF COL_LENGTH(N'dbo.EstimateLineItems', N'FreightAmount') IS NULL
    ALTER TABLE dbo.EstimateLineItems ADD FreightAmount decimal(19,4) NOT NULL CONSTRAINT DF_EstimateLineItems_Freight DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateLineItems_Freight')
    ALTER TABLE dbo.EstimateLineItems ADD CONSTRAINT CK_EstimateLineItems_Freight CHECK (FreightAmount >= 0);
GO
