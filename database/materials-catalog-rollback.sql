IF OBJECT_ID(N'dbo.MaterialPrices', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.MaterialPrices)
    THROW 51000, 'Rollback stopped: material price history exists.', 1;
IF OBJECT_ID(N'dbo.Materials', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Materials)
    THROW 51000, 'Rollback stopped: material catalog records exist.', 1;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'MaterialID') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.EstimateLineItems WHERE MaterialID IS NOT NULL)
    THROW 51000, 'Rollback stopped: estimate lines reference a catalog material.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.EstimateLineItems') AND name = N'IX_EstimateLineItems_MaterialID')
    DROP INDEX IX_EstimateLineItems_MaterialID ON dbo.EstimateLineItems;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_EstimateLineItems_Materials')
    ALTER TABLE dbo.EstimateLineItems DROP CONSTRAINT FK_EstimateLineItems_Materials;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'CatalogPriceDate') IS NOT NULL
    ALTER TABLE dbo.EstimateLineItems DROP COLUMN CatalogPriceDate;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'CatalogUnitCostAtEntry') IS NOT NULL
    ALTER TABLE dbo.EstimateLineItems DROP COLUMN CatalogUnitCostAtEntry;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'MaterialID') IS NOT NULL
    ALTER TABLE dbo.EstimateLineItems DROP COLUMN MaterialID;
GO

IF OBJECT_ID(N'dbo.MaterialPrices', N'U') IS NOT NULL DROP TABLE dbo.MaterialPrices;
IF OBJECT_ID(N'dbo.Materials', N'U') IS NOT NULL DROP TABLE dbo.Materials;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    REVOKE SELECT, INSERT, UPDATE ON OBJECT::dbo.Materials FROM [applicationLogin];
    REVOKE SELECT, INSERT ON OBJECT::dbo.MaterialPrices FROM [applicationLogin];
END;
GO
