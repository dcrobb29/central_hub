SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Engagement type and recurrence are now decided when the estimate itself is created (not at win
-- time), since a recurring maintenance quote and a one-time project quote need different fields
-- from the start. Projects.EngagementType/RecurrenceFrequency (field-operations-routes-schema.sql)
-- are simply copied from these columns when an estimate is won.
IF COL_LENGTH(N'dbo.Estimates', N'EngagementType') IS NULL
    ALTER TABLE dbo.Estimates ADD EngagementType varchar(16) NOT NULL
        CONSTRAINT DF_Estimates_EngagementType DEFAULT 'Project' WITH VALUES;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Estimates_EngagementType')
    ALTER TABLE dbo.Estimates ADD CONSTRAINT CK_Estimates_EngagementType CHECK (EngagementType IN ('Project', 'Service'));
GO

IF COL_LENGTH(N'dbo.Estimates', N'RecurrenceFrequency') IS NULL
    ALTER TABLE dbo.Estimates ADD RecurrenceFrequency varchar(16) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Estimates_RecurrenceFrequency')
    ALTER TABLE dbo.Estimates ADD CONSTRAINT CK_Estimates_RecurrenceFrequency
        CHECK (RecurrenceFrequency IS NULL OR RecurrenceFrequency IN
            ('Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'SemiAnnually', 'Annually'));
GO

-- ExpectedEndDate is nullable: recurring work is often open-ended ("until further notice") when
-- first quoted.
IF COL_LENGTH(N'dbo.Estimates', N'ExpectedStartDate') IS NULL
    ALTER TABLE dbo.Estimates ADD ExpectedStartDate date NULL;
GO

IF COL_LENGTH(N'dbo.Estimates', N'ExpectedEndDate') IS NULL
    ALTER TABLE dbo.Estimates ADD ExpectedEndDate date NULL;
GO

-- Widen the existing Projects recurrence check constraint to match the expanded set of
-- frequencies now offered on Estimates.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_RecurrenceFrequency')
    ALTER TABLE dbo.Projects DROP CONSTRAINT CK_Projects_RecurrenceFrequency;
GO

ALTER TABLE dbo.Projects ADD CONSTRAINT CK_Projects_RecurrenceFrequency
    CHECK (RecurrenceFrequency IS NULL OR RecurrenceFrequency IN
        ('Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'SemiAnnually', 'Annually'));
GO

-- Carried over from the won estimate so Projects & Jobs can show/forecast recurrence without
-- joining back to Estimates.
IF COL_LENGTH(N'dbo.Projects', N'ExpectedStartDate') IS NULL
    ALTER TABLE dbo.Projects ADD ExpectedStartDate date NULL;
GO

IF COL_LENGTH(N'dbo.Projects', N'ExpectedEndDate') IS NULL
    ALTER TABLE dbo.Projects ADD ExpectedEndDate date NULL;
GO
