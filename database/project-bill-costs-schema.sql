SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Allocations classify existing bill costs; they are not additional expenses.
-- Keep the older ProjectActualCosts table untouched (it has no bill identity).
IF OBJECT_ID(N'dbo.ProjectBillCosts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectBillCosts (
        ProjectBillCostID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProjectBillCosts PRIMARY KEY,
        ProjectID int NOT NULL,
        BillID nchar(10) NOT NULL,
        EstimateLineItemID int NULL,
        Description nvarchar(300) NOT NULL,
        CostDate date NOT NULL,
        Quantity decimal(19,4) NOT NULL,
        UnitName nvarchar(30) NOT NULL,
        UnitCost decimal(19,4) NOT NULL,
        FreightAmount decimal(19,2) NOT NULL,
        TaxAmount decimal(19,2) NOT NULL,
        Amount decimal(19,2) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_ProjectBillCosts_IsActive DEFAULT 1,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_ProjectBillCosts_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_ProjectBillCosts_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ProjectBillCosts_Projects FOREIGN KEY (ProjectID) REFERENCES dbo.Projects(ProjectID),
        CONSTRAINT FK_ProjectBillCosts_Bills FOREIGN KEY (BillID) REFERENCES dbo.Bills(id),
        CONSTRAINT FK_ProjectBillCosts_Lines FOREIGN KEY (EstimateLineItemID) REFERENCES dbo.EstimateLineItems(EstimateLineItemID),
        CONSTRAINT CK_ProjectBillCosts_Values CHECK (
            Quantity > 0 AND Quantity <= 1000000 AND UnitCost BETWEEN 0 AND 1000000
            AND FreightAmount BETWEEN 0 AND 1000000 AND TaxAmount BETWEEN 0 AND 1000000 AND Amount > 0
            AND LEN(LTRIM(RTRIM(Description))) > 0 AND LEN(LTRIM(RTRIM(UnitName))) > 0),
        CONSTRAINT CK_ProjectBillCosts_Amount CHECK (
            Amount = ROUND(CAST(Quantity AS decimal(15,4)) * CAST(UnitCost AS decimal(15,4)), 2) + FreightAmount + TaxAmount)
    );
END;
GO

-- Narrow operands keep all eight fractional digits during SQL multiplication.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ProjectBillCosts_Amount')
    ALTER TABLE dbo.ProjectBillCosts DROP CONSTRAINT CK_ProjectBillCosts_Amount;
ALTER TABLE dbo.ProjectBillCosts ADD CONSTRAINT CK_ProjectBillCosts_Amount CHECK (
    Amount = ROUND(CAST(Quantity AS decimal(15,4)) * CAST(UnitCost AS decimal(15,4)), 2) + FreightAmount + TaxAmount);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProjectBillCosts') AND name = N'IX_ProjectBillCosts_BillID')
    CREATE INDEX IX_ProjectBillCosts_BillID ON dbo.ProjectBillCosts(BillID, IsActive) INCLUDE (Amount, ProjectID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProjectBillCosts') AND name = N'IX_ProjectBillCosts_ProjectID')
    CREATE INDEX IX_ProjectBillCosts_ProjectID ON dbo.ProjectBillCosts(ProjectID, IsActive, EstimateLineItemID);
GO

-- Protect allocations even when finance/import workflows update a bill directly.
CREATE OR ALTER TRIGGER dbo.TR_Bills_ProtectCostAllocations
ON dbo.Bills AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted b JOIN dbo.ProjectBillCosts c ON c.BillID = b.id AND c.IsActive = 1
        WHERE b.ProjectID IS NULL OR b.ProjectID <> c.ProjectID
    )
        THROW 51021, 'Remove the active cost allocations before changing this bill''s project.', 1;
    IF EXISTS (
        SELECT 1 FROM inserted b
        CROSS APPLY (
            SELECT SUM(Amount) AS Allocated FROM dbo.ProjectBillCosts c WHERE c.BillID = b.id AND c.IsActive = 1
        ) a
        WHERE a.Allocated IS NOT NULL AND (
            TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM(b.[Bill Amount]), '$', ''), ',', ''), '')) IS NULL
            OR a.Allocated > TRY_CONVERT(decimal(19,2), REPLACE(REPLACE(RTRIM(b.[Bill Amount]), '$', ''), ',', '')))
    )
        THROW 51022, 'The bill total cannot be lower than its allocated costs.', 1;
END;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectBillCosts TO [applicationLogin];
GO
