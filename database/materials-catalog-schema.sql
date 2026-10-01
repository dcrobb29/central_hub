SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Catalog of materials/items estimators can price and reuse. Soft-archive via IsActive rather
-- than deleting, since historical estimate lines may still reference a material.
IF OBJECT_ID(N'dbo.Materials', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Materials (
        MaterialID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Materials PRIMARY KEY,
        MaterialName nvarchar(200) NOT NULL,
        UnitName nvarchar(30) NULL,
        IsActive bit NOT NULL CONSTRAINT DF_Materials_IsActive DEFAULT 1,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Materials_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Materials') AND name = N'IX_Materials_MaterialName')
    CREATE INDEX IX_Materials_MaterialName ON dbo.Materials(MaterialName);
GO

-- Append-only price history: never update a past price, only add a newer one. This is what
-- lets an estimator see how old the last recorded price is, and lets the catalog carry
-- multiple vendor quotes for the same material over time.
IF OBJECT_ID(N'dbo.MaterialPrices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MaterialPrices (
        MaterialPriceID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_MaterialPrices PRIMARY KEY,
        MaterialID int NOT NULL,
        UnitCost decimal(19,4) NOT NULL,
        QuotedDate date NOT NULL,
        VendorName nvarchar(150) NULL,
        Notes nvarchar(300) NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_MaterialPrices_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_MaterialPrices_Materials FOREIGN KEY (MaterialID) REFERENCES dbo.Materials(MaterialID),
        CONSTRAINT CK_MaterialPrices_UnitCost CHECK (UnitCost >= 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.MaterialPrices') AND name = N'IX_MaterialPrices_MaterialID_QuotedDate')
    CREATE INDEX IX_MaterialPrices_MaterialID_QuotedDate ON dbo.MaterialPrices(MaterialID, QuotedDate DESC);
GO

-- Snapshot of the catalog price at the moment a line was pulled in, kept separate from the
-- line's own (independently editable) UnitCost so later catalog price changes never alter an
-- already-quoted estimate, and so the price's age at quote time stays answerable later.
IF COL_LENGTH(N'dbo.EstimateLineItems', N'MaterialID') IS NULL
    ALTER TABLE dbo.EstimateLineItems ADD MaterialID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_EstimateLineItems_Materials')
    ALTER TABLE dbo.EstimateLineItems ADD CONSTRAINT FK_EstimateLineItems_Materials FOREIGN KEY (MaterialID) REFERENCES dbo.Materials(MaterialID);
GO

IF COL_LENGTH(N'dbo.EstimateLineItems', N'CatalogUnitCostAtEntry') IS NULL
    ALTER TABLE dbo.EstimateLineItems ADD CatalogUnitCostAtEntry decimal(19,4) NULL;
IF COL_LENGTH(N'dbo.EstimateLineItems', N'CatalogPriceDate') IS NULL
    ALTER TABLE dbo.EstimateLineItems ADD CatalogPriceDate date NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.EstimateLineItems') AND name = N'IX_EstimateLineItems_MaterialID')
    CREATE INDEX IX_EstimateLineItems_MaterialID ON dbo.EstimateLineItems(MaterialID);
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Materials TO [applicationLogin];
    GRANT SELECT, INSERT ON OBJECT::dbo.MaterialPrices TO [applicationLogin];
END;
GO
