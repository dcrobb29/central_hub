SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO
IF COL_LENGTH(N'dbo.Bills', N'IsSplit') IS NULL
    ALTER TABLE dbo.Bills ADD IsSplit bit NOT NULL CONSTRAINT DF_Bills_IsSplit DEFAULT 0 WITH VALUES;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Bills_SplitOwnership')
    ALTER TABLE dbo.Bills ADD CONSTRAINT CK_Bills_SplitOwnership CHECK (IsSplit = 0 OR ProjectID IS NULL);
GO
CREATE OR ALTER VIEW dbo.ProjectFinancialSummary AS
WITH InvoiceCharges AS (
    SELECT ProjectID,
        COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Invoice Amount]), '$', ''), ',', ''), '')), 0) AS Amount,
        [Invoice Paid Date] AS PaidDate
    FROM dbo.Invoices WHERE ProjectID IS NOT NULL
), InvoiceTotals AS (
    SELECT ProjectID, SUM(Amount) AS Income,
        SUM(CASE WHEN PaidDate IS NOT NULL THEN Amount ELSE 0 END) AS PaidIncome,
        SUM(CASE WHEN PaidDate IS NULL THEN Amount ELSE 0 END) AS UnpaidIncome
    FROM InvoiceCharges GROUP BY ProjectID
), BillCharges AS (
    SELECT b.ProjectID,
        COALESCE(TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM(b.[Bill Amount]), '$', ''), ',', ''), '')), 0) AS Amount,
        b.[Bill Paid Date] AS PaidDate
    FROM dbo.Bills b WHERE b.IsSplit = 0 AND b.ProjectID IS NOT NULL
    UNION ALL
    SELECT c.ProjectID, c.Amount, b.[Bill Paid Date]
    FROM dbo.ProjectBillCosts c JOIN dbo.Bills b ON b.id = c.BillID
    WHERE b.IsSplit = 1 AND c.IsActive = 1
), BillTotals AS (
    SELECT ProjectID, SUM(Amount) AS Costs,
        SUM(CASE WHEN PaidDate IS NOT NULL THEN Amount ELSE 0 END) AS PaidCosts,
        SUM(CASE WHEN PaidDate IS NULL THEN Amount ELSE 0 END) AS UnpaidCosts
    FROM BillCharges GROUP BY ProjectID
), ProjectTotals AS (
    SELECT p.ProjectID, p.ProjectName,
        COALESCE(i.Income, 0) AS Income, COALESCE(i.PaidIncome, 0) AS PaidIncome, COALESCE(i.UnpaidIncome, 0) AS UnpaidIncome,
        COALESCE(b.Costs, 0) AS Costs, COALESCE(b.PaidCosts, 0) AS PaidCosts, COALESCE(b.UnpaidCosts, 0) AS UnpaidCosts
    FROM dbo.Projects p LEFT JOIN InvoiceTotals i ON i.ProjectID = p.ProjectID LEFT JOIN BillTotals b ON b.ProjectID = p.ProjectID
), Totals AS (
    SELECT SUM(Income) AS AllIncome, SUM(Costs) AS AllCosts FROM ProjectTotals
)
SELECT pt.*,
    CASE WHEN t.AllIncome = 0 THEN CAST(0 AS decimal(9,2)) ELSE CAST(100.0 * pt.Income / t.AllIncome AS decimal(9,2)) END AS PercentOfIncome,
    CASE WHEN t.AllCosts = 0 THEN CAST(0 AS decimal(9,2)) ELSE CAST(100.0 * pt.Costs / t.AllCosts AS decimal(9,2)) END AS PercentOfCosts,
    pt.Income - pt.Costs AS Profit,
    CASE WHEN pt.Income = 0 THEN CAST(0 AS decimal(9,2)) ELSE CAST(100.0 * (pt.Income - pt.Costs) / pt.Income AS decimal(9,2)) END AS ProfitMargin
FROM ProjectTotals pt CROSS JOIN Totals t;
GO
