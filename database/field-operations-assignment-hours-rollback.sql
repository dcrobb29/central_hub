SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Removes planner assignment hours and estimate-line task links. Estimate-line tasks
-- remain as ordinary tasks; assignment hours revert to the task's PlannedLaborHours.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.FieldOperationsTasks') AND name = N'UX_FieldOperationsTasks_VisitEstimateLine')
    DROP INDEX UX_FieldOperationsTasks_VisitEstimateLine ON dbo.FieldOperationsTasks;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_FieldOperationsTasks_EstimateLineItems')
    ALTER TABLE dbo.FieldOperationsTasks DROP CONSTRAINT FK_FieldOperationsTasks_EstimateLineItems;
GO
IF COL_LENGTH(N'dbo.FieldOperationsTasks', N'EstimateLineItemID') IS NOT NULL
    ALTER TABLE dbo.FieldOperationsTasks DROP COLUMN EstimateLineItemID;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FieldOperationsTaskAssignments_CustomHours')
    ALTER TABLE dbo.FieldOperationsTaskAssignments DROP CONSTRAINT CK_FieldOperationsTaskAssignments_CustomHours;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FieldOperationsTaskAssignments_HoursMode')
    ALTER TABLE dbo.FieldOperationsTaskAssignments DROP CONSTRAINT CK_FieldOperationsTaskAssignments_HoursMode;
GO
IF COL_LENGTH(N'dbo.FieldOperationsTaskAssignments', N'CustomHours') IS NOT NULL
    ALTER TABLE dbo.FieldOperationsTaskAssignments DROP COLUMN CustomHours;
GO
IF COL_LENGTH(N'dbo.FieldOperationsTaskAssignments', N'HoursMode') IS NOT NULL
    ALTER TABLE dbo.FieldOperationsTaskAssignments DROP COLUMN HoursMode;
GO
