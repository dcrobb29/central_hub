IF OBJECT_ID(N'dbo.Projects', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Projects (
        ProjectID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Projects PRIMARY KEY,
        ProjectName nvarchar(150) NOT NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Projects_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF COL_LENGTH(N'dbo.Invoices', N'ProjectID') IS NULL
    ALTER TABLE dbo.Invoices ADD ProjectID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Invoices_Projects')
BEGIN
    ALTER TABLE dbo.Invoices
        ADD CONSTRAINT FK_Invoices_Projects FOREIGN KEY (ProjectID)
        REFERENCES dbo.Projects(ProjectID);
END;
GO

IF COL_LENGTH(N'dbo.Bills', N'ProjectID') IS NULL
    ALTER TABLE dbo.Bills ADD ProjectID int NULL;
GO
IF COL_LENGTH(N'dbo.Bills', N'IsSplit') IS NULL
    ALTER TABLE dbo.Bills ADD IsSplit bit NOT NULL CONSTRAINT DF_Bills_IsSplit DEFAULT 0 WITH VALUES;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Bills_Projects')
BEGIN
    ALTER TABLE dbo.Bills
        ADD CONSTRAINT FK_Bills_Projects FOREIGN KEY (ProjectID)
        REFERENCES dbo.Projects(ProjectID);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Invoices') AND name = N'IX_Invoices_ProjectID')
    CREATE INDEX IX_Invoices_ProjectID ON dbo.Invoices(ProjectID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Bills') AND name = N'IX_Bills_ProjectID')
    CREATE INDEX IX_Bills_ProjectID ON dbo.Bills(ProjectID);
GO

CREATE OR ALTER VIEW dbo.ProjectFinancialSummary
AS
WITH InvoiceTotals AS (
    SELECT
        ProjectID,
        SUM(COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Invoice Amount]), '$', ''), ',', ''), '')), 0)) AS Income,
        SUM(CASE WHEN [Invoice Paid Date] IS NOT NULL
            THEN COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Invoice Amount]), '$', ''), ',', ''), '')), 0)
            ELSE 0 END) AS PaidIncome,
        SUM(CASE WHEN [Invoice Paid Date] IS NULL
            THEN COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Invoice Amount]), '$', ''), ',', ''), '')), 0)
            ELSE 0 END) AS UnpaidIncome
    FROM dbo.Invoices
    WHERE ProjectID IS NOT NULL
    GROUP BY ProjectID
), BillTotals AS (
    SELECT
        ProjectID,
        SUM(COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Bill Amount]), '$', ''), ',', ''), '')), 0)) AS Costs,
        SUM(CASE WHEN [Bill Paid Date] IS NOT NULL
            THEN COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Bill Amount]), '$', ''), ',', ''), '')), 0)
            ELSE 0 END) AS PaidCosts,
        SUM(CASE WHEN [Bill Paid Date] IS NULL
            THEN COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Bill Amount]), '$', ''), ',', ''), '')), 0)
            ELSE 0 END) AS UnpaidCosts
    FROM dbo.Bills
    WHERE ProjectID IS NOT NULL
    GROUP BY ProjectID
), ProjectTotals AS (
    SELECT
        p.ProjectID,
        p.ProjectName,
        COALESCE(i.Income, 0) AS Income,
        COALESCE(i.PaidIncome, 0) AS PaidIncome,
        COALESCE(i.UnpaidIncome, 0) AS UnpaidIncome,
        COALESCE(b.Costs, 0) AS Costs,
        COALESCE(b.PaidCosts, 0) AS PaidCosts,
        COALESCE(b.UnpaidCosts, 0) AS UnpaidCosts
    FROM dbo.Projects p
    LEFT JOIN InvoiceTotals i ON i.ProjectID = p.ProjectID
    LEFT JOIN BillTotals b ON b.ProjectID = p.ProjectID
), Totals AS (
    SELECT SUM(Income) AS AllIncome, SUM(Costs) AS AllCosts
    FROM ProjectTotals
)
SELECT
    pt.ProjectID,
    pt.ProjectName,
    pt.Income,
    pt.PaidIncome,
    pt.UnpaidIncome,
    CASE WHEN t.AllIncome = 0 THEN CAST(0 AS decimal(9,2))
         ELSE CAST(100.0 * pt.Income / t.AllIncome AS decimal(9,2)) END AS PercentOfIncome,
    pt.Costs,
    pt.PaidCosts,
    pt.UnpaidCosts,
    CASE WHEN t.AllCosts = 0 THEN CAST(0 AS decimal(9,2))
         ELSE CAST(100.0 * pt.Costs / t.AllCosts AS decimal(9,2)) END AS PercentOfCosts,
    pt.Income - pt.Costs AS Profit,
    CASE WHEN pt.Income = 0 THEN CAST(0 AS decimal(9,2))
         ELSE CAST(100.0 * (pt.Income - pt.Costs) / pt.Income AS decimal(9,2)) END AS ProfitMargin
FROM ProjectTotals pt
CROSS JOIN Totals t;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT INSERT ON OBJECT::dbo.Projects TO [applicationLogin];
    GRANT SELECT ON OBJECT::dbo.ProjectFinancialSummary TO [applicationLogin];
END;
GO
