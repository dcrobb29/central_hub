-- =============================================================================
-- Migration: Sample Data Safe Teardown Triggers Update
-- Purpose: Allow surgical deletion of sample records tracked in SampleDataRecords
--          while keeping non-sample production records completely immutable.
-- =============================================================================

CREATE OR ALTER TRIGGER dbo.TR_ProjectBillingScopes_Snapshot ON dbo.ProjectBillingScopes AFTER UPDATE, DELETE AS
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

CREATE OR ALTER TRIGGER dbo.TR_ProjectBillingUnits_Snapshot ON dbo.ProjectBillingUnits AFTER UPDATE, DELETE AS
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

CREATE OR ALTER TRIGGER dbo.TR_ProjectBillingSettings_Immutable ON dbo.ProjectBillingSettings AFTER UPDATE, DELETE AS
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

CREATE OR ALTER TRIGGER dbo.TR_ProjectIssuedInvoices_Immutable ON dbo.ProjectIssuedInvoices AFTER UPDATE, DELETE AS
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

CREATE OR ALTER TRIGGER dbo.TR_BillingAllocations_Validate ON dbo.ProjectInvoiceAllocations AFTER INSERT, UPDATE, DELETE AS
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
