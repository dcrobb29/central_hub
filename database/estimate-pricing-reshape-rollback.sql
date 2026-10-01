IF EXISTS (SELECT 1 FROM dbo.EstimateRevisions WHERE TaxPercent <> 0)
    THROW 51000, 'Rollback stopped: estimate revisions have a non-zero tax percent recorded.', 1;
IF EXISTS (SELECT 1 FROM dbo.EstimateLineItems WHERE FreightAmount <> 0)
    THROW 51000, 'Rollback stopped: estimate line items have freight amounts recorded.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateLineItems_Freight')
    ALTER TABLE dbo.EstimateLineItems DROP CONSTRAINT CK_EstimateLineItems_Freight;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'FreightAmount') IS NOT NULL
BEGIN
    DECLARE @freightDefault sysname = (
        SELECT dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.EstimateLineItems') AND c.name = N'FreightAmount'
    );
    IF @freightDefault IS NOT NULL EXEC('ALTER TABLE dbo.EstimateLineItems DROP CONSTRAINT ' + @freightDefault);
    ALTER TABLE dbo.EstimateLineItems DROP COLUMN FreightAmount;
END;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EstimateRevisions_TaxPercent')
    ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT CK_EstimateRevisions_TaxPercent;
IF COL_LENGTH(N'dbo.EstimateRevisions', N'TaxPercent') IS NOT NULL
BEGIN
    DECLARE @taxDefault sysname = (
        SELECT dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.EstimateRevisions') AND c.name = N'TaxPercent'
    );
    IF @taxDefault IS NOT NULL EXEC('ALTER TABLE dbo.EstimateRevisions DROP CONSTRAINT ' + @taxDefault);
    ALTER TABLE dbo.EstimateRevisions DROP COLUMN TaxPercent;
END;
GO

-- Restores the prior job-level columns (old shape) so the earlier migration's own rollback still applies.
IF COL_LENGTH(N'dbo.EstimateRevisions', N'TaxAmount') IS NULL
    ALTER TABLE dbo.EstimateRevisions ADD TaxAmount decimal(19,2) NOT NULL CONSTRAINT DF_EstimateRevisions_Tax DEFAULT 0;
IF COL_LENGTH(N'dbo.EstimateRevisions', N'FreightAmount') IS NULL
    ALTER TABLE dbo.EstimateRevisions ADD FreightAmount decimal(19,2) NOT NULL CONSTRAINT DF_EstimateRevisions_Freight DEFAULT 0;
GO
