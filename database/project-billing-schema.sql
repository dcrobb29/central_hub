SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.ProjectBillingUnits', N'U') IS NULL
CREATE TABLE dbo.ProjectBillingUnits (
    BillingUnitID int IDENTITY PRIMARY KEY,
    ProjectID int NOT NULL REFERENCES dbo.Projects(ProjectID),
    ServiceVisitID int NULL REFERENCES dbo.ServiceVisits(ServiceVisitID),
    SourceRevisionID int NOT NULL,
    ContractValue decimal(19,2) NOT NULL CHECK (ContractValue >= 0),
    CompletionStatus varchar(16) NOT NULL DEFAULT 'Upcoming' CHECK (CompletionStatus IN ('Upcoming', 'In Progress', 'Complete')),
    CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ProjectBillingUnits') AND name='UX_BillingUnits_Project')
CREATE UNIQUE INDEX UX_BillingUnits_Project ON dbo.ProjectBillingUnits(ProjectID) WHERE ServiceVisitID IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ProjectBillingUnits') AND name='UX_BillingUnits_Visit')
CREATE UNIQUE INDEX UX_BillingUnits_Visit ON dbo.ProjectBillingUnits(ServiceVisitID) WHERE ServiceVisitID IS NOT NULL;

IF OBJECT_ID(N'dbo.ProjectBillingScopes', N'U') IS NULL
CREATE TABLE dbo.ProjectBillingScopes (
    BillingScopeID int IDENTITY PRIMARY KEY,
    BillingUnitID int NOT NULL REFERENCES dbo.ProjectBillingUnits(BillingUnitID),
    SourceScopeID int NULL,
    ScopeName nvarchar(150) NOT NULL,
    SortOrder int NOT NULL,
    ContractValue decimal(19,2) NOT NULL CHECK (ContractValue >= 0),
    CompletionStatus varchar(16) NOT NULL DEFAULT 'Upcoming' CHECK (CompletionStatus IN ('Upcoming', 'In Progress', 'Complete')),
    UNIQUE (BillingUnitID, SortOrder)
);
IF OBJECT_ID(N'dbo.ProjectBillingSettings', N'U') IS NULL
CREATE TABLE dbo.ProjectBillingSettings (
    ProjectID int NOT NULL PRIMARY KEY REFERENCES dbo.Projects(ProjectID),
    BillingMethod varchar(16) NOT NULL CHECK (BillingMethod IN ('Amount', 'Percentage', 'Scopes'))
);
IF OBJECT_ID(N'dbo.ProjectIssuedInvoices', N'U') IS NULL
CREATE TABLE dbo.ProjectIssuedInvoices (
    InvoiceID int NOT NULL PRIMARY KEY REFERENCES dbo.Invoices(id),
    ProjectID int NOT NULL REFERENCES dbo.Projects(ProjectID),
    RequestID uniqueidentifier NOT NULL UNIQUE,
    BillingMethod varchar(16) NOT NULL CHECK (BillingMethod IN ('Amount', 'Percentage', 'Scopes')),
    ShowScopes bit NOT NULL DEFAULT 1,
    IsReconciled bit NOT NULL DEFAULT 0,
    IssuedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.ProjectInvoiceAllocations', N'U') IS NULL
CREATE TABLE dbo.ProjectInvoiceAllocations (
    InvoiceID int NOT NULL REFERENCES dbo.ProjectIssuedInvoices(InvoiceID),
    BillingScopeID int NOT NULL REFERENCES dbo.ProjectBillingScopes(BillingScopeID),
    Amount decimal(19,2) NOT NULL CHECK (Amount > 0),
    OccurrenceDate date NULL,
    PRIMARY KEY (InvoiceID, BillingScopeID)
);

IF COL_LENGTH(N'dbo.Invoices',N'InternalNotes') IS NULL
    ALTER TABLE dbo.Invoices ADD InternalNotes nvarchar(4000) NULL;
IF COL_LENGTH(N'dbo.Invoices',N'CustomerNotes') IS NULL
    ALTER TABLE dbo.Invoices ADD CustomerNotes nvarchar(4000) NULL;
IF COL_LENGTH(N'dbo.ProjectIssuedInvoices',N'IncludesIncompleteWork') IS NULL
    ALTER TABLE dbo.ProjectIssuedInvoices ADD IncludesIncompleteWork bit NOT NULL CONSTRAINT DF_IssuedInvoices_Incomplete DEFAULT 0;
IF COL_LENGTH(N'dbo.ProjectIssuedInvoices',N'OverrideReason') IS NULL
    ALTER TABLE dbo.ProjectIssuedInvoices ADD OverrideReason nvarchar(4000) NULL;
IF COL_LENGTH(N'dbo.ProjectInvoiceAllocations',N'CompletionStatusAtIssue') IS NULL
    ALTER TABLE dbo.ProjectInvoiceAllocations ADD CompletionStatusAtIssue varchar(16) NULL
        CONSTRAINT CK_InvoiceAllocations_Completion CHECK (CompletionStatusAtIssue IN ('Upcoming','In Progress','Complete'));

-- Allocate all supported Finance amounts without the old 10-character limit.
ALTER TABLE dbo.Invoices ALTER COLUMN [Invoice Amount] nvarchar(32) NULL;
IF COL_LENGTH(N'dbo.Invoices',N'IsProjectBilling') IS NULL
    ALTER TABLE dbo.Invoices ADD IsProjectBilling bit NOT NULL CONSTRAINT DF_Invoices_ProjectBilling DEFAULT 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Invoices') AND name='IX_Invoices_InvoiceNo')
    CREATE INDEX IX_Invoices_InvoiceNo ON dbo.Invoices([Invoice No]);

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON dbo.ProjectBillingUnits TO applicationLogin;
    GRANT SELECT, INSERT, UPDATE ON dbo.ProjectBillingScopes TO applicationLogin;
    GRANT SELECT, INSERT ON dbo.ProjectBillingSettings TO applicationLogin;
    GRANT SELECT, INSERT ON dbo.ProjectIssuedInvoices TO applicationLogin;
    GRANT SELECT, INSERT ON dbo.ProjectInvoiceAllocations TO applicationLogin;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_BillingAllocations_Validate ON dbo.ProjectInvoiceAllocations AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
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
        AND (SELECT COALESCE(SUM(Amount),0) FROM dbo.ProjectInvoiceAllocations a WHERE a.BillingScopeID=s.BillingScopeID)>s.ContractValue
    ) THROW 51041, 'This scope has already been billed. The allocation exceeds its remaining balance.', 1;
    IF EXISTS (
        SELECT 1 FROM dbo.ProjectBillingUnits u WITH(UPDLOCK,HOLDLOCK)
        WHERE u.BillingUnitID IN (SELECT s.BillingUnitID FROM inserted a JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID)
          AND (SELECT COALESCE(SUM(a.Amount),0) FROM dbo.ProjectInvoiceAllocations a
               JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID WHERE s.BillingUnitID=u.BillingUnitID)>u.ContractValue
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

CREATE OR ALTER TRIGGER dbo.TR_ProjectIssuedInvoices_Immutable ON dbo.ProjectIssuedInvoices AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) THROW 51041, 'Issued project invoice history cannot be edited or deleted.', 1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ProjectBillingSettings_Immutable ON dbo.ProjectBillingSettings AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) THROW 51041, 'The billing method is locked after the first issued invoice.', 1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ProjectBillingScopes_Snapshot ON dbo.ProjectBillingScopes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT BillingScopeID,BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue FROM deleted
               EXCEPT SELECT BillingScopeID,BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue FROM inserted)
        THROW 51041, 'Contract scope snapshots cannot be changed or deleted.', 1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ProjectBillingUnits_Snapshot ON dbo.ProjectBillingUnits AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT BillingUnitID,ProjectID,ServiceVisitID,SourceRevisionID,ContractValue FROM deleted
               EXCEPT SELECT BillingUnitID,ProjectID,ServiceVisitID,SourceRevisionID,ContractValue FROM inserted)
        THROW 51041, 'Contract occurrence snapshots cannot be changed or deleted.', 1;
END;
GO

-- Only the new managed billing workflow can invoice a completed project.
-- Legacy invoices retain the previous completed-project restrictions.
CREATE OR ALTER TRIGGER dbo.TR_Invoices_CompletedProjectReadOnly ON dbo.Invoices AFTER INSERT, UPDATE, DELETE AS
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
CREATE OR ALTER TRIGGER dbo.TR_ServiceVisits_BillingProtection ON dbo.ServiceVisits AFTER UPDATE, DELETE AS
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
COMMIT TRANSACTION;
