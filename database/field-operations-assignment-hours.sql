SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Per-assignment hours for the weekly planner's task assignment modal.
-- Existing assignments are not updated: a NULL HoursMode keeps the legacy behavior
-- (the assignment uses its task's PlannedLaborHours), so nothing disappears and the
-- Complete/inactive-job read-only triggers are not fired by this migration.
IF COL_LENGTH(N'dbo.FieldOperationsTaskAssignments', N'HoursMode') IS NULL
    ALTER TABLE dbo.FieldOperationsTaskAssignments ADD HoursMode varchar(12) NULL;
GO

IF COL_LENGTH(N'dbo.FieldOperationsTaskAssignments', N'CustomHours') IS NULL
    ALTER TABLE dbo.FieldOperationsTaskAssignments ADD CustomHours decimal(10,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FieldOperationsTaskAssignments_HoursMode')
    ALTER TABLE dbo.FieldOperationsTaskAssignments ADD CONSTRAINT CK_FieldOperationsTaskAssignments_HoursMode
        CHECK (HoursMode IS NULL OR HoursMode IN ('FullDay', 'HalfDay', 'FullJob', 'Split', 'Custom'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FieldOperationsTaskAssignments_CustomHours')
    ALTER TABLE dbo.FieldOperationsTaskAssignments ADD CONSTRAINT CK_FieldOperationsTaskAssignments_CustomHours
        CHECK (CustomHours IS NULL OR (CustomHours >= 0 AND CustomHours <= 24));
GO

-- Tasks created from approved-estimate Labor lines measured in HR.
IF COL_LENGTH(N'dbo.FieldOperationsTasks', N'EstimateLineItemID') IS NULL
    ALTER TABLE dbo.FieldOperationsTasks ADD EstimateLineItemID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_FieldOperationsTasks_EstimateLineItems')
    ALTER TABLE dbo.FieldOperationsTasks ADD CONSTRAINT FK_FieldOperationsTasks_EstimateLineItems
        FOREIGN KEY (EstimateLineItemID) REFERENCES dbo.EstimateLineItems(EstimateLineItemID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.FieldOperationsTasks') AND name = N'UX_FieldOperationsTasks_VisitEstimateLine')
    CREATE UNIQUE INDEX UX_FieldOperationsTasks_VisitEstimateLine
        ON dbo.FieldOperationsTasks(ServiceVisitID, EstimateLineItemID)
        WHERE EstimateLineItemID IS NOT NULL;
GO
