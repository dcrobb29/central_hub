-- Schema-only snapshot of local centralHubTest, exported 2026-10-16.
-- Target: a NEW, EMPTY Azure SQL database. This is not an upgrade migration.
-- No rows, logins, users, credentials, or permission grants are exported.
-- Reference data, organization setup, and application accounts must be provisioned separately.
-- Exported using SQL Server SMO with Azure SQL Database targeting.
-- Azure SQL syntax parsing passed; execution against an empty target has not been tested.
-- The source has not applied estimate-status-schema.sql; apply that migration afterwards.
-- Existing bootstrap OrganizationID defaults are preserved; review organization seeding before use.
-- Do not run organizations-foundation-schema.sql on the target: its structure is already included.
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectBillingUnits](
	[BillingUnitID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NOT NULL,
	[ServiceVisitID] [int] NULL,
	[SourceRevisionID] [int] NOT NULL,
	[ContractValue] [decimal](19, 2) NOT NULL,
	[CompletionStatus] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[BillingUnitID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ContractChanges](
	[ChangeID] [int] IDENTITY(1,1) NOT NULL,
	[OrganizationID] [int] NOT NULL,
	[DocumentEstimateID] [int] NOT NULL,
	[ParentEstimateID] [int] NOT NULL,
	[ProjectID] [int] NULL,
	[Kind] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Status] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Version] [int] NOT NULL,
	[SourceAlternateID] [int] NULL,
	[ApprovedAt] [date] NULL,
	[ApprovalReference] [nvarchar](500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ApprovedByUserID] [int] NULL,
	[CreatedAt] [datetime2](7) NOT NULL,
	[ContractBeforeAmount] [decimal](19, 2) NULL,
	[ContractAfterAmount] [decimal](19, 2) NULL,
PRIMARY KEY CLUSTERED 
(
	[ChangeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[DocumentEstimateID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[EstimateRevisions](
	[EstimateRevisionID] [int] IDENTITY(1,1) NOT NULL,
	[EstimateID] [int] NOT NULL,
	[RevisionNumber] [int] NOT NULL,
	[MarkupMode] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[EstimateMarkupPercent] [decimal](9, 4) NOT NULL,
	[RoundingIncrement] [decimal](19, 2) NOT NULL,
	[QuotedTotal] [decimal](19, 2) NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[TaxPercent] [decimal](9, 4) NOT NULL,
	[GroupingMode] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_EstimateRevisions] PRIMARY KEY CLUSTERED 
(
	[EstimateRevisionID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
 CONSTRAINT [UQ_EstimateRevisions_Number] UNIQUE NONCLUSTERED 
(
	[EstimateID] ASC,
	[RevisionNumber] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   VIEW dbo.EffectiveProjectBillingUnits AS
SELECT u.BillingUnitID,u.ProjectID,u.ServiceVisitID,u.SourceRevisionID,u.CompletionStatus,u.OrganizationID,
    u.ContractValue+COALESCE((SELECT SUM(r.QuotedTotal) FROM dbo.ContractChanges c
      JOIN dbo.EstimateRevisions r ON r.EstimateID=c.DocumentEstimateID
      WHERE c.ProjectID=u.ProjectID AND c.Status='Approved'),0) AS ContractValue
FROM dbo.ProjectBillingUnits u;

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectBillingScopes](
	[BillingScopeID] [int] IDENTITY(1,1) NOT NULL,
	[BillingUnitID] [int] NOT NULL,
	[SourceScopeID] [int] NULL,
	[ScopeName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[SortOrder] [int] NOT NULL,
	[ContractValue] [decimal](19, 2) NOT NULL,
	[CompletionStatus] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[BillingScopeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[BillingUnitID] ASC,
	[SortOrder] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ContractChangeDeductions](
	[ChangeID] [int] NOT NULL,
	[EstimateLineItemID] [int] NOT NULL,
	[BillingScopeID] [int] NOT NULL,
	[Quantity] [decimal](19, 4) NOT NULL,
	[SellAmount] [decimal](19, 2) NOT NULL,
	[LandedAmount] [decimal](19, 2) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[ChangeID] ASC,
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   VIEW dbo.EffectiveProjectBillingScopes AS
SELECT s.BillingScopeID,s.BillingUnitID,s.SourceScopeID,s.ScopeName,s.SortOrder,s.CompletionStatus,s.OrganizationID,
    s.ContractValue-COALESCE((SELECT SUM(d.SellAmount) FROM dbo.ContractChangeDeductions d
      JOIN dbo.ContractChanges c ON c.ChangeID=d.ChangeID
      WHERE d.BillingScopeID=s.BillingScopeID AND c.Status='Approved'),0) AS ContractValue
FROM dbo.ProjectBillingScopes s;

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Projects](
	[ProjectID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[AcceptedEstimateRevisionID] [int] NULL,
	[ProjectStatus] [varchar](24) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[ProjectManagerID] [int] NULL,
	[EngagementType] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[RecurrenceFrequency] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[RouteID] [int] NULL,
	[ExpectedStartDate] [date] NULL,
	[ExpectedEndDate] [date] NULL,
	[InternalNotes] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CustomerNotes] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CustomerID] [int] NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Projects] PRIMARY KEY CLUSTERED 
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[EstimateLineItems](
	[EstimateLineItemID] [int] IDENTITY(1,1) NOT NULL,
	[EstimateRevisionID] [int] NOT NULL,
	[LineNumber] [int] NOT NULL,
	[Description] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Quantity] [decimal](19, 4) NOT NULL,
	[UnitName] [nvarchar](30) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[UnitCost] [decimal](19, 4) NOT NULL,
	[LineMarkupPercent] [decimal](9, 4) NOT NULL,
	[FreightAmount] [decimal](19, 4) NOT NULL,
	[MaterialID] [int] NULL,
	[CatalogUnitCostAtEntry] [decimal](19, 4) NULL,
	[CatalogPriceDate] [date] NULL,
	[EstimateScopeOfWorkID] [int] NULL,
	[LineType] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
	[LineOperation] [varchar](8) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[DeductLineID] [int] NULL,
	[SellAmount] [decimal](19, 2) NULL,
	[LandedAmount] [decimal](19, 2) NULL,
 CONSTRAINT [PK_EstimateLineItems] PRIMARY KEY CLUSTERED 
(
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
 CONSTRAINT [UQ_EstimateLineItems_Line] UNIQUE NONCLUSTERED 
(
	[EstimateRevisionID] ASC,
	[LineNumber] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   VIEW dbo.EffectiveProjectEstimateLines AS
WITH sources AS (
 SELECT p.ProjectID,li.EstimateLineItemID,li.EstimateRevisionID,p.OrganizationID,CAST(NULL AS int) AS ChangeID
 FROM dbo.Projects p JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID=p.AcceptedEstimateRevisionID
 UNION ALL
 SELECT c.ProjectID,li.EstimateLineItemID,li.EstimateRevisionID,c.OrganizationID,c.ChangeID
 FROM dbo.ContractChanges c JOIN dbo.EstimateRevisions r ON r.EstimateID=c.DocumentEstimateID
 JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID=r.EstimateRevisionID
 WHERE c.Status='Approved' AND li.LineOperation='Add'
)
SELECT x.ProjectID,x.OrganizationID,x.ChangeID,li.EstimateLineItemID,li.EstimateRevisionID,li.EstimateScopeOfWorkID,
 li.Description,li.LineType,li.LineNumber,li.UnitName,li.UnitCost,li.LineMarkupPercent,r.TaxPercent,
 li.Quantity-COALESCE(d.Quantity,0) AS Quantity,
 CONVERT(decimal(19,2),COALESCE(li.LandedAmount,
   ROUND(li.Quantity*li.UnitCost,2)+ROUND(li.FreightAmount,2)+
   ROUND((ROUND(li.Quantity*li.UnitCost,2)+ROUND(li.FreightAmount,2))*r.TaxPercent/100,2))-COALESCE(d.LandedAmount,0)) AS LandedCostAmount,
 CONVERT(decimal(19,4),li.FreightAmount*(li.Quantity-COALESCE(d.Quantity,0))/li.Quantity) AS FreightAmount
FROM sources x JOIN dbo.EstimateLineItems li ON li.EstimateLineItemID=x.EstimateLineItemID
JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=li.EstimateRevisionID
OUTER APPLY(SELECT SUM(d.Quantity) AS Quantity,SUM(d.LandedAmount) AS LandedAmount FROM dbo.ContractChangeDeductions d
 JOIN dbo.ContractChanges c ON c.ChangeID=d.ChangeID
 WHERE d.EstimateLineItemID=li.EstimateLineItemID AND c.Status='Approved') d;

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Invoices](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[Invoice No] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Invoice Date] [date] NOT NULL,
	[Invoice Due Date] [date] NOT NULL,
	[Invoice Amount] [nvarchar](32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[First Name] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Last Name] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Company Name] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address Line 1] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address Line 2] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address City] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address State] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address Zip] [nvarchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Shipping Address Line 1] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Shipping Address Line 2] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Shipping Address City] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Shipping Address State] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Shipping Address Zip] [nvarchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Invoice Paid Date] [date] NULL,
	[ProjectID] [int] NULL,
	[CustomerID] [int] NULL,
	[IsProjectBilling] [bit] NOT NULL,
	[InternalNotes] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CustomerNotes] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[OrganizationID] [int] NOT NULL,
	[LastEmailedAt] [datetime2](0) NULL,
	[LastEmailedTo] [nvarchar](254) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Bills](
	[id] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Bill No] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Bill Date] [date] NOT NULL,
	[Bill Due Date] [date] NULL,
	[Bill Paid Date] [date] NULL,
	[Bill Amount] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Company Name] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address Line 1] [nchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address Line 2] [nchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address City] [nchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address State] [nchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Billing Address Zip] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ProjectID] [int] NULL,
	[IsSplit] [bit] NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Bills] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectBillCosts](
	[ProjectBillCostID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NOT NULL,
	[BillID] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[EstimateLineItemID] [int] NULL,
	[Description] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CostDate] [date] NOT NULL,
	[Quantity] [decimal](19, 4) NOT NULL,
	[UnitName] [nvarchar](30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[UnitCost] [decimal](19, 4) NOT NULL,
	[FreightAmount] [decimal](19, 2) NOT NULL,
	[TaxAmount] [decimal](19, 2) NOT NULL,
	[Amount] [decimal](19, 2) NOT NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[UpdatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ProjectBillCosts] PRIMARY KEY CLUSTERED 
(
	[ProjectBillCostID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   VIEW dbo.ProjectFinancialSummary AS
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
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AccessRolePermissions](
	[OrganizationID] [int] NOT NULL,
	[AccessRoleID] [int] NOT NULL,
	[PermissionKey] [varchar](64) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[OrganizationID] ASC,
	[AccessRoleID] ASC,
	[PermissionKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AccessRoles](
	[AccessRoleID] [int] IDENTITY(1,1) NOT NULL,
	[RoleKey] [varchar](32) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[RoleName] [nvarchar](80) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[AccessRoleID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Customers](
	[CustomerID] [int] IDENTITY(1,1) NOT NULL,
	[FirstName] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[LastName] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Email] [nvarchar](254) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Phone] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[BillingAddressLine1] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[BillingAddressLine2] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[BillingAddressCity] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[BillingAddressState] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[BillingAddressZip] [nvarchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ShippingAddressLine1] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ShippingAddressLine2] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ShippingAddressCity] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ShippingAddressState] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ShippingAddressZip] [nvarchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[UpdatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Customers] PRIMARY KEY CLUSTERED 
(
	[CustomerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[EmployeeHistory](
	[EmployeeHistoryID] [int] IDENTITY(1,1) NOT NULL,
	[EmployeeID] [int] NOT NULL,
	[EventDate] [date] NOT NULL,
	[Notes] [nvarchar](max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_EmployeeHistory] PRIMARY KEY CLUSTERED 
(
	[EmployeeHistoryID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Employees](
	[EmployeeID] [int] IDENTITY(1,1) NOT NULL,
	[EmployeeName] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[RoleID] [int] NOT NULL,
	[ManagerID] [int] NULL,
	[OrganizationID] [int] NOT NULL,
	[IsActive] [bit] NOT NULL,
 CONSTRAINT [PK_Employees] PRIMARY KEY CLUSTERED 
(
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Equipment](
	[EquipmentID] [int] IDENTITY(1,1) NOT NULL,
	[EquipmentName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[EquipmentType] [nvarchar](80) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[AssetTag] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Equipment] PRIMARY KEY CLUSTERED 
(
	[EquipmentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Estimates](
	[EstimateID] [int] IDENTITY(1,1) NOT NULL,
	[EstimateName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CustomerName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[EstimateStatus] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[ShowQuantities] [bit] NOT NULL,
	[ShowLineTotals] [bit] NOT NULL,
	[ShowSummaryTotal] [bit] NOT NULL,
	[ShowScopesOfWork] [bit] NOT NULL,
	[EngagementType] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[RecurrenceFrequency] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ExpectedStartDate] [date] NULL,
	[ExpectedEndDate] [date] NULL,
	[InternalNotes] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CustomerNotes] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[OrganizationID] [int] NOT NULL,
	[DocumentKind] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[ShowAlternates] [bit] NOT NULL,
 CONSTRAINT [PK_Estimates] PRIMARY KEY CLUSTERED 
(
	[EstimateID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[EstimateScopesOfWork](
	[EstimateScopeOfWorkID] [int] IDENTITY(1,1) NOT NULL,
	[EstimateRevisionID] [int] NOT NULL,
	[ScopeName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[SortOrder] [int] NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_EstimateScopesOfWork] PRIMARY KEY CLUSTERED 
(
	[EstimateScopeOfWorkID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
 CONSTRAINT [UQ_EstimateScopesOfWork_Name] UNIQUE NONCLUSTERED 
(
	[EstimateRevisionID] ASC,
	[ScopeName] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[FieldOperationsTaskAssignments](
	[FieldOperationsTaskAssignmentID] [int] IDENTITY(1,1) NOT NULL,
	[FieldOperationsTaskID] [int] NOT NULL,
	[EmployeeID] [int] NULL,
	[EquipmentID] [int] NULL,
	[IsActive] [bit] NOT NULL,
	[AssignedAt] [datetime2](0) NOT NULL,
	[HoursMode] [varchar](12) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CustomHours] [decimal](10, 2) NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_FieldOperationsTaskAssignments] PRIMARY KEY CLUSTERED 
(
	[FieldOperationsTaskAssignmentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[FieldOperationsTasks](
	[FieldOperationsTaskID] [int] IDENTITY(1,1) NOT NULL,
	[ServiceVisitID] [int] NOT NULL,
	[TaskName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[PlannedLaborHours] [decimal](10, 2) NOT NULL,
	[SortOrder] [int] NOT NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[EstimateLineItemID] [int] NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_FieldOperationsTasks] PRIMARY KEY CLUSTERED 
(
	[FieldOperationsTaskID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[MaterialPrices](
	[MaterialPriceID] [int] IDENTITY(1,1) NOT NULL,
	[MaterialID] [int] NOT NULL,
	[UnitCost] [decimal](19, 4) NOT NULL,
	[QuotedDate] [date] NOT NULL,
	[VendorName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[Notes] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_MaterialPrices] PRIMARY KEY CLUSTERED 
(
	[MaterialPriceID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Materials](
	[MaterialID] [int] IDENTITY(1,1) NOT NULL,
	[MaterialName] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[UnitName] [nvarchar](30) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Materials] PRIMARY KEY CLUSTERED 
(
	[MaterialID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[MembershipAccessRoles](
	[MembershipID] [int] NOT NULL,
	[AccessRoleID] [int] NOT NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[MembershipID] ASC,
	[AccessRoleID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[OrganizationEmployeeUsers](
	[OrganizationID] [int] NOT NULL,
	[EmployeeID] [int] NOT NULL,
	[MembershipID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[OrganizationID] ASC,
	[MembershipID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[OrganizationInvoiceSettings](
	[OrganizationID] [int] NOT NULL,
	[TemplateStyle] [varchar](32) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[AccentColor] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[InvoiceTitle] [nvarchar](64) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CompanyName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyAddressLine1] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyAddressLine2] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyCity] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyState] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyZip] [nvarchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyPhone] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyEmail] [nvarchar](254) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CompanyWebsite] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[TaxNumber] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[PaymentTerms] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[PaymentInstructions] [nvarchar](max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[DefaultCustomerNotes] [nvarchar](max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[EmailSubjectTemplate] [nvarchar](250) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[EmailBodyTemplate] [nvarchar](max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[ShowShippingAddress] [bit] NOT NULL,
	[ShowProjectName] [bit] NOT NULL,
	[ShowItemizedScopes] [bit] NOT NULL,
	[UpdatedAt] [datetime2](0) NOT NULL,
	[NextInvoiceSequence] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[OrganizationMemberships](
	[MembershipID] [int] IDENTITY(1,1) NOT NULL,
	[OrganizationID] [int] NOT NULL,
	[UserID] [int] NOT NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[MembershipID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[OrganizationID] ASC,
	[UserID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[OrganizationID] ASC,
	[MembershipID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Organizations](
	[OrganizationID] [int] IDENTITY(1,1) NOT NULL,
	[OrganizationKey] [varchar](80) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Status] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[OrganizationKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[OrganizationSubscriptions](
	[OrganizationSubscriptionID] [int] IDENTITY(1,1) NOT NULL,
	[OrganizationID] [int] NOT NULL,
	[PlanID] [int] NOT NULL,
	[Status] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[SeatLimit] [int] NULL,
	[TrialEndsAt] [datetime2](0) NULL,
	[BillingProvider] [varchar](32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[ProviderSubscriptionID] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[OrganizationSubscriptionID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Permissions](
	[PermissionKey] [varchar](64) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Description] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[PermissionKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectActualCosts](
	[ProjectActualCostID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NOT NULL,
	[EstimateLineItemID] [int] NULL,
	[Description] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Quantity] [decimal](19, 4) NULL,
	[UnitCost] [decimal](19, 4) NULL,
	[Amount] [decimal](19, 2) NOT NULL,
	[CostDate] [date] NOT NULL,
	[SourceReference] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ProjectActualCosts] PRIMARY KEY CLUSTERED 
(
	[ProjectActualCostID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectAttachments](
	[AttachmentID] [int] IDENTITY(1,1) NOT NULL,
	[OrganizationID] [int] NOT NULL,
	[ProjectID] [int] NOT NULL,
	[Category] [varchar](12) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[FileName] [nvarchar](255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[StorageKey] [varchar](80) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[ContentType] [varchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[SizeBytes] [bigint] NOT NULL,
	[UploadedByUserID] [int] NOT NULL,
	[UploadedAt] [datetime2](7) NOT NULL,
	[IsArchived] [bit] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[AttachmentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[StorageKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectBillingMilestones](
	[ProjectBillingMilestoneID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NOT NULL,
	[MilestoneName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[TargetPercent] [decimal](5, 2) NULL,
	[Status] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CompletedDate] [date] NULL,
	[InvoiceReference] [nvarchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ProjectBillingMilestones] PRIMARY KEY CLUSTERED 
(
	[ProjectBillingMilestoneID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectBillingSettings](
	[ProjectID] [int] NOT NULL,
	[BillingMethod] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectInvoiceAllocations](
	[InvoiceID] [int] NOT NULL,
	[BillingScopeID] [int] NOT NULL,
	[Amount] [decimal](19, 2) NOT NULL,
	[OccurrenceDate] [date] NULL,
	[CompletionStatusAtIssue] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[InvoiceID] ASC,
	[BillingScopeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectIssuedInvoices](
	[InvoiceID] [int] NOT NULL,
	[ProjectID] [int] NOT NULL,
	[RequestID] [uniqueidentifier] NOT NULL,
	[BillingMethod] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[ShowScopes] [bit] NOT NULL,
	[IsReconciled] [bit] NOT NULL,
	[IssuedAt] [datetime2](0) NOT NULL,
	[IncludesIncompleteWork] [bit] NOT NULL,
	[OverrideReason] [nvarchar](4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[OrganizationID] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[InvoiceID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[RequestID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectLineItemProgress](
	[ProjectLineItemProgressID] [int] IDENTITY(1,1) NOT NULL,
	[EstimateLineItemID] [int] NOT NULL,
	[QuantityCompleted] [decimal](19, 4) NULL,
	[PercentComplete] [decimal](5, 2) NULL,
	[Status] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[LastUpdated] [datetime2](0) NOT NULL,
	[Notes] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ProjectLineItemProgress] PRIMARY KEY CLUSTERED 
(
	[ProjectLineItemProgressID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
 CONSTRAINT [UQ_ProjectLineItemProgress_Line] UNIQUE NONCLUSTERED 
(
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectResourceAssignments](
	[ProjectResourceAssignmentID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NOT NULL,
	[EmployeeID] [int] NULL,
	[EquipmentID] [int] NULL,
	[AssignedDate] [date] NOT NULL,
	[RemovedDate] [date] NULL,
	[Notes] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ProjectResourceAssignments] PRIMARY KEY CLUSTERED 
(
	[ProjectResourceAssignmentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Roles](
	[RoleID] [int] IDENTITY(1,1) NOT NULL,
	[RoleName] [nvarchar](80) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Roles] PRIMARY KEY CLUSTERED 
(
	[RoleID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Routes](
	[RouteID] [int] IDENTITY(1,1) NOT NULL,
	[RouteName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CrewLeadEmployeeID] [int] NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_Routes] PRIMARY KEY CLUSTERED 
(
	[RouteID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[SampleDataRecords](
	[SampleRecordID] [int] IDENTITY(1,1) NOT NULL,
	[OrganizationID] [int] NOT NULL,
	[TableName] [nvarchar](80) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[RecordKey] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CreatedAt] [datetime2](7) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[SampleRecordID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ScopeTemplateComponents](
	[ScopeTemplateComponentID] [int] IDENTITY(1,1) NOT NULL,
	[ScopeTemplateID] [int] NOT NULL,
	[Description] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[LineType] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[QuantityPerUnit] [decimal](19, 6) NOT NULL,
	[UnitName] [nvarchar](30) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[UnitCost] [decimal](19, 4) NOT NULL,
	[MaterialID] [int] NULL,
	[SortOrder] [int] NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ScopeTemplateComponents] PRIMARY KEY CLUSTERED 
(
	[ScopeTemplateComponentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ScopeTemplates](
	[ScopeTemplateID] [int] IDENTITY(1,1) NOT NULL,
	[TemplateName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[UnitName] [nvarchar](30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ScopeTemplates] PRIMARY KEY CLUSTERED 
(
	[ScopeTemplateID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ServiceVisits](
	[ServiceVisitID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NOT NULL,
	[VisitDate] [date] NOT NULL,
	[Status] [varchar](16) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CompletedAt] [datetime2](0) NULL,
	[Notes] [nvarchar](300) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[RecurrenceDate] [date] NULL,
	[OrganizationID] [int] NOT NULL,
 CONSTRAINT [PK_ServiceVisits] PRIMARY KEY CLUSTERED 
(
	[ServiceVisitID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[SubscriptionPlans](
	[PlanID] [int] IDENTITY(1,1) NOT NULL,
	[PlanKey] [varchar](32) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[PlanName] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[IsTestPlan] [bit] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[PlanID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[PlanKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[UnitsOfMeasurement](
	[Unit Name] [nchar](20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Unit Abbreviation] [nchar](10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[OrganizationID] [int] NOT NULL
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[UserIdentities](
	[UserIdentityID] [int] IDENTITY(1,1) NOT NULL,
	[UserID] [int] NOT NULL,
	[Issuer] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[Subject] [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[UserIdentityID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
UNIQUE NONCLUSTERED 
(
	[Issuer] ASC,
	[Subject] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Users](
	[UserID] [int] IDENTITY(1,1) NOT NULL,
	[Email] [nvarchar](254) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[NormalizedEmail]  AS (lower(ltrim(rtrim([Email])))) PERSISTED,
	[DisplayName] [nvarchar](150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[IsActive] [bit] NOT NULL,
	[CreatedAt] [datetime2](0) NOT NULL,
	[Phone] [nvarchar](50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[PasswordHash] [nvarchar](255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
PRIMARY KEY CLUSTERED 
(
	[UserID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF),
 CONSTRAINT [UX_Users_Email] UNIQUE NONCLUSTERED 
(
	[NormalizedEmail] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
)

GO
SET ANSI_PADDING ON

GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_AccessRoles_OrganizationKey] ON [dbo].[AccessRoles]
(
	[OrganizationID] ASC,
	[RoleKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_AccessRoles_OrganizationRole] ON [dbo].[AccessRoles]
(
	[OrganizationID] ASC,
	[AccessRoleID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Bills_Organization] ON [dbo].[Bills]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Bills_ProjectID] ON [dbo].[Bills]
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectBillCosts_Bills] ON [dbo].[Bills]
(
	[OrganizationID] ASC,
	[id] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Changes_Parent] ON [dbo].[ContractChanges]
(
	[OrganizationID] ASC,
	[ParentEstimateID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Changes_Source] ON [dbo].[ContractChanges]
(
	[SourceAlternateID] ASC
)
WHERE ([SourceAlternateID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Customers_Organization] ON [dbo].[Customers]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Invoices_Customers] ON [dbo].[Customers]
(
	[OrganizationID] ASC,
	[CustomerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Projects_Customers] ON [dbo].[Customers]
(
	[OrganizationID] ASC,
	[CustomerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EmployeeHistory_Employee_EventDate] ON [dbo].[EmployeeHistory]
(
	[EmployeeID] ASC,
	[EventDate] DESC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EmployeeHistory_Organization] ON [dbo].[EmployeeHistory]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Employees_ManagerID] ON [dbo].[Employees]
(
	[ManagerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Employees_Organization] ON [dbo].[Employees]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Employees_OrganizationEmployee] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_EmployeeHistory_Employees] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Employees_Manager] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_FieldOperationsTaskAssignments_Employees] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectResourceAssignments_Employees] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Projects_ProjectManager] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Routes_CrewLead] ON [dbo].[Employees]
(
	[OrganizationID] ASC,
	[EmployeeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Equipment_Organization] ON [dbo].[Equipment]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_FieldOperationsTaskAssignments_Equipment] ON [dbo].[Equipment]
(
	[OrganizationID] ASC,
	[EquipmentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectResourceAssignments_Equipment] ON [dbo].[Equipment]
(
	[OrganizationID] ASC,
	[EquipmentID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EstimateLineItems_MaterialID] ON [dbo].[EstimateLineItems]
(
	[MaterialID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EstimateLineItems_Organization] ON [dbo].[EstimateLineItems]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EstimateLineItems_ScopeOfWorkID] ON [dbo].[EstimateLineItems]
(
	[EstimateScopeOfWorkID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_FieldOperationsTasks_EstimateLineItems] ON [dbo].[EstimateLineItems]
(
	[OrganizationID] ASC,
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectActualCosts_EstimateLineItems] ON [dbo].[EstimateLineItems]
(
	[OrganizationID] ASC,
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectBillCosts_Lines] ON [dbo].[EstimateLineItems]
(
	[OrganizationID] ASC,
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectLineItemProgress_EstimateLineItems] ON [dbo].[EstimateLineItems]
(
	[OrganizationID] ASC,
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EstimateRevisions_Organization] ON [dbo].[EstimateRevisions]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_EstimateLineItems_Revisions] ON [dbo].[EstimateRevisions]
(
	[OrganizationID] ASC,
	[EstimateRevisionID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_EstimateScopesOfWork_Revisions] ON [dbo].[EstimateRevisions]
(
	[OrganizationID] ASC,
	[EstimateRevisionID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Projects_AcceptedEstimateRevision] ON [dbo].[EstimateRevisions]
(
	[OrganizationID] ASC,
	[EstimateRevisionID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Estimates_Organization] ON [dbo].[Estimates]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_EstimateRevisions_Estimates] ON [dbo].[Estimates]
(
	[OrganizationID] ASC,
	[EstimateID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_EstimateScopesOfWork_Organization] ON [dbo].[EstimateScopesOfWork]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_EstimateLineItems_ScopesOfWork] ON [dbo].[EstimateScopesOfWork]
(
	[OrganizationID] ASC,
	[EstimateScopeOfWorkID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_FieldOperationsTaskAssignments_Organization] ON [dbo].[FieldOperationsTaskAssignments]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_FieldOperationsTaskAssignments_ActiveEmployee] ON [dbo].[FieldOperationsTaskAssignments]
(
	[FieldOperationsTaskID] ASC,
	[EmployeeID] ASC
)
WHERE ([IsActive]=(1) AND [EmployeeID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_FieldOperationsTaskAssignments_ActiveEquipment] ON [dbo].[FieldOperationsTaskAssignments]
(
	[FieldOperationsTaskID] ASC,
	[EquipmentID] ASC
)
WHERE ([IsActive]=(1) AND [EquipmentID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_FieldOperationsTasks_Organization] ON [dbo].[FieldOperationsTasks]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_FieldOperationsTasks_ServiceVisitID] ON [dbo].[FieldOperationsTasks]
(
	[ServiceVisitID] ASC,
	[IsActive] ASC,
	[SortOrder] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_FieldOperationsTasks_VisitEstimateLine] ON [dbo].[FieldOperationsTasks]
(
	[ServiceVisitID] ASC,
	[EstimateLineItemID] ASC
)
WHERE ([EstimateLineItemID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_FieldOperationsTaskAssignments_Tasks] ON [dbo].[FieldOperationsTasks]
(
	[OrganizationID] ASC,
	[FieldOperationsTaskID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Invoices_CustomerID] ON [dbo].[Invoices]
(
	[CustomerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_Invoices_InvoiceNo] ON [dbo].[Invoices]
(
	[Invoice No] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Invoices_Organization] ON [dbo].[Invoices]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Invoices_ProjectID] ON [dbo].[Invoices]
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Invoices_Organization_InvoiceNo] ON [dbo].[Invoices]
(
	[OrganizationID] ASC,
	[Invoice No] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectIs__Invoi__3552E9B6] ON [dbo].[Invoices]
(
	[OrganizationID] ASC,
	[id] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_MaterialPrices_MaterialID_QuotedDate] ON [dbo].[MaterialPrices]
(
	[MaterialID] ASC,
	[QuotedDate] DESC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_MaterialPrices_Organization] ON [dbo].[MaterialPrices]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_Materials_MaterialName] ON [dbo].[Materials]
(
	[MaterialName] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Materials_Organization] ON [dbo].[Materials]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_EstimateLineItems_Materials] ON [dbo].[Materials]
(
	[OrganizationID] ASC,
	[MaterialID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_MaterialPrices_Materials] ON [dbo].[Materials]
(
	[OrganizationID] ASC,
	[MaterialID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ScopeTemplateComponents_Materials] ON [dbo].[Materials]
(
	[OrganizationID] ASC,
	[MaterialID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_OrganizationSubscriptions_Provider] ON [dbo].[OrganizationSubscriptions]
(
	[BillingProvider] ASC,
	[ProviderSubscriptionID] ASC
)
WHERE ([ProviderSubscriptionID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectActualCosts_EstimateLineItemID] ON [dbo].[ProjectActualCosts]
(
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectActualCosts_Organization] ON [dbo].[ProjectActualCosts]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectActualCosts_ProjectID] ON [dbo].[ProjectActualCosts]
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_ProjectAttachments_Project] ON [dbo].[ProjectAttachments]
(
	[OrganizationID] ASC,
	[ProjectID] ASC,
	[Category] ASC,
	[IsArchived] ASC,
	[AttachmentID] DESC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillCosts_BillID] ON [dbo].[ProjectBillCosts]
(
	[BillID] ASC,
	[IsActive] ASC
)
INCLUDE([Amount],[ProjectID]) WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillCosts_Organization] ON [dbo].[ProjectBillCosts]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillCosts_ProjectID] ON [dbo].[ProjectBillCosts]
(
	[ProjectID] ASC,
	[IsActive] ASC,
	[EstimateLineItemID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillingMilestones_Organization] ON [dbo].[ProjectBillingMilestones]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillingMilestones_ProjectID] ON [dbo].[ProjectBillingMilestones]
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillingScopes_Organization] ON [dbo].[ProjectBillingScopes]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectIn__Billi__3DE82FB7] ON [dbo].[ProjectBillingScopes]
(
	[OrganizationID] ASC,
	[BillingScopeID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillingSettings_Organization] ON [dbo].[ProjectBillingSettings]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectBillingUnits_Organization] ON [dbo].[ProjectBillingUnits]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_BillingUnits_Project] ON [dbo].[ProjectBillingUnits]
(
	[ProjectID] ASC
)
WHERE ([ServiceVisitID] IS NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_BillingUnits_Visit] ON [dbo].[ProjectBillingUnits]
(
	[ServiceVisitID] ASC
)
WHERE ([ServiceVisitID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectBi__Billi__2AD55B43] ON [dbo].[ProjectBillingUnits]
(
	[OrganizationID] ASC,
	[BillingUnitID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectInvoiceAllocations_Organization] ON [dbo].[ProjectInvoiceAllocations]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectIssuedInvoices_Organization] ON [dbo].[ProjectIssuedInvoices]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectIn__Invoi__3CF40B7E] ON [dbo].[ProjectIssuedInvoices]
(
	[OrganizationID] ASC,
	[InvoiceID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectLineItemProgress_Organization] ON [dbo].[ProjectLineItemProgress]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectResourceAssignments_Organization] ON [dbo].[ProjectResourceAssignments]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ProjectResourceAssignments_ProjectID] ON [dbo].[ProjectResourceAssignments]
(
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Projects_CustomerID] ON [dbo].[Projects]
(
	[CustomerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Projects_Organization] ON [dbo].[Projects]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Projects_ProjectManagerID] ON [dbo].[Projects]
(
	[ProjectManagerID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Projects_RouteID] ON [dbo].[Projects]
(
	[RouteID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Projects_AcceptedEstimateRevision] ON [dbo].[Projects]
(
	[AcceptedEstimateRevisionID] ASC
)
WHERE ([AcceptedEstimateRevisionID] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectBi__Proje__22401542] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectBi__Proje__308E3499] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectIs__Proje__36470DEF] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Bills_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Invoices_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectActualCosts_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectBillCosts_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectBillingMilestones_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ProjectResourceAssignments_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ServiceVisits_Projects] ON [dbo].[Projects]
(
	[OrganizationID] ASC,
	[ProjectID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Roles_Organization] ON [dbo].[Roles]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Roles_RoleName] ON [dbo].[Roles]
(
	[RoleName] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Employees_Roles] ON [dbo].[Roles]
(
	[OrganizationID] ASC,
	[RoleID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_Routes_Organization] ON [dbo].[Routes]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_Projects_Routes] ON [dbo].[Routes]
(
	[OrganizationID] ASC,
	[RouteID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_SampleDataRecords_Org_Key] ON [dbo].[SampleDataRecords]
(
	[OrganizationID] ASC,
	[TableName] ASC,
	[RecordKey] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_SampleDataRecords_Org_Table] ON [dbo].[SampleDataRecords]
(
	[OrganizationID] ASC,
	[TableName] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ScopeTemplateComponents_Organization] ON [dbo].[ScopeTemplateComponents]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ScopeTemplateComponents_ScopeTemplateID] ON [dbo].[ScopeTemplateComponents]
(
	[ScopeTemplateID] ASC,
	[SortOrder] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ScopeTemplates_Organization] ON [dbo].[ScopeTemplates]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
SET ANSI_PADDING ON

GO
CREATE NONCLUSTERED INDEX [IX_ScopeTemplates_TemplateName] ON [dbo].[ScopeTemplates]
(
	[TemplateName] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_ScopeTemplateComponents_ScopeTemplates] ON [dbo].[ScopeTemplates]
(
	[OrganizationID] ASC,
	[ScopeTemplateID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ServiceVisits_Organization] ON [dbo].[ServiceVisits]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_ServiceVisits_ProjectID_VisitDate] ON [dbo].[ServiceVisits]
(
	[ProjectID] ASC,
	[VisitDate] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_ServiceVisits_RecurrenceDate] ON [dbo].[ServiceVisits]
(
	[ProjectID] ASC,
	[RecurrenceDate] ASC
)
WHERE ([RecurrenceDate] IS NOT NULL)
WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK__ProjectBi__Servi__2334397B] ON [dbo].[ServiceVisits]
(
	[OrganizationID] ASC,
	[ServiceVisitID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Tenant_FK_FieldOperationsTasks_ServiceVisits] ON [dbo].[ServiceVisits]
(
	[OrganizationID] ASC,
	[ServiceVisitID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
CREATE NONCLUSTERED INDEX [IX_UnitsOfMeasurement_Organization] ON [dbo].[UnitsOfMeasurement]
(
	[OrganizationID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, DROP_EXISTING = OFF, ONLINE = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF)
GO
ALTER TABLE [dbo].[AccessRoles] ADD  CONSTRAINT [DF_AccessRoles_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Bills] ADD  CONSTRAINT [DF_Bills_IsSplit]  DEFAULT ((0)) FOR [IsSplit]
GO
ALTER TABLE [dbo].[Bills] ADD  CONSTRAINT [DF_Bills_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ContractChanges] ADD  DEFAULT ('Draft') FOR [Status]
GO
ALTER TABLE [dbo].[ContractChanges] ADD  DEFAULT ((1)) FOR [Version]
GO
ALTER TABLE [dbo].[ContractChanges] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Customers] ADD  CONSTRAINT [DF_Customers_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[Customers] ADD  CONSTRAINT [DF_Customers_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Customers] ADD  CONSTRAINT [DF_Customers_UpdatedAt]  DEFAULT (sysutcdatetime()) FOR [UpdatedAt]
GO
ALTER TABLE [dbo].[Customers] ADD  CONSTRAINT [DF_Customers_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[EmployeeHistory] ADD  CONSTRAINT [DF_EmployeeHistory_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Employees] ADD  CONSTRAINT [DF_Employees_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Employees] ADD  CONSTRAINT [DF_Employees_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[Equipment] ADD  CONSTRAINT [DF_Equipment_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Equipment] ADD  CONSTRAINT [DF_Equipment_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[EstimateLineItems] ADD  CONSTRAINT [DF_EstimateLineItems_Markup]  DEFAULT ((0)) FOR [LineMarkupPercent]
GO
ALTER TABLE [dbo].[EstimateLineItems] ADD  CONSTRAINT [DF_EstimateLineItems_Freight]  DEFAULT ((0)) FOR [FreightAmount]
GO
ALTER TABLE [dbo].[EstimateLineItems] ADD  CONSTRAINT [DF_EstimateLineItems_LineType]  DEFAULT ('Material') FOR [LineType]
GO
ALTER TABLE [dbo].[EstimateLineItems] ADD  CONSTRAINT [DF_EstimateLineItems_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[EstimateLineItems] ADD  DEFAULT ('Add') FOR [LineOperation]
GO
ALTER TABLE [dbo].[EstimateRevisions] ADD  CONSTRAINT [DF_EstimateRevisions_Markup]  DEFAULT ((0)) FOR [EstimateMarkupPercent]
GO
ALTER TABLE [dbo].[EstimateRevisions] ADD  CONSTRAINT [DF_EstimateRevisions_Rounding]  DEFAULT ((0)) FOR [RoundingIncrement]
GO
ALTER TABLE [dbo].[EstimateRevisions] ADD  CONSTRAINT [DF_EstimateRevisions_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[EstimateRevisions] ADD  CONSTRAINT [DF_EstimateRevisions_TaxPercent]  DEFAULT ((0)) FOR [TaxPercent]
GO
ALTER TABLE [dbo].[EstimateRevisions] ADD  CONSTRAINT [DF_EstimateRevisions_GroupingMode]  DEFAULT ('None') FOR [GroupingMode]
GO
ALTER TABLE [dbo].[EstimateRevisions] ADD  CONSTRAINT [DF_EstimateRevisions_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_Status]  DEFAULT ('Draft') FOR [EstimateStatus]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_ShowQuantities]  DEFAULT ((0)) FOR [ShowQuantities]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_ShowLineTotals]  DEFAULT ((0)) FOR [ShowLineTotals]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_ShowSummaryTotal]  DEFAULT ((1)) FOR [ShowSummaryTotal]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_ShowScopesOfWork]  DEFAULT ((0)) FOR [ShowScopesOfWork]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_EngagementType]  DEFAULT ('Project') FOR [EngagementType]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Estimates] ADD  DEFAULT ('Base') FOR [DocumentKind]
GO
ALTER TABLE [dbo].[Estimates] ADD  CONSTRAINT [DF_Estimates_ShowAlternates]  DEFAULT ((1)) FOR [ShowAlternates]
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] ADD  CONSTRAINT [DF_EstimateScopesOfWork_SortOrder]  DEFAULT ((0)) FOR [SortOrder]
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] ADD  CONSTRAINT [DF_EstimateScopesOfWork_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] ADD  CONSTRAINT [DF_FieldOperationsTaskAssignments_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] ADD  CONSTRAINT [DF_FieldOperationsTaskAssignments_AssignedAt]  DEFAULT (sysutcdatetime()) FOR [AssignedAt]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] ADD  CONSTRAINT [DF_FieldOperationsTaskAssignments_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ADD  CONSTRAINT [DF_FieldOperationsTasks_PlannedLaborHours]  DEFAULT ((0)) FOR [PlannedLaborHours]
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ADD  CONSTRAINT [DF_FieldOperationsTasks_SortOrder]  DEFAULT ((0)) FOR [SortOrder]
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ADD  CONSTRAINT [DF_FieldOperationsTasks_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ADD  CONSTRAINT [DF_FieldOperationsTasks_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ADD  CONSTRAINT [DF_FieldOperationsTasks_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Invoices] ADD  CONSTRAINT [DF_Invoices_ProjectBilling]  DEFAULT ((0)) FOR [IsProjectBilling]
GO
ALTER TABLE [dbo].[Invoices] ADD  CONSTRAINT [DF_Invoices_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[MaterialPrices] ADD  CONSTRAINT [DF_MaterialPrices_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[MaterialPrices] ADD  CONSTRAINT [DF_MaterialPrices_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Materials] ADD  CONSTRAINT [DF_Materials_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[Materials] ADD  CONSTRAINT [DF_Materials_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Materials] ADD  CONSTRAINT [DF_Materials_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[MembershipAccessRoles] ADD  CONSTRAINT [DF_MembershipAccessRoles_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ('modern') FOR [TemplateStyle]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ('#0284c7') FOR [AccentColor]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ('INVOICE') FOR [InvoiceTitle]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ('Net 30') FOR [PaymentTerms]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ('Invoice {invoiceNo} from {companyName}') FOR [EmailSubjectTemplate]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ('Hello {customerName},

Please find attached Invoice {invoiceNo} for {invoiceAmount}.
Project: {projectName}
Due date: {dueDate}

Thank you for your business!

Sincerely,
{companyName}') FOR [EmailBodyTemplate]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ((1)) FOR [ShowShippingAddress]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ((1)) FOR [ShowProjectName]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT ((1)) FOR [ShowItemizedScopes]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  DEFAULT (sysutcdatetime()) FOR [UpdatedAt]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings] ADD  CONSTRAINT [DF_OrgInvoiceSettings_NextInvoiceSequence]  DEFAULT ((1)) FOR [NextInvoiceSequence]
GO
ALTER TABLE [dbo].[OrganizationMemberships] ADD  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[OrganizationMemberships] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Organizations] ADD  DEFAULT ('Trial') FOR [Status]
GO
ALTER TABLE [dbo].[Organizations] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[OrganizationSubscriptions] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ProjectActualCosts] ADD  CONSTRAINT [DF_ProjectActualCosts_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ProjectActualCosts] ADD  CONSTRAINT [DF_ProjectActualCosts_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectAttachments] ADD  DEFAULT (sysutcdatetime()) FOR [UploadedAt]
GO
ALTER TABLE [dbo].[ProjectAttachments] ADD  DEFAULT ((0)) FOR [IsArchived]
GO
ALTER TABLE [dbo].[ProjectBillCosts] ADD  CONSTRAINT [DF_ProjectBillCosts_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[ProjectBillCosts] ADD  CONSTRAINT [DF_ProjectBillCosts_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ProjectBillCosts] ADD  CONSTRAINT [DF_ProjectBillCosts_UpdatedAt]  DEFAULT (sysutcdatetime()) FOR [UpdatedAt]
GO
ALTER TABLE [dbo].[ProjectBillCosts] ADD  CONSTRAINT [DF_ProjectBillCosts_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] ADD  CONSTRAINT [DF_ProjectBillingMilestones_Status]  DEFAULT ('Pending') FOR [Status]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] ADD  CONSTRAINT [DF_ProjectBillingMilestones_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] ADD  CONSTRAINT [DF_ProjectBillingMilestones_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectBillingScopes] ADD  DEFAULT ('Upcoming') FOR [CompletionStatus]
GO
ALTER TABLE [dbo].[ProjectBillingScopes] ADD  CONSTRAINT [DF_ProjectBillingScopes_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectBillingSettings] ADD  CONSTRAINT [DF_ProjectBillingSettings_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectBillingUnits] ADD  DEFAULT ('Upcoming') FOR [CompletionStatus]
GO
ALTER TABLE [dbo].[ProjectBillingUnits] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ProjectBillingUnits] ADD  CONSTRAINT [DF_ProjectBillingUnits_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] ADD  CONSTRAINT [DF_ProjectInvoiceAllocations_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ADD  DEFAULT ((1)) FOR [ShowScopes]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ADD  DEFAULT ((0)) FOR [IsReconciled]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ADD  DEFAULT (sysutcdatetime()) FOR [IssuedAt]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ADD  CONSTRAINT [DF_IssuedInvoices_Incomplete]  DEFAULT ((0)) FOR [IncludesIncompleteWork]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ADD  CONSTRAINT [DF_ProjectIssuedInvoices_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] ADD  CONSTRAINT [DF_ProjectLineItemProgress_Status]  DEFAULT ('NotStarted') FOR [Status]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] ADD  CONSTRAINT [DF_ProjectLineItemProgress_LastUpdated]  DEFAULT (sysutcdatetime()) FOR [LastUpdated]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] ADD  CONSTRAINT [DF_ProjectLineItemProgress_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] ADD  CONSTRAINT [DF_ProjectResourceAssignments_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Projects] ADD  CONSTRAINT [DF_Projects_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Projects] ADD  CONSTRAINT [DF_Projects_ProjectStatus]  DEFAULT ('Upcoming') FOR [ProjectStatus]
GO
ALTER TABLE [dbo].[Projects] ADD  CONSTRAINT [DF_Projects_EngagementType]  DEFAULT ('Project') FOR [EngagementType]
GO
ALTER TABLE [dbo].[Projects] ADD  CONSTRAINT [DF_Projects_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Roles] ADD  CONSTRAINT [DF_Roles_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[Routes] ADD  CONSTRAINT [DF_Routes_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Routes] ADD  CONSTRAINT [DF_Routes_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[SampleDataRecords] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] ADD  CONSTRAINT [DF_ScopeTemplateComponents_SortOrder]  DEFAULT ((0)) FOR [SortOrder]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] ADD  CONSTRAINT [DF_ScopeTemplateComponents_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ScopeTemplates] ADD  CONSTRAINT [DF_ScopeTemplates_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[ScopeTemplates] ADD  CONSTRAINT [DF_ScopeTemplates_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ScopeTemplates] ADD  CONSTRAINT [DF_ScopeTemplates_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[ServiceVisits] ADD  CONSTRAINT [DF_ServiceVisits_Status]  DEFAULT ('Scheduled') FOR [Status]
GO
ALTER TABLE [dbo].[ServiceVisits] ADD  CONSTRAINT [DF_ServiceVisits_CreatedAt]  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[ServiceVisits] ADD  CONSTRAINT [DF_ServiceVisits_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[SubscriptionPlans] ADD  DEFAULT ((0)) FOR [IsTestPlan]
GO
ALTER TABLE [dbo].[UnitsOfMeasurement] ADD  CONSTRAINT [DF_UnitsOfMeasurement_BootstrapOrganization]  DEFAULT ((1)) FOR [OrganizationID]
GO
ALTER TABLE [dbo].[UserIdentities] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Users] ADD  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[Users] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[AccessRolePermissions]  WITH CHECK ADD FOREIGN KEY([PermissionKey])
REFERENCES [dbo].[Permissions] ([PermissionKey])
GO
ALTER TABLE [dbo].[AccessRolePermissions]  WITH CHECK ADD FOREIGN KEY([OrganizationID], [AccessRoleID])
REFERENCES [dbo].[AccessRoles] ([OrganizationID], [AccessRoleID])
GO
ALTER TABLE [dbo].[AccessRoles]  WITH CHECK ADD  CONSTRAINT [FK_AccessRoles_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[AccessRoles] CHECK CONSTRAINT [FK_AccessRoles_Organization]
GO
ALTER TABLE [dbo].[Bills]  WITH CHECK ADD  CONSTRAINT [FK_Bills_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Bills] CHECK CONSTRAINT [FK_Bills_Organization]
GO
ALTER TABLE [dbo].[Bills]  WITH CHECK ADD  CONSTRAINT [FK_Bills_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[Bills] CHECK CONSTRAINT [FK_Bills_Projects]
GO
ALTER TABLE [dbo].[Bills]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Bills_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[Bills] CHECK CONSTRAINT [FK_Tenant_FK_Bills_Projects]
GO
ALTER TABLE [dbo].[ContractChangeDeductions]  WITH CHECK ADD FOREIGN KEY([BillingScopeID])
REFERENCES [dbo].[ProjectBillingScopes] ([BillingScopeID])
GO
ALTER TABLE [dbo].[ContractChangeDeductions]  WITH CHECK ADD FOREIGN KEY([ChangeID])
REFERENCES [dbo].[ContractChanges] ([ChangeID])
GO
ALTER TABLE [dbo].[ContractChangeDeductions]  WITH CHECK ADD FOREIGN KEY([EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([EstimateLineItemID])
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD FOREIGN KEY([ApprovedByUserID])
REFERENCES [dbo].[Users] ([UserID])
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD FOREIGN KEY([DocumentEstimateID])
REFERENCES [dbo].[Estimates] ([EstimateID])
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD FOREIGN KEY([ParentEstimateID])
REFERENCES [dbo].[Estimates] ([EstimateID])
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD FOREIGN KEY([SourceAlternateID])
REFERENCES [dbo].[ContractChanges] ([ChangeID])
GO
ALTER TABLE [dbo].[Customers]  WITH CHECK ADD  CONSTRAINT [FK_Customers_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Customers] CHECK CONSTRAINT [FK_Customers_Organization]
GO
ALTER TABLE [dbo].[EmployeeHistory]  WITH CHECK ADD  CONSTRAINT [FK_EmployeeHistory_Employees] FOREIGN KEY([EmployeeID])
REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[EmployeeHistory] CHECK CONSTRAINT [FK_EmployeeHistory_Employees]
GO
ALTER TABLE [dbo].[EmployeeHistory]  WITH CHECK ADD  CONSTRAINT [FK_EmployeeHistory_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[EmployeeHistory] CHECK CONSTRAINT [FK_EmployeeHistory_Organization]
GO
ALTER TABLE [dbo].[EmployeeHistory]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_EmployeeHistory_Employees] FOREIGN KEY([OrganizationID], [EmployeeID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[EmployeeHistory] CHECK CONSTRAINT [FK_Tenant_FK_EmployeeHistory_Employees]
GO
ALTER TABLE [dbo].[Employees]  WITH CHECK ADD  CONSTRAINT [FK_Employees_Manager] FOREIGN KEY([ManagerID])
REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[Employees] CHECK CONSTRAINT [FK_Employees_Manager]
GO
ALTER TABLE [dbo].[Employees]  WITH CHECK ADD  CONSTRAINT [FK_Employees_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Employees] CHECK CONSTRAINT [FK_Employees_Organization]
GO
ALTER TABLE [dbo].[Employees]  WITH CHECK ADD  CONSTRAINT [FK_Employees_Roles] FOREIGN KEY([RoleID])
REFERENCES [dbo].[Roles] ([RoleID])
GO
ALTER TABLE [dbo].[Employees] CHECK CONSTRAINT [FK_Employees_Roles]
GO
ALTER TABLE [dbo].[Employees]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Employees_Manager] FOREIGN KEY([OrganizationID], [ManagerID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[Employees] CHECK CONSTRAINT [FK_Tenant_FK_Employees_Manager]
GO
ALTER TABLE [dbo].[Employees]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Employees_Roles] FOREIGN KEY([OrganizationID], [RoleID])
REFERENCES [dbo].[Roles] ([OrganizationID], [RoleID])
GO
ALTER TABLE [dbo].[Employees] CHECK CONSTRAINT [FK_Tenant_FK_Employees_Roles]
GO
ALTER TABLE [dbo].[Equipment]  WITH CHECK ADD  CONSTRAINT [FK_Equipment_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Equipment] CHECK CONSTRAINT [FK_Equipment_Organization]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_EstimateLineItems_Materials] FOREIGN KEY([MaterialID])
REFERENCES [dbo].[Materials] ([MaterialID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_EstimateLineItems_Materials]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_EstimateLineItems_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_EstimateLineItems_Organization]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_EstimateLineItems_Revisions] FOREIGN KEY([EstimateRevisionID])
REFERENCES [dbo].[EstimateRevisions] ([EstimateRevisionID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_EstimateLineItems_Revisions]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_EstimateLineItems_ScopesOfWork] FOREIGN KEY([EstimateScopeOfWorkID])
REFERENCES [dbo].[EstimateScopesOfWork] ([EstimateScopeOfWorkID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_EstimateLineItems_ScopesOfWork]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_EstimateLineItems_Materials] FOREIGN KEY([OrganizationID], [MaterialID])
REFERENCES [dbo].[Materials] ([OrganizationID], [MaterialID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_Tenant_FK_EstimateLineItems_Materials]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_EstimateLineItems_Revisions] FOREIGN KEY([OrganizationID], [EstimateRevisionID])
REFERENCES [dbo].[EstimateRevisions] ([OrganizationID], [EstimateRevisionID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_Tenant_FK_EstimateLineItems_Revisions]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_EstimateLineItems_ScopesOfWork] FOREIGN KEY([OrganizationID], [EstimateScopeOfWorkID])
REFERENCES [dbo].[EstimateScopesOfWork] ([OrganizationID], [EstimateScopeOfWorkID])
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [FK_Tenant_FK_EstimateLineItems_ScopesOfWork]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [FK_EstimateRevisions_Estimates] FOREIGN KEY([EstimateID])
REFERENCES [dbo].[Estimates] ([EstimateID])
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [FK_EstimateRevisions_Estimates]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [FK_EstimateRevisions_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [FK_EstimateRevisions_Organization]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_EstimateRevisions_Estimates] FOREIGN KEY([OrganizationID], [EstimateID])
REFERENCES [dbo].[Estimates] ([OrganizationID], [EstimateID])
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [FK_Tenant_FK_EstimateRevisions_Estimates]
GO
ALTER TABLE [dbo].[Estimates]  WITH CHECK ADD  CONSTRAINT [FK_Estimates_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Estimates] CHECK CONSTRAINT [FK_Estimates_Organization]
GO
ALTER TABLE [dbo].[EstimateScopesOfWork]  WITH CHECK ADD  CONSTRAINT [FK_EstimateScopesOfWork_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] CHECK CONSTRAINT [FK_EstimateScopesOfWork_Organization]
GO
ALTER TABLE [dbo].[EstimateScopesOfWork]  WITH CHECK ADD  CONSTRAINT [FK_EstimateScopesOfWork_Revisions] FOREIGN KEY([EstimateRevisionID])
REFERENCES [dbo].[EstimateRevisions] ([EstimateRevisionID])
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] CHECK CONSTRAINT [FK_EstimateScopesOfWork_Revisions]
GO
ALTER TABLE [dbo].[EstimateScopesOfWork]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_EstimateScopesOfWork_Revisions] FOREIGN KEY([OrganizationID], [EstimateRevisionID])
REFERENCES [dbo].[EstimateRevisions] ([OrganizationID], [EstimateRevisionID])
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] CHECK CONSTRAINT [FK_Tenant_FK_EstimateScopesOfWork_Revisions]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTaskAssignments_Employees] FOREIGN KEY([EmployeeID])
REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_FieldOperationsTaskAssignments_Employees]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTaskAssignments_Equipment] FOREIGN KEY([EquipmentID])
REFERENCES [dbo].[Equipment] ([EquipmentID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_FieldOperationsTaskAssignments_Equipment]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTaskAssignments_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_FieldOperationsTaskAssignments_Organization]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTaskAssignments_Tasks] FOREIGN KEY([FieldOperationsTaskID])
REFERENCES [dbo].[FieldOperationsTasks] ([FieldOperationsTaskID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_FieldOperationsTaskAssignments_Tasks]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_FieldOperationsTaskAssignments_Employees] FOREIGN KEY([OrganizationID], [EmployeeID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_Tenant_FK_FieldOperationsTaskAssignments_Employees]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_FieldOperationsTaskAssignments_Equipment] FOREIGN KEY([OrganizationID], [EquipmentID])
REFERENCES [dbo].[Equipment] ([OrganizationID], [EquipmentID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_Tenant_FK_FieldOperationsTaskAssignments_Equipment]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_FieldOperationsTaskAssignments_Tasks] FOREIGN KEY([OrganizationID], [FieldOperationsTaskID])
REFERENCES [dbo].[FieldOperationsTasks] ([OrganizationID], [FieldOperationsTaskID])
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [FK_Tenant_FK_FieldOperationsTaskAssignments_Tasks]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTasks_EstimateLineItems] FOREIGN KEY([EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([EstimateLineItemID])
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [FK_FieldOperationsTasks_EstimateLineItems]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTasks_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [FK_FieldOperationsTasks_Organization]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [FK_FieldOperationsTasks_ServiceVisits] FOREIGN KEY([ServiceVisitID])
REFERENCES [dbo].[ServiceVisits] ([ServiceVisitID])
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [FK_FieldOperationsTasks_ServiceVisits]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_FieldOperationsTasks_EstimateLineItems] FOREIGN KEY([OrganizationID], [EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([OrganizationID], [EstimateLineItemID])
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [FK_Tenant_FK_FieldOperationsTasks_EstimateLineItems]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_FieldOperationsTasks_ServiceVisits] FOREIGN KEY([OrganizationID], [ServiceVisitID])
REFERENCES [dbo].[ServiceVisits] ([OrganizationID], [ServiceVisitID])
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [FK_Tenant_FK_FieldOperationsTasks_ServiceVisits]
GO
ALTER TABLE [dbo].[Invoices]  WITH CHECK ADD  CONSTRAINT [FK_Invoices_Customers] FOREIGN KEY([CustomerID])
REFERENCES [dbo].[Customers] ([CustomerID])
GO
ALTER TABLE [dbo].[Invoices] CHECK CONSTRAINT [FK_Invoices_Customers]
GO
ALTER TABLE [dbo].[Invoices]  WITH CHECK ADD  CONSTRAINT [FK_Invoices_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Invoices] CHECK CONSTRAINT [FK_Invoices_Organization]
GO
ALTER TABLE [dbo].[Invoices]  WITH CHECK ADD  CONSTRAINT [FK_Invoices_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[Invoices] CHECK CONSTRAINT [FK_Invoices_Projects]
GO
ALTER TABLE [dbo].[Invoices]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Invoices_Customers] FOREIGN KEY([OrganizationID], [CustomerID])
REFERENCES [dbo].[Customers] ([OrganizationID], [CustomerID])
GO
ALTER TABLE [dbo].[Invoices] CHECK CONSTRAINT [FK_Tenant_FK_Invoices_Customers]
GO
ALTER TABLE [dbo].[Invoices]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Invoices_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[Invoices] CHECK CONSTRAINT [FK_Tenant_FK_Invoices_Projects]
GO
ALTER TABLE [dbo].[MaterialPrices]  WITH CHECK ADD  CONSTRAINT [FK_MaterialPrices_Materials] FOREIGN KEY([MaterialID])
REFERENCES [dbo].[Materials] ([MaterialID])
GO
ALTER TABLE [dbo].[MaterialPrices] CHECK CONSTRAINT [FK_MaterialPrices_Materials]
GO
ALTER TABLE [dbo].[MaterialPrices]  WITH CHECK ADD  CONSTRAINT [FK_MaterialPrices_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[MaterialPrices] CHECK CONSTRAINT [FK_MaterialPrices_Organization]
GO
ALTER TABLE [dbo].[MaterialPrices]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_MaterialPrices_Materials] FOREIGN KEY([OrganizationID], [MaterialID])
REFERENCES [dbo].[Materials] ([OrganizationID], [MaterialID])
GO
ALTER TABLE [dbo].[MaterialPrices] CHECK CONSTRAINT [FK_Tenant_FK_MaterialPrices_Materials]
GO
ALTER TABLE [dbo].[Materials]  WITH CHECK ADD  CONSTRAINT [FK_Materials_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Materials] CHECK CONSTRAINT [FK_Materials_Organization]
GO
ALTER TABLE [dbo].[MembershipAccessRoles]  WITH CHECK ADD FOREIGN KEY([AccessRoleID])
REFERENCES [dbo].[AccessRoles] ([AccessRoleID])
GO
ALTER TABLE [dbo].[MembershipAccessRoles]  WITH CHECK ADD FOREIGN KEY([MembershipID])
REFERENCES [dbo].[OrganizationMemberships] ([MembershipID])
GO
ALTER TABLE [dbo].[MembershipAccessRoles]  WITH CHECK ADD  CONSTRAINT [FK_MembershipAccessRoles_OrganizationMembership] FOREIGN KEY([OrganizationID], [MembershipID])
REFERENCES [dbo].[OrganizationMemberships] ([OrganizationID], [MembershipID])
GO
ALTER TABLE [dbo].[MembershipAccessRoles] CHECK CONSTRAINT [FK_MembershipAccessRoles_OrganizationMembership]
GO
ALTER TABLE [dbo].[MembershipAccessRoles]  WITH CHECK ADD  CONSTRAINT [FK_MembershipAccessRoles_OrganizationRole] FOREIGN KEY([OrganizationID], [AccessRoleID])
REFERENCES [dbo].[AccessRoles] ([OrganizationID], [AccessRoleID])
GO
ALTER TABLE [dbo].[MembershipAccessRoles] CHECK CONSTRAINT [FK_MembershipAccessRoles_OrganizationRole]
GO
ALTER TABLE [dbo].[OrganizationEmployeeUsers]  WITH CHECK ADD FOREIGN KEY([OrganizationID], [EmployeeID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[OrganizationEmployeeUsers]  WITH CHECK ADD FOREIGN KEY([OrganizationID], [MembershipID])
REFERENCES [dbo].[OrganizationMemberships] ([OrganizationID], [MembershipID])
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings]  WITH CHECK ADD FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[OrganizationMemberships]  WITH CHECK ADD FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[OrganizationMemberships]  WITH CHECK ADD FOREIGN KEY([UserID])
REFERENCES [dbo].[Users] ([UserID])
GO
ALTER TABLE [dbo].[OrganizationSubscriptions]  WITH CHECK ADD FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[OrganizationSubscriptions]  WITH CHECK ADD FOREIGN KEY([PlanID])
REFERENCES [dbo].[SubscriptionPlans] ([PlanID])
GO
ALTER TABLE [dbo].[ProjectActualCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectActualCosts_EstimateLineItems] FOREIGN KEY([EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([EstimateLineItemID])
GO
ALTER TABLE [dbo].[ProjectActualCosts] CHECK CONSTRAINT [FK_ProjectActualCosts_EstimateLineItems]
GO
ALTER TABLE [dbo].[ProjectActualCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectActualCosts_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectActualCosts] CHECK CONSTRAINT [FK_ProjectActualCosts_Organization]
GO
ALTER TABLE [dbo].[ProjectActualCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectActualCosts_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectActualCosts] CHECK CONSTRAINT [FK_ProjectActualCosts_Projects]
GO
ALTER TABLE [dbo].[ProjectActualCosts]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectActualCosts_EstimateLineItems] FOREIGN KEY([OrganizationID], [EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([OrganizationID], [EstimateLineItemID])
GO
ALTER TABLE [dbo].[ProjectActualCosts] CHECK CONSTRAINT [FK_Tenant_FK_ProjectActualCosts_EstimateLineItems]
GO
ALTER TABLE [dbo].[ProjectActualCosts]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectActualCosts_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectActualCosts] CHECK CONSTRAINT [FK_Tenant_FK_ProjectActualCosts_Projects]
GO
ALTER TABLE [dbo].[ProjectAttachments]  WITH CHECK ADD FOREIGN KEY([UploadedByUserID])
REFERENCES [dbo].[Users] ([UserID])
GO
ALTER TABLE [dbo].[ProjectAttachments]  WITH CHECK ADD  CONSTRAINT [FK_ProjectAttachments_Project] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectAttachments] CHECK CONSTRAINT [FK_ProjectAttachments_Project]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillCosts_Bills] FOREIGN KEY([BillID])
REFERENCES [dbo].[Bills] ([id])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_ProjectBillCosts_Bills]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillCosts_Lines] FOREIGN KEY([EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([EstimateLineItemID])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_ProjectBillCosts_Lines]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillCosts_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_ProjectBillCosts_Organization]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillCosts_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_ProjectBillCosts_Projects]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectBillCosts_Bills] FOREIGN KEY([OrganizationID], [BillID])
REFERENCES [dbo].[Bills] ([OrganizationID], [id])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_Tenant_FK_ProjectBillCosts_Bills]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectBillCosts_Lines] FOREIGN KEY([OrganizationID], [EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([OrganizationID], [EstimateLineItemID])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_Tenant_FK_ProjectBillCosts_Lines]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectBillCosts_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [FK_Tenant_FK_ProjectBillCosts_Projects]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillingMilestones_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] CHECK CONSTRAINT [FK_ProjectBillingMilestones_Organization]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillingMilestones_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] CHECK CONSTRAINT [FK_ProjectBillingMilestones_Projects]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectBillingMilestones_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] CHECK CONSTRAINT [FK_Tenant_FK_ProjectBillingMilestones_Projects]
GO
ALTER TABLE [dbo].[ProjectBillingScopes]  WITH CHECK ADD FOREIGN KEY([BillingUnitID])
REFERENCES [dbo].[ProjectBillingUnits] ([BillingUnitID])
GO
ALTER TABLE [dbo].[ProjectBillingScopes]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillingScopes_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectBillingScopes] CHECK CONSTRAINT [FK_ProjectBillingScopes_Organization]
GO
ALTER TABLE [dbo].[ProjectBillingScopes]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectBi__Billi__2AD55B43] FOREIGN KEY([OrganizationID], [BillingUnitID])
REFERENCES [dbo].[ProjectBillingUnits] ([OrganizationID], [BillingUnitID])
GO
ALTER TABLE [dbo].[ProjectBillingScopes] CHECK CONSTRAINT [FK_Tenant_FK__ProjectBi__Billi__2AD55B43]
GO
ALTER TABLE [dbo].[ProjectBillingSettings]  WITH CHECK ADD FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillingSettings]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillingSettings_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectBillingSettings] CHECK CONSTRAINT [FK_ProjectBillingSettings_Organization]
GO
ALTER TABLE [dbo].[ProjectBillingSettings]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectBi__Proje__308E3499] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillingSettings] CHECK CONSTRAINT [FK_Tenant_FK__ProjectBi__Proje__308E3499]
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD FOREIGN KEY([ServiceVisitID])
REFERENCES [dbo].[ServiceVisits] ([ServiceVisitID])
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD  CONSTRAINT [FK_ProjectBillingUnits_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectBillingUnits] CHECK CONSTRAINT [FK_ProjectBillingUnits_Organization]
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectBi__Proje__22401542] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectBillingUnits] CHECK CONSTRAINT [FK_Tenant_FK__ProjectBi__Proje__22401542]
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectBi__Servi__2334397B] FOREIGN KEY([OrganizationID], [ServiceVisitID])
REFERENCES [dbo].[ServiceVisits] ([OrganizationID], [ServiceVisitID])
GO
ALTER TABLE [dbo].[ProjectBillingUnits] CHECK CONSTRAINT [FK_Tenant_FK__ProjectBi__Servi__2334397B]
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD FOREIGN KEY([BillingScopeID])
REFERENCES [dbo].[ProjectBillingScopes] ([BillingScopeID])
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD FOREIGN KEY([InvoiceID])
REFERENCES [dbo].[ProjectIssuedInvoices] ([InvoiceID])
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD  CONSTRAINT [FK_ProjectInvoiceAllocations_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] CHECK CONSTRAINT [FK_ProjectInvoiceAllocations_Organization]
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectIn__Billi__3DE82FB7] FOREIGN KEY([OrganizationID], [BillingScopeID])
REFERENCES [dbo].[ProjectBillingScopes] ([OrganizationID], [BillingScopeID])
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] CHECK CONSTRAINT [FK_Tenant_FK__ProjectIn__Billi__3DE82FB7]
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectIn__Invoi__3CF40B7E] FOREIGN KEY([OrganizationID], [InvoiceID])
REFERENCES [dbo].[ProjectIssuedInvoices] ([OrganizationID], [InvoiceID])
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] CHECK CONSTRAINT [FK_Tenant_FK__ProjectIn__Invoi__3CF40B7E]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices]  WITH CHECK ADD FOREIGN KEY([InvoiceID])
REFERENCES [dbo].[Invoices] ([id])
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices]  WITH CHECK ADD FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices]  WITH CHECK ADD  CONSTRAINT [FK_ProjectIssuedInvoices_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] CHECK CONSTRAINT [FK_ProjectIssuedInvoices_Organization]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectIs__Invoi__3552E9B6] FOREIGN KEY([OrganizationID], [InvoiceID])
REFERENCES [dbo].[Invoices] ([OrganizationID], [id])
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] CHECK CONSTRAINT [FK_Tenant_FK__ProjectIs__Invoi__3552E9B6]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK__ProjectIs__Proje__36470DEF] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] CHECK CONSTRAINT [FK_Tenant_FK__ProjectIs__Proje__36470DEF]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress]  WITH CHECK ADD  CONSTRAINT [FK_ProjectLineItemProgress_EstimateLineItems] FOREIGN KEY([EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([EstimateLineItemID])
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] CHECK CONSTRAINT [FK_ProjectLineItemProgress_EstimateLineItems]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress]  WITH CHECK ADD  CONSTRAINT [FK_ProjectLineItemProgress_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] CHECK CONSTRAINT [FK_ProjectLineItemProgress_Organization]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectLineItemProgress_EstimateLineItems] FOREIGN KEY([OrganizationID], [EstimateLineItemID])
REFERENCES [dbo].[EstimateLineItems] ([OrganizationID], [EstimateLineItemID])
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] CHECK CONSTRAINT [FK_Tenant_FK_ProjectLineItemProgress_EstimateLineItems]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_ProjectResourceAssignments_Employees] FOREIGN KEY([EmployeeID])
REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_ProjectResourceAssignments_Employees]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_ProjectResourceAssignments_Equipment] FOREIGN KEY([EquipmentID])
REFERENCES [dbo].[Equipment] ([EquipmentID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_ProjectResourceAssignments_Equipment]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_ProjectResourceAssignments_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_ProjectResourceAssignments_Organization]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_ProjectResourceAssignments_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_ProjectResourceAssignments_Projects]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectResourceAssignments_Employees] FOREIGN KEY([OrganizationID], [EmployeeID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_Tenant_FK_ProjectResourceAssignments_Employees]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectResourceAssignments_Equipment] FOREIGN KEY([OrganizationID], [EquipmentID])
REFERENCES [dbo].[Equipment] ([OrganizationID], [EquipmentID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_Tenant_FK_ProjectResourceAssignments_Equipment]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ProjectResourceAssignments_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [FK_Tenant_FK_ProjectResourceAssignments_Projects]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Projects_AcceptedEstimateRevision] FOREIGN KEY([AcceptedEstimateRevisionID])
REFERENCES [dbo].[EstimateRevisions] ([EstimateRevisionID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Projects_AcceptedEstimateRevision]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Projects_Customers] FOREIGN KEY([CustomerID])
REFERENCES [dbo].[Customers] ([CustomerID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Projects_Customers]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Projects_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Projects_Organization]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Projects_ProjectManager] FOREIGN KEY([ProjectManagerID])
REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Projects_ProjectManager]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Projects_Routes] FOREIGN KEY([RouteID])
REFERENCES [dbo].[Routes] ([RouteID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Projects_Routes]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Projects_AcceptedEstimateRevision] FOREIGN KEY([OrganizationID], [AcceptedEstimateRevisionID])
REFERENCES [dbo].[EstimateRevisions] ([OrganizationID], [EstimateRevisionID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Tenant_FK_Projects_AcceptedEstimateRevision]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Projects_Customers] FOREIGN KEY([OrganizationID], [CustomerID])
REFERENCES [dbo].[Customers] ([OrganizationID], [CustomerID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Tenant_FK_Projects_Customers]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Projects_ProjectManager] FOREIGN KEY([OrganizationID], [ProjectManagerID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Tenant_FK_Projects_ProjectManager]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Projects_Routes] FOREIGN KEY([OrganizationID], [RouteID])
REFERENCES [dbo].[Routes] ([OrganizationID], [RouteID])
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [FK_Tenant_FK_Projects_Routes]
GO
ALTER TABLE [dbo].[Roles]  WITH CHECK ADD  CONSTRAINT [FK_Roles_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Roles] CHECK CONSTRAINT [FK_Roles_Organization]
GO
ALTER TABLE [dbo].[Routes]  WITH CHECK ADD  CONSTRAINT [FK_Routes_CrewLead] FOREIGN KEY([CrewLeadEmployeeID])
REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[Routes] CHECK CONSTRAINT [FK_Routes_CrewLead]
GO
ALTER TABLE [dbo].[Routes]  WITH CHECK ADD  CONSTRAINT [FK_Routes_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[Routes] CHECK CONSTRAINT [FK_Routes_Organization]
GO
ALTER TABLE [dbo].[Routes]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_Routes_CrewLead] FOREIGN KEY([OrganizationID], [CrewLeadEmployeeID])
REFERENCES [dbo].[Employees] ([OrganizationID], [EmployeeID])
GO
ALTER TABLE [dbo].[Routes] CHECK CONSTRAINT [FK_Tenant_FK_Routes_CrewLead]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [FK_ScopeTemplateComponents_Materials] FOREIGN KEY([MaterialID])
REFERENCES [dbo].[Materials] ([MaterialID])
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [FK_ScopeTemplateComponents_Materials]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [FK_ScopeTemplateComponents_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [FK_ScopeTemplateComponents_Organization]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [FK_ScopeTemplateComponents_ScopeTemplates] FOREIGN KEY([ScopeTemplateID])
REFERENCES [dbo].[ScopeTemplates] ([ScopeTemplateID])
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [FK_ScopeTemplateComponents_ScopeTemplates]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ScopeTemplateComponents_Materials] FOREIGN KEY([OrganizationID], [MaterialID])
REFERENCES [dbo].[Materials] ([OrganizationID], [MaterialID])
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [FK_Tenant_FK_ScopeTemplateComponents_Materials]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ScopeTemplateComponents_ScopeTemplates] FOREIGN KEY([OrganizationID], [ScopeTemplateID])
REFERENCES [dbo].[ScopeTemplates] ([OrganizationID], [ScopeTemplateID])
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [FK_Tenant_FK_ScopeTemplateComponents_ScopeTemplates]
GO
ALTER TABLE [dbo].[ScopeTemplates]  WITH CHECK ADD  CONSTRAINT [FK_ScopeTemplates_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ScopeTemplates] CHECK CONSTRAINT [FK_ScopeTemplates_Organization]
GO
ALTER TABLE [dbo].[ServiceVisits]  WITH CHECK ADD  CONSTRAINT [FK_ServiceVisits_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[ServiceVisits] CHECK CONSTRAINT [FK_ServiceVisits_Organization]
GO
ALTER TABLE [dbo].[ServiceVisits]  WITH CHECK ADD  CONSTRAINT [FK_ServiceVisits_Projects] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[ServiceVisits] CHECK CONSTRAINT [FK_ServiceVisits_Projects]
GO
ALTER TABLE [dbo].[ServiceVisits]  WITH CHECK ADD  CONSTRAINT [FK_Tenant_FK_ServiceVisits_Projects] FOREIGN KEY([OrganizationID], [ProjectID])
REFERENCES [dbo].[Projects] ([OrganizationID], [ProjectID])
GO
ALTER TABLE [dbo].[ServiceVisits] CHECK CONSTRAINT [FK_Tenant_FK_ServiceVisits_Projects]
GO
ALTER TABLE [dbo].[UnitsOfMeasurement]  WITH CHECK ADD  CONSTRAINT [FK_UnitsOfMeasurement_Organization] FOREIGN KEY([OrganizationID])
REFERENCES [dbo].[Organizations] ([OrganizationID])
GO
ALTER TABLE [dbo].[UnitsOfMeasurement] CHECK CONSTRAINT [FK_UnitsOfMeasurement_Organization]
GO
ALTER TABLE [dbo].[UserIdentities]  WITH CHECK ADD FOREIGN KEY([UserID])
REFERENCES [dbo].[Users] ([UserID])
GO
ALTER TABLE [dbo].[Bills]  WITH CHECK ADD  CONSTRAINT [CK_Bills_SplitOwnership] CHECK  (([IsSplit]=(0) OR [ProjectID] IS NULL))
GO
ALTER TABLE [dbo].[Bills] CHECK CONSTRAINT [CK_Bills_SplitOwnership]
GO
ALTER TABLE [dbo].[ContractChangeDeductions]  WITH CHECK ADD CHECK  (([LandedAmount]>=(0)))
GO
ALTER TABLE [dbo].[ContractChangeDeductions]  WITH CHECK ADD CHECK  (([Quantity]>(0)))
GO
ALTER TABLE [dbo].[ContractChangeDeductions]  WITH CHECK ADD CHECK  (([SellAmount]>=(0)))
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD CHECK  (([Status]='Rejected' OR [Status]='Approved' OR [Status]='Proposed' OR [Status]='Draft'))
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD CHECK  (([Kind]='ChangeOrder' OR [Kind]='Alternate'))
GO
ALTER TABLE [dbo].[ContractChanges]  WITH CHECK ADD CHECK  (([Status]<>'Approved' OR [ProjectID] IS NOT NULL AND [ApprovedAt] IS NOT NULL AND [ApprovalReference] IS NOT NULL AND [ApprovedByUserID] IS NOT NULL))
GO
ALTER TABLE [dbo].[Customers]  WITH CHECK ADD  CONSTRAINT [CK_Customers_ContactName] CHECK  ((len(ltrim(rtrim([FirstName])))>(0)))
GO
ALTER TABLE [dbo].[Customers] CHECK CONSTRAINT [CK_Customers_ContactName]
GO
ALTER TABLE [dbo].[Employees]  WITH CHECK ADD  CONSTRAINT [CK_Employees_ManagerNotSelf] CHECK  (([ManagerID] IS NULL OR [ManagerID]<>[EmployeeID]))
GO
ALTER TABLE [dbo].[Employees] CHECK CONSTRAINT [CK_Employees_ManagerNotSelf]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD CHECK  (([LineOperation]='Deduct' OR [LineOperation]='Add'))
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [CK_EstimateLineItems_Freight] CHECK  (([FreightAmount]>=(0)))
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [CK_EstimateLineItems_Freight]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [CK_EstimateLineItems_LineType] CHECK  (([LineType]='Equipment' OR [LineType]='Labor' OR [LineType]='Material'))
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [CK_EstimateLineItems_LineType]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [CK_EstimateLineItems_Markup] CHECK  (([LineMarkupPercent]>=(0)))
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [CK_EstimateLineItems_Markup]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [CK_EstimateLineItems_Quantity] CHECK  (([Quantity]>(0)))
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [CK_EstimateLineItems_Quantity]
GO
ALTER TABLE [dbo].[EstimateLineItems]  WITH CHECK ADD  CONSTRAINT [CK_EstimateLineItems_UnitCost] CHECK  (([UnitCost]>=(0)))
GO
ALTER TABLE [dbo].[EstimateLineItems] CHECK CONSTRAINT [CK_EstimateLineItems_UnitCost]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [CK_EstimateRevisions_GroupingMode] CHECK  (([GroupingMode]='Type' OR [GroupingMode]='Scope' OR [GroupingMode]='None'))
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [CK_EstimateRevisions_GroupingMode]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [CK_EstimateRevisions_MarkupMode] CHECK  (([MarkupMode]='estimate' OR [MarkupMode]='perLine'))
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [CK_EstimateRevisions_MarkupMode]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [CK_EstimateRevisions_Rounding] CHECK  (([RoundingIncrement]=(100) OR [RoundingIncrement]=(10) OR [RoundingIncrement]=(1) OR [RoundingIncrement]=(0)))
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [CK_EstimateRevisions_Rounding]
GO
ALTER TABLE [dbo].[EstimateRevisions]  WITH CHECK ADD  CONSTRAINT [CK_EstimateRevisions_TaxPercent] CHECK  (([TaxPercent]>=(0) AND [TaxPercent]<=(100)))
GO
ALTER TABLE [dbo].[EstimateRevisions] CHECK CONSTRAINT [CK_EstimateRevisions_TaxPercent]
GO
ALTER TABLE [dbo].[Estimates]  WITH CHECK ADD CHECK  (([DocumentKind]='ChangeOrder' OR [DocumentKind]='Alternate' OR [DocumentKind]='Base'))
GO
ALTER TABLE [dbo].[Estimates]  WITH CHECK ADD  CONSTRAINT [CK_Estimates_EngagementType] CHECK  (([EngagementType]='Service' OR [EngagementType]='Project'))
GO
ALTER TABLE [dbo].[Estimates] CHECK CONSTRAINT [CK_Estimates_EngagementType]
GO
ALTER TABLE [dbo].[Estimates]  WITH CHECK ADD  CONSTRAINT [CK_Estimates_RecurrenceFrequency] CHECK  (([RecurrenceFrequency] IS NULL OR ([RecurrenceFrequency]='Annually' OR [RecurrenceFrequency]='SemiAnnually' OR [RecurrenceFrequency]='Quarterly' OR [RecurrenceFrequency]='Monthly' OR [RecurrenceFrequency]='Biweekly' OR [RecurrenceFrequency]='Weekly')))
GO
ALTER TABLE [dbo].[Estimates] CHECK CONSTRAINT [CK_Estimates_RecurrenceFrequency]
GO
ALTER TABLE [dbo].[Estimates]  WITH NOCHECK ADD  CONSTRAINT [CK_Estimates_RecurringDates] CHECK  (([EngagementType]<>'Service' OR [ExpectedStartDate] IS NOT NULL AND [ExpectedEndDate] IS NOT NULL AND [RecurrenceFrequency] IS NOT NULL AND [ExpectedEndDate]>=[ExpectedStartDate]))
GO
ALTER TABLE [dbo].[Estimates] CHECK CONSTRAINT [CK_Estimates_RecurringDates]
GO
ALTER TABLE [dbo].[Estimates]  WITH CHECK ADD  CONSTRAINT [CK_Estimates_Status] CHECK  (([EstimateStatus]='Lost' OR [EstimateStatus]='Won' OR [EstimateStatus]='Draft'))
GO
ALTER TABLE [dbo].[Estimates] CHECK CONSTRAINT [CK_Estimates_Status]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [CK_FieldOperationsTaskAssignments_CustomHours] CHECK  (([CustomHours] IS NULL OR [CustomHours]>=(0) AND [CustomHours]<=(24)))
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [CK_FieldOperationsTaskAssignments_CustomHours]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [CK_FieldOperationsTaskAssignments_HoursMode] CHECK  (([HoursMode] IS NULL OR ([HoursMode]='Custom' OR [HoursMode]='Split' OR [HoursMode]='FullJob' OR [HoursMode]='HalfDay' OR [HoursMode]='FullDay')))
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [CK_FieldOperationsTaskAssignments_HoursMode]
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments]  WITH CHECK ADD  CONSTRAINT [CK_FieldOperationsTaskAssignments_OneResource] CHECK  (((case when [EmployeeID] IS NOT NULL then (1) else (0) end+case when [EquipmentID] IS NOT NULL then (1) else (0) end)=(1)))
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] CHECK CONSTRAINT [CK_FieldOperationsTaskAssignments_OneResource]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [CK_FieldOperationsTasks_PlannedLaborHours] CHECK  (([PlannedLaborHours]>=(0)))
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [CK_FieldOperationsTasks_PlannedLaborHours]
GO
ALTER TABLE [dbo].[FieldOperationsTasks]  WITH CHECK ADD  CONSTRAINT [CK_FieldOperationsTasks_TaskName] CHECK  ((len(ltrim(rtrim([TaskName])))>(0)))
GO
ALTER TABLE [dbo].[FieldOperationsTasks] CHECK CONSTRAINT [CK_FieldOperationsTasks_TaskName]
GO
ALTER TABLE [dbo].[MaterialPrices]  WITH CHECK ADD  CONSTRAINT [CK_MaterialPrices_UnitCost] CHECK  (([UnitCost]>=(0)))
GO
ALTER TABLE [dbo].[MaterialPrices] CHECK CONSTRAINT [CK_MaterialPrices_UnitCost]
GO
ALTER TABLE [dbo].[OrganizationInvoiceSettings]  WITH CHECK ADD CHECK  (([TemplateStyle]='minimal' OR [TemplateStyle]='compact' OR [TemplateStyle]='classic' OR [TemplateStyle]='modern'))
GO
ALTER TABLE [dbo].[Organizations]  WITH CHECK ADD CHECK  ((len(ltrim(rtrim([OrganizationName])))>(0)))
GO
ALTER TABLE [dbo].[Organizations]  WITH CHECK ADD CHECK  (([Status]='Archived' OR [Status]='Suspended' OR [Status]='Active' OR [Status]='Trial'))
GO
ALTER TABLE [dbo].[OrganizationSubscriptions]  WITH CHECK ADD CHECK  (([SeatLimit]>(0)))
GO
ALTER TABLE [dbo].[OrganizationSubscriptions]  WITH CHECK ADD CHECK  (([Status]='Canceled' OR [Status]='PastDue' OR [Status]='Active' OR [Status]='Trial'))
GO
ALTER TABLE [dbo].[OrganizationSubscriptions]  WITH CHECK ADD CHECK  (([BillingProvider] IS NULL AND [ProviderSubscriptionID] IS NULL OR [BillingProvider] IS NOT NULL AND [ProviderSubscriptionID] IS NOT NULL))
GO
ALTER TABLE [dbo].[ProjectAttachments]  WITH CHECK ADD CHECK  (([Category]='media' OR [Category]='document'))
GO
ALTER TABLE [dbo].[ProjectAttachments]  WITH CHECK ADD CHECK  (([SizeBytes]>(0)))
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [CK_ProjectBillCosts_Amount] CHECK  (([Amount]=((round(CONVERT([decimal](15,4),[Quantity])*CONVERT([decimal](15,4),[UnitCost]),(2))+[FreightAmount])+[TaxAmount])))
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [CK_ProjectBillCosts_Amount]
GO
ALTER TABLE [dbo].[ProjectBillCosts]  WITH CHECK ADD  CONSTRAINT [CK_ProjectBillCosts_Values] CHECK  (([Quantity]>(0) AND [UnitCost]>=(0) AND [FreightAmount]>=(0) AND [TaxAmount]>=(0) AND [Amount]>(0) AND len(ltrim(rtrim([Description])))>(0) AND len(ltrim(rtrim([UnitName])))>(0)))
GO
ALTER TABLE [dbo].[ProjectBillCosts] CHECK CONSTRAINT [CK_ProjectBillCosts_Values]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones]  WITH CHECK ADD  CONSTRAINT [CK_ProjectBillingMilestones_Percent] CHECK  (([TargetPercent] IS NULL OR [TargetPercent]>=(0) AND [TargetPercent]<=(100)))
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] CHECK CONSTRAINT [CK_ProjectBillingMilestones_Percent]
GO
ALTER TABLE [dbo].[ProjectBillingMilestones]  WITH CHECK ADD  CONSTRAINT [CK_ProjectBillingMilestones_Status] CHECK  (([Status]='Billed' OR [Status]='Pending'))
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] CHECK CONSTRAINT [CK_ProjectBillingMilestones_Status]
GO
ALTER TABLE [dbo].[ProjectBillingScopes]  WITH CHECK ADD CHECK  (([CompletionStatus]='Complete' OR [CompletionStatus]='In Progress' OR [CompletionStatus]='Upcoming'))
GO
ALTER TABLE [dbo].[ProjectBillingScopes]  WITH CHECK ADD CHECK  (([ContractValue]>=(0)))
GO
ALTER TABLE [dbo].[ProjectBillingSettings]  WITH CHECK ADD CHECK  (([BillingMethod]='Scopes' OR [BillingMethod]='Percentage' OR [BillingMethod]='Amount'))
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD CHECK  (([CompletionStatus]='Complete' OR [CompletionStatus]='In Progress' OR [CompletionStatus]='Upcoming'))
GO
ALTER TABLE [dbo].[ProjectBillingUnits]  WITH CHECK ADD CHECK  (([ContractValue]>=(0)))
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD CHECK  (([Amount]>(0)))
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations]  WITH CHECK ADD  CONSTRAINT [CK_InvoiceAllocations_Completion] CHECK  (([CompletionStatusAtIssue]='Complete' OR [CompletionStatusAtIssue]='In Progress' OR [CompletionStatusAtIssue]='Upcoming'))
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] CHECK CONSTRAINT [CK_InvoiceAllocations_Completion]
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices]  WITH CHECK ADD CHECK  (([BillingMethod]='Scopes' OR [BillingMethod]='Percentage' OR [BillingMethod]='Amount'))
GO
ALTER TABLE [dbo].[ProjectLineItemProgress]  WITH CHECK ADD  CONSTRAINT [CK_ProjectLineItemProgress_Percent] CHECK  (([PercentComplete] IS NULL OR [PercentComplete]>=(0) AND [PercentComplete]<=(100)))
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] CHECK CONSTRAINT [CK_ProjectLineItemProgress_Percent]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress]  WITH CHECK ADD  CONSTRAINT [CK_ProjectLineItemProgress_Quantity] CHECK  (([QuantityCompleted] IS NULL OR [QuantityCompleted]>=(0)))
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] CHECK CONSTRAINT [CK_ProjectLineItemProgress_Quantity]
GO
ALTER TABLE [dbo].[ProjectLineItemProgress]  WITH CHECK ADD  CONSTRAINT [CK_ProjectLineItemProgress_Status] CHECK  (([Status]='Complete' OR [Status]='InProgress' OR [Status]='NotStarted'))
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] CHECK CONSTRAINT [CK_ProjectLineItemProgress_Status]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [CK_ProjectResourceAssignments_Dates] CHECK  (([RemovedDate] IS NULL OR [RemovedDate]>=[AssignedDate]))
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [CK_ProjectResourceAssignments_Dates]
GO
ALTER TABLE [dbo].[ProjectResourceAssignments]  WITH CHECK ADD  CONSTRAINT [CK_ProjectResourceAssignments_OneResource] CHECK  (((case when [EmployeeID] IS NOT NULL then (1) else (0) end+case when [EquipmentID] IS NOT NULL then (1) else (0) end)=(1)))
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] CHECK CONSTRAINT [CK_ProjectResourceAssignments_OneResource]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [CK_Projects_EngagementType] CHECK  (([EngagementType]='Service' OR [EngagementType]='Project'))
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [CK_Projects_EngagementType]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [CK_Projects_ProjectStatus] CHECK  (([ProjectStatus]='Complete' OR [ProjectStatus]='Active' OR [ProjectStatus]='Upcoming'))
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [CK_Projects_ProjectStatus]
GO
ALTER TABLE [dbo].[Projects]  WITH CHECK ADD  CONSTRAINT [CK_Projects_RecurrenceFrequency] CHECK  (([RecurrenceFrequency] IS NULL OR ([RecurrenceFrequency]='Annually' OR [RecurrenceFrequency]='SemiAnnually' OR [RecurrenceFrequency]='Quarterly' OR [RecurrenceFrequency]='Monthly' OR [RecurrenceFrequency]='Biweekly' OR [RecurrenceFrequency]='Weekly')))
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [CK_Projects_RecurrenceFrequency]
GO
ALTER TABLE [dbo].[Projects]  WITH NOCHECK ADD  CONSTRAINT [CK_Projects_RecurringDates] CHECK  (([EngagementType]<>'Service' OR [ExpectedStartDate] IS NOT NULL AND [ExpectedEndDate] IS NOT NULL AND [RecurrenceFrequency] IS NOT NULL AND [ExpectedEndDate]>=[ExpectedStartDate]))
GO
ALTER TABLE [dbo].[Projects] CHECK CONSTRAINT [CK_Projects_RecurringDates]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [CK_ScopeTemplateComponents_LineType] CHECK  (([LineType]='Equipment' OR [LineType]='Labor' OR [LineType]='Material'))
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [CK_ScopeTemplateComponents_LineType]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [CK_ScopeTemplateComponents_QuantityPerUnit] CHECK  (([QuantityPerUnit]>=(0)))
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [CK_ScopeTemplateComponents_QuantityPerUnit]
GO
ALTER TABLE [dbo].[ScopeTemplateComponents]  WITH CHECK ADD  CONSTRAINT [CK_ScopeTemplateComponents_UnitCost] CHECK  (([UnitCost]>=(0)))
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] CHECK CONSTRAINT [CK_ScopeTemplateComponents_UnitCost]
GO
ALTER TABLE [dbo].[ServiceVisits]  WITH CHECK ADD  CONSTRAINT [CK_ServiceVisits_Status] CHECK  (([Status]='Skipped' OR [Status]='Completed' OR [Status]='Scheduled'))
GO
ALTER TABLE [dbo].[ServiceVisits] CHECK CONSTRAINT [CK_ServiceVisits_Status]
GO
ALTER TABLE [dbo].[UserIdentities]  WITH CHECK ADD CHECK  ((len(ltrim(rtrim([Issuer])))>(0) AND len(ltrim(rtrim([Subject])))>(0)))
GO
ALTER TABLE [dbo].[Users]  WITH CHECK ADD CHECK  ((len(ltrim(rtrim([Email])))>(0)))
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Bills_CompletedProjectReadOnly] ON [dbo].[Bills] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID OR p.ProjectID IN (SELECT bc.ProjectID FROM dbo.ProjectBillCosts bc WHERE bc.BillID = c.id AND bc.IsActive = 1) WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID OR p.ProjectID IN (SELECT bc.ProjectID FROM dbo.ProjectBillCosts bc WHERE bc.BillID = c.id AND bc.IsActive = 1) WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[Bills] ENABLE TRIGGER [TR_Bills_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Bills_OrganizationImmutable] ON [dbo].[Bills] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Bills] ENABLE TRIGGER [TR_Bills_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- Protect allocations even when finance/import workflows update a bill directly.
CREATE   TRIGGER [dbo].[TR_Bills_ProtectCostAllocations]
ON [dbo].[Bills] AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted b JOIN dbo.ProjectBillCosts c ON c.BillID = b.id AND c.IsActive = 1
        WHERE b.IsSplit = 0 AND (b.ProjectID IS NULL OR b.ProjectID <> c.ProjectID)
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
ALTER TABLE [dbo].[Bills] ENABLE TRIGGER [TR_Bills_ProtectCostAllocations]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ContractChangeDeductions_Locked] ON [dbo].[ContractChangeDeductions] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT ChangeID FROM inserted UNION SELECT ChangeID FROM deleted) x
   JOIN dbo.ContractChanges c ON c.ChangeID=x.ChangeID WHERE c.Status='Approved')
   THROW 51042,'Approved deduction history is immutable.',1;
END;

GO
ALTER TABLE [dbo].[ContractChangeDeductions] ENABLE TRIGGER [TR_ContractChangeDeductions_Locked]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ContractChanges_Approved] ON [dbo].[ContractChanges] AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted WHERE Status='Approved')
   THROW 51042,'Approved contract changes are immutable; issue a new change order.',1;
END;

GO
ALTER TABLE [dbo].[ContractChanges] ENABLE TRIGGER [TR_ContractChanges_Approved]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Customers_OrganizationImmutable] ON [dbo].[Customers] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Customers] ENABLE TRIGGER [TR_Customers_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EmployeeHistory_OrganizationImmutable] ON [dbo].[EmployeeHistory] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[EmployeeHistory] ENABLE TRIGGER [TR_EmployeeHistory_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Employees_OrganizationImmutable] ON [dbo].[Employees] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Employees] ENABLE TRIGGER [TR_Employees_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Equipment_OrganizationImmutable] ON [dbo].[Equipment] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Equipment] ENABLE TRIGGER [TR_Equipment_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ChangeLine_Locked] ON [dbo].[EstimateLineItems] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT EstimateRevisionID FROM inserted UNION SELECT EstimateRevisionID FROM deleted) x
   JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=x.EstimateRevisionID
   JOIN dbo.ContractChanges c ON c.DocumentEstimateID=r.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change lines are immutable.',1;
END;

GO
ALTER TABLE [dbo].[EstimateLineItems] ENABLE TRIGGER [TR_ChangeLine_Locked]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EstimateLineItems_CompletedProjectReadOnly] ON [dbo].[EstimateLineItems] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID = c.EstimateRevisionID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID = c.EstimateRevisionID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[EstimateLineItems] ENABLE TRIGGER [TR_EstimateLineItems_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EstimateLineItems_OrganizationImmutable] ON [dbo].[EstimateLineItems] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[EstimateLineItems] ENABLE TRIGGER [TR_EstimateLineItems_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ChangeRevision_Locked] ON [dbo].[EstimateRevisions] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT EstimateID FROM inserted UNION SELECT EstimateID FROM deleted) x
   JOIN dbo.ContractChanges c ON c.DocumentEstimateID=x.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change pricing is immutable.',1;
END;

GO
ALTER TABLE [dbo].[EstimateRevisions] ENABLE TRIGGER [TR_ChangeRevision_Locked]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EstimateRevisions_CompletedProjectReadOnly] ON [dbo].[EstimateRevisions] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID = c.EstimateRevisionID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID = c.EstimateRevisionID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[EstimateRevisions] ENABLE TRIGGER [TR_EstimateRevisions_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EstimateRevisions_OrganizationImmutable] ON [dbo].[EstimateRevisions] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[EstimateRevisions] ENABLE TRIGGER [TR_EstimateRevisions_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ChangeEstimate_Locked] ON [dbo].[Estimates] AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d JOIN dbo.ContractChanges c ON c.DocumentEstimateID=d.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change documents are immutable.',1;
END;

GO
ALTER TABLE [dbo].[Estimates] ENABLE TRIGGER [TR_ChangeEstimate_Locked]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Estimates_CompletedProjectReadOnly] ON [dbo].[Estimates] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID IN (SELECT r.EstimateRevisionID FROM dbo.EstimateRevisions r WHERE r.EstimateID = c.EstimateID) WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID IN (SELECT r.EstimateRevisionID FROM dbo.EstimateRevisions r WHERE r.EstimateID = c.EstimateID) WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[Estimates] ENABLE TRIGGER [TR_Estimates_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Estimates_OrganizationImmutable] ON [dbo].[Estimates] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Estimates] ENABLE TRIGGER [TR_Estimates_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ChangeScope_Locked] ON [dbo].[EstimateScopesOfWork] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT EstimateRevisionID FROM inserted UNION SELECT EstimateRevisionID FROM deleted) x
   JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=x.EstimateRevisionID
   JOIN dbo.ContractChanges c ON c.DocumentEstimateID=r.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change scopes are immutable.',1;
END;

GO
ALTER TABLE [dbo].[EstimateScopesOfWork] ENABLE TRIGGER [TR_ChangeScope_Locked]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EstimateScopesOfWork_CompletedProjectReadOnly] ON [dbo].[EstimateScopesOfWork] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID = c.EstimateRevisionID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID = c.EstimateRevisionID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] ENABLE TRIGGER [TR_EstimateScopesOfWork_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_EstimateScopesOfWork_OrganizationImmutable] ON [dbo].[EstimateScopesOfWork] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[EstimateScopesOfWork] ENABLE TRIGGER [TR_EstimateScopesOfWork_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_FieldOperationsTaskAssignments_CompletedProjectReadOnly] ON [dbo].[FieldOperationsTaskAssignments] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.FieldOperationsTasks t JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID WHERE t.FieldOperationsTaskID = c.FieldOperationsTaskID) WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.FieldOperationsTasks t JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID WHERE t.FieldOperationsTaskID = c.FieldOperationsTaskID) WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.FieldOperationsTasks t JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID WHERE t.FieldOperationsTaskID = c.FieldOperationsTaskID) WHERE p.ProjectStatus <> 'Active')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.FieldOperationsTasks t JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID WHERE t.FieldOperationsTaskID = c.FieldOperationsTaskID) WHERE p.ProjectStatus <> 'Active')
                    THROW 51032, 'Only Active jobs can be assigned or changed in the weekly planner. Set this job to Active in Project Management first.', 1;
            END
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] ENABLE TRIGGER [TR_FieldOperationsTaskAssignments_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_FieldOperationsTaskAssignments_OrganizationImmutable] ON [dbo].[FieldOperationsTaskAssignments] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[FieldOperationsTaskAssignments] ENABLE TRIGGER [TR_FieldOperationsTaskAssignments_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_FieldOperationsTasks_CompletedProjectReadOnly] ON [dbo].[FieldOperationsTasks] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.ServiceVisits v WHERE v.ServiceVisitID = c.ServiceVisitID) WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.ServiceVisits v WHERE v.ServiceVisitID = c.ServiceVisitID) WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.ServiceVisits v WHERE v.ServiceVisitID = c.ServiceVisitID) WHERE p.ProjectStatus <> 'Active')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID IN (SELECT v.ProjectID FROM dbo.ServiceVisits v WHERE v.ServiceVisitID = c.ServiceVisitID) WHERE p.ProjectStatus <> 'Active')
                    THROW 51032, 'Only Active jobs can be assigned or changed in the weekly planner. Set this job to Active in Project Management first.', 1;
            END
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ENABLE TRIGGER [TR_FieldOperationsTasks_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_FieldOperationsTasks_OrganizationImmutable] ON [dbo].[FieldOperationsTasks] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[FieldOperationsTasks] ENABLE TRIGGER [TR_FieldOperationsTasks_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- Only the new managed billing workflow can invoice a completed project.
-- Legacy invoices retain the previous completed-project restrictions.
CREATE   TRIGGER [dbo].[TR_Invoices_CompletedProjectReadOnly] ON [dbo].[Invoices] AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID=c.ProjectID
               WHERE p.ProjectStatus='Complete' AND c.IsProjectBilling=0 AND NOT EXISTS (SELECT 1 FROM dbo.ProjectIssuedInvoices h WHERE h.InvoiceID=c.id))
       OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID=c.ProjectID
               WHERE p.ProjectStatus='Complete' AND NOT EXISTS (SELECT 1 FROM dbo.ProjectIssuedInvoices h WHERE h.InvoiceID=c.id))
        THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
    IF EXISTS (
        SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.id=d.id
        WHERE EXISTS (SELECT 1 FROM dbo.ProjectIssuedInvoices h WHERE h.InvoiceID=d.id) AND (
          i.id IS NULL OR EXISTS (
            SELECT d.ProjectID,d.CustomerID,d.[Invoice No],d.[Invoice Date],d.[Invoice Due Date],
              TRY_CONVERT(decimal(19,2),REPLACE(REPLACE(RTRIM(d.[Invoice Amount]),'$',''),',','')),d.IsProjectBilling
            EXCEPT SELECT i.ProjectID,i.CustomerID,i.[Invoice No],i.[Invoice Date],i.[Invoice Due Date],
              TRY_CONVERT(decimal(19,2),REPLACE(REPLACE(RTRIM(i.[Invoice Amount]),'$',''),',','')),i.IsProjectBilling
          ))
    ) THROW 51041, 'Issued project invoice amounts, ownership, numbers and dates are locked. Contact details and paid date may be updated.', 1;
    IF EXISTS (SELECT 1 FROM deleted d JOIN inserted i ON i.id=d.id WHERE d.IsProjectBilling<>i.IsProjectBilling)
        THROW 51041, 'Invoice billing origin cannot be changed.', 1;
END;

GO
ALTER TABLE [dbo].[Invoices] ENABLE TRIGGER [TR_Invoices_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Invoices_OrganizationImmutable] ON [dbo].[Invoices] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Invoices] ENABLE TRIGGER [TR_Invoices_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_MaterialPrices_OrganizationImmutable] ON [dbo].[MaterialPrices] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[MaterialPrices] ENABLE TRIGGER [TR_MaterialPrices_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Materials_OrganizationImmutable] ON [dbo].[Materials] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Materials] ENABLE TRIGGER [TR_Materials_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectActualCosts_CompletedProjectReadOnly] ON [dbo].[ProjectActualCosts] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[ProjectActualCosts] ENABLE TRIGGER [TR_ProjectActualCosts_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectActualCosts_OrganizationImmutable] ON [dbo].[ProjectActualCosts] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectActualCosts] ENABLE TRIGGER [TR_ProjectActualCosts_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillCosts_CompletedProjectReadOnly] ON [dbo].[ProjectBillCosts] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[ProjectBillCosts] ENABLE TRIGGER [TR_ProjectBillCosts_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillCosts_OrganizationImmutable] ON [dbo].[ProjectBillCosts] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectBillCosts] ENABLE TRIGGER [TR_ProjectBillCosts_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillingMilestones_CompletedProjectReadOnly] ON [dbo].[ProjectBillingMilestones] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] ENABLE TRIGGER [TR_ProjectBillingMilestones_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillingMilestones_OrganizationImmutable] ON [dbo].[ProjectBillingMilestones] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectBillingMilestones] ENABLE TRIGGER [TR_ProjectBillingMilestones_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillingScopes_OrganizationImmutable] ON [dbo].[ProjectBillingScopes] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectBillingScopes] ENABLE TRIGGER [TR_ProjectBillingScopes_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO
-- =============================================================================
-- Migration: Sample Data Safe Teardown Triggers Update
-- Purpose: Allow surgical deletion of sample records tracked in SampleDataRecords
--          while keeping non-sample production records completely immutable.
-- =============================================================================

CREATE   TRIGGER [dbo].[TR_ProjectBillingScopes_Snapshot] ON [dbo].[ProjectBillingScopes] AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT BillingScopeID,BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue FROM deleted d
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SampleDataRecords s
            WHERE s.TableName = 'ProjectBillingScopes' AND s.RecordKey = CAST(d.BillingScopeID AS nvarchar(100))
        )
        EXCEPT SELECT BillingScopeID,BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue FROM inserted
    )
        THROW 51041, 'Contract scope snapshots cannot be changed or deleted.', 1;
END;

GO
ALTER TABLE [dbo].[ProjectBillingScopes] ENABLE TRIGGER [TR_ProjectBillingScopes_Snapshot]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO

CREATE   TRIGGER [dbo].[TR_ProjectBillingSettings_Immutable] ON [dbo].[ProjectBillingSettings] AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SampleDataRecords s
            WHERE s.TableName = 'ProjectBillingSettings' AND s.RecordKey = CAST(d.ProjectID AS nvarchar(100))
        )
    )
        THROW 51041, 'The billing method is locked after the first issued invoice.', 1;
END;

GO
ALTER TABLE [dbo].[ProjectBillingSettings] ENABLE TRIGGER [TR_ProjectBillingSettings_Immutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillingSettings_OrganizationImmutable] ON [dbo].[ProjectBillingSettings] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectBillingSettings] ENABLE TRIGGER [TR_ProjectBillingSettings_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectBillingUnits_OrganizationImmutable] ON [dbo].[ProjectBillingUnits] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectBillingUnits] ENABLE TRIGGER [TR_ProjectBillingUnits_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO

CREATE   TRIGGER [dbo].[TR_ProjectBillingUnits_Snapshot] ON [dbo].[ProjectBillingUnits] AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT BillingUnitID,ProjectID,ServiceVisitID,SourceRevisionID,ContractValue FROM deleted d
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SampleDataRecords s
            WHERE s.TableName = 'ProjectBillingUnits' AND s.RecordKey = CAST(d.BillingUnitID AS nvarchar(100))
        )
        EXCEPT SELECT BillingUnitID,ProjectID,ServiceVisitID,SourceRevisionID,ContractValue FROM inserted
    )
        THROW 51041, 'Contract occurrence snapshots cannot be changed or deleted.', 1;
END;

GO
ALTER TABLE [dbo].[ProjectBillingUnits] ENABLE TRIGGER [TR_ProjectBillingUnits_Snapshot]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TRIGGER [dbo].[TR_BillingAllocations_Validate] ON [dbo].[ProjectInvoiceAllocations] AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SampleDataRecords s
            WHERE s.TableName = 'ProjectInvoiceAllocations' AND s.RecordKey = CAST(d.InvoiceID AS nvarchar(100))
        )
    )
        THROW 51041, 'Issued invoice allocations cannot be edited or deleted.', 1;
    IF EXISTS (
        SELECT 1 FROM inserted a JOIN dbo.ProjectIssuedInvoices h ON h.InvoiceID=a.InvoiceID
        JOIN dbo.Invoices i ON i.id=h.InvoiceID
        JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID
        WHERE h.IsReconciled=0 AND (
          a.CompletionStatusAtIssue IS NULL OR a.CompletionStatusAtIssue<>s.CompletionStatus
          OR (s.CompletionStatus<>'Complete' AND (h.IncludesIncompleteWork=0
            OR NULLIF(LTRIM(RTRIM(h.OverrideReason)),'') IS NULL OR h.OverrideReason<>i.InternalNotes OR i.InternalNotes IS NULL))
        )
    ) THROW 51041, 'Incomplete work requires advance billing approval and a reason in internal invoice notes; completion must be recorded at issuance.', 1;
    IF EXISTS (
        SELECT 1 FROM inserted a JOIN dbo.ProjectIssuedInvoices h ON h.InvoiceID=a.InvoiceID
        JOIN dbo.Invoices i ON i.id=h.InvoiceID
        JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID
        JOIN dbo.ProjectBillingUnits u ON u.BillingUnitID=s.BillingUnitID
        JOIN dbo.ProjectBillingSettings bs ON bs.ProjectID=u.ProjectID
        WHERE h.ProjectID<>u.ProjectID OR i.ProjectID<>h.ProjectID OR bs.BillingMethod<>h.BillingMethod
    ) THROW 51041, 'Invoice allocations must belong to the invoice project and its locked billing method.', 1;
    IF EXISTS (
        SELECT 1 FROM dbo.ProjectBillingScopes s WITH (UPDLOCK,HOLDLOCK)
        WHERE s.BillingScopeID IN (SELECT BillingScopeID FROM inserted)
        AND (SELECT COALESCE(SUM(Amount),0) FROM dbo.ProjectInvoiceAllocations a WHERE a.BillingScopeID=s.BillingScopeID)>(SELECT ContractValue FROM dbo.EffectiveProjectBillingScopes WHERE BillingScopeID=s.BillingScopeID)
    ) THROW 51041, 'This scope has already been billed. The allocation exceeds its remaining balance.', 1;
    IF EXISTS (
        SELECT 1 FROM dbo.ProjectBillingUnits u WITH(UPDLOCK,HOLDLOCK)
        WHERE u.BillingUnitID IN (SELECT s.BillingUnitID FROM inserted a JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID)
          AND (SELECT COALESCE(SUM(a.Amount),0) FROM dbo.ProjectInvoiceAllocations a
               JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID WHERE s.BillingUnitID=u.BillingUnitID)>(SELECT ContractValue FROM dbo.EffectiveProjectBillingUnits WHERE BillingUnitID=u.BillingUnitID)
    ) THROW 51041, 'The job or occurrence has already been billed. Its contract balance cannot be exceeded.', 1;
    IF EXISTS (
        SELECT 1 FROM dbo.Invoices i
        WHERE i.id IN (SELECT InvoiceID FROM inserted)
        AND (TRY_CONVERT(decimal(19,2), REPLACE(REPLACE(RTRIM(i.[Invoice Amount]), '$',''), ',', '')) IS NULL OR
          (SELECT SUM(Amount) FROM dbo.ProjectInvoiceAllocations a WHERE a.InvoiceID=i.id)
            <> TRY_CONVERT(decimal(19,2), REPLACE(REPLACE(RTRIM(i.[Invoice Amount]), '$',''), ',', '')))
    ) THROW 51041, 'Invoice allocations must exactly match the Finance invoice amount.', 1;
END;

GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] ENABLE TRIGGER [TR_BillingAllocations_Validate]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectInvoiceAllocations_OrganizationImmutable] ON [dbo].[ProjectInvoiceAllocations] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectInvoiceAllocations] ENABLE TRIGGER [TR_ProjectInvoiceAllocations_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER OFF
GO

CREATE   TRIGGER [dbo].[TR_ProjectIssuedInvoices_Immutable] ON [dbo].[ProjectIssuedInvoices] AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SampleDataRecords s
            WHERE s.TableName = 'ProjectIssuedInvoices' AND s.RecordKey = CAST(d.InvoiceID AS nvarchar(100))
        )
    )
        THROW 51041, 'Issued project invoice history cannot be edited or deleted.', 1;
END;

GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ENABLE TRIGGER [TR_ProjectIssuedInvoices_Immutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectIssuedInvoices_OrganizationImmutable] ON [dbo].[ProjectIssuedInvoices] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectIssuedInvoices] ENABLE TRIGGER [TR_ProjectIssuedInvoices_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectLineItemProgress_CompletedProjectReadOnly] ON [dbo].[ProjectLineItemProgress] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID IN (SELECT li.EstimateRevisionID FROM dbo.EstimateLineItems li WHERE li.EstimateLineItemID = c.EstimateLineItemID) WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.AcceptedEstimateRevisionID IN (SELECT li.EstimateRevisionID FROM dbo.EstimateLineItems li WHERE li.EstimateLineItemID = c.EstimateLineItemID) WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] ENABLE TRIGGER [TR_ProjectLineItemProgress_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectLineItemProgress_OrganizationImmutable] ON [dbo].[ProjectLineItemProgress] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectLineItemProgress] ENABLE TRIGGER [TR_ProjectLineItemProgress_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectResourceAssignments_CompletedProjectReadOnly] ON [dbo].[ProjectResourceAssignments] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            END
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] ENABLE TRIGGER [TR_ProjectResourceAssignments_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ProjectResourceAssignments_OrganizationImmutable] ON [dbo].[ProjectResourceAssignments] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ProjectResourceAssignments] ENABLE TRIGGER [TR_ProjectResourceAssignments_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE   TRIGGER [dbo].[TR_Projects_CompletedReadOnly] ON [dbo].[Projects] AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.ProjectID = d.ProjectID
        WHERE d.ProjectStatus = 'Complete' AND (
            i.ProjectID IS NULL OR i.ProjectStatus NOT IN ('Complete', 'Active')
            OR EXISTS (SELECT [ProjectID],[ProjectName],[CreatedAt],[AcceptedEstimateRevisionID],[ProjectManagerID],[EngagementType],[RecurrenceFrequency],[RouteID],[ExpectedStartDate],[ExpectedEndDate],[InternalNotes],[CustomerNotes],[CustomerID] FROM deleted WHERE ProjectID = d.ProjectID
                       EXCEPT SELECT [ProjectID],[ProjectName],[CreatedAt],[AcceptedEstimateRevisionID],[ProjectManagerID],[EngagementType],[RecurrenceFrequency],[RouteID],[ExpectedStartDate],[ExpectedEndDate],[InternalNotes],[CustomerNotes],[CustomerID] FROM inserted WHERE ProjectID = d.ProjectID))
    )
        THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
END
GO
ALTER TABLE [dbo].[Projects] ENABLE TRIGGER [TR_Projects_CompletedReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Projects_OrganizationImmutable] ON [dbo].[Projects] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Projects] ENABLE TRIGGER [TR_Projects_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Roles_OrganizationImmutable] ON [dbo].[Roles] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Roles] ENABLE TRIGGER [TR_Roles_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_Routes_OrganizationImmutable] ON [dbo].[Routes] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[Routes] ENABLE TRIGGER [TR_Routes_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ScopeTemplateComponents_OrganizationImmutable] ON [dbo].[ScopeTemplateComponents] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ScopeTemplateComponents] ENABLE TRIGGER [TR_ScopeTemplateComponents_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ScopeTemplates_OrganizationImmutable] ON [dbo].[ScopeTemplates] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ScopeTemplates] ENABLE TRIGGER [TR_ScopeTemplates_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ServiceVisits_BillingProtection] ON [dbo].[ServiceVisits] AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
      SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.ServiceVisitID=d.ServiceVisitID
      WHERE EXISTS (
        SELECT 1 FROM dbo.ProjectBillingUnits u JOIN dbo.ProjectBillingScopes s ON s.BillingUnitID=u.BillingUnitID
        JOIN dbo.ProjectInvoiceAllocations a ON a.BillingScopeID=s.BillingScopeID WHERE u.ServiceVisitID=d.ServiceVisitID
      ) AND (i.ServiceVisitID IS NULL OR i.ProjectID<>d.ProjectID OR i.Status='Skipped')
    ) THROW 51041, 'A billed occurrence cannot be skipped, deleted or moved to a different project.', 1;
END;

GO
ALTER TABLE [dbo].[ServiceVisits] ENABLE TRIGGER [TR_ServiceVisits_BillingProtection]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ServiceVisits_CompletedProjectReadOnly] ON [dbo].[ServiceVisits] AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus = 'Complete')
                    THROW 51030, 'This job is Complete and read-only. Reopen it to Active in Project Management before making changes.', 1;
            
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus <> 'Active')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON p.ProjectID = c.ProjectID WHERE p.ProjectStatus <> 'Active')
                    THROW 51032, 'Only Active jobs can be assigned or changed in the weekly planner. Set this job to Active in Project Management first.', 1;
            END
GO
ALTER TABLE [dbo].[ServiceVisits] ENABLE TRIGGER [TR_ServiceVisits_CompletedProjectReadOnly]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_ServiceVisits_OrganizationImmutable] ON [dbo].[ServiceVisits] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[ServiceVisits] ENABLE TRIGGER [TR_ServiceVisits_OrganizationImmutable]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   TRIGGER [dbo].[TR_UnitsOfMeasurement_OrganizationImmutable] ON [dbo].[UnitsOfMeasurement] AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, 'Business record organization ownership cannot be changed.', 1;
      END;
GO
ALTER TABLE [dbo].[UnitsOfMeasurement] ENABLE TRIGGER [TR_UnitsOfMeasurement_OrganizationImmutable]
GO
EXEC sys.sp_addextendedproperty @name=N'ContosoPermissionsSeeded', @value=N'Owner bootstrap only' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'AccessRolePermissions'
GO
