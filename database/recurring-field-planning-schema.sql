SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Existing open-ended schedules receive the agreed three-month term.
UPDATE dbo.Estimates
SET ExpectedEndDate = DATEADD(month, 3, ExpectedStartDate)
WHERE EngagementType = 'Service' AND ExpectedEndDate IS NULL AND ExpectedStartDate IS NOT NULL;

UPDATE dbo.Projects
SET ExpectedEndDate = DATEADD(month, 3, ExpectedStartDate)
WHERE EngagementType = 'Service' AND ExpectedEndDate IS NULL AND ExpectedStartDate IS NOT NULL;
GO

-- Original series date is independent of the actual scheduled date. Keep it even
-- when a visit is moved, skipped, or completed, so it cannot be regenerated.
IF COL_LENGTH(N'dbo.ServiceVisits', N'RecurrenceDate') IS NULL
    ALTER TABLE dbo.ServiceVisits ADD RecurrenceDate date NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ServiceVisits') AND name = N'UX_ServiceVisits_RecurrenceDate')
    CREATE UNIQUE INDEX UX_ServiceVisits_RecurrenceDate
        ON dbo.ServiceVisits(ProjectID, RecurrenceDate) WHERE RecurrenceDate IS NOT NULL;
GO

-- Leave legacy incomplete records readable, but require bounded schedules for new
-- or updated recurring records. No dates are invented when the start is missing.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Estimates_RecurringDates')
    ALTER TABLE dbo.Estimates WITH NOCHECK ADD CONSTRAINT CK_Estimates_RecurringDates
        CHECK (EngagementType <> 'Service' OR (
            ExpectedStartDate IS NOT NULL AND ExpectedEndDate IS NOT NULL
            AND RecurrenceFrequency IS NOT NULL AND ExpectedEndDate >= ExpectedStartDate));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_RecurringDates')
    ALTER TABLE dbo.Projects WITH NOCHECK ADD CONSTRAINT CK_Projects_RecurringDates
        CHECK (EngagementType <> 'Service' OR (
            ExpectedStartDate IS NOT NULL AND ExpectedEndDate IS NOT NULL
            AND RecurrenceFrequency IS NOT NULL AND ExpectedEndDate >= ExpectedStartDate));
GO
