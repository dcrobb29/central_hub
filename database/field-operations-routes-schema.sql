SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- EngagementType is chosen per-project at win time (never locked to a company/account type).
-- RecurrenceFrequency is NULL for one-time work (construction projects, or a pest-control
-- one-off visit); non-null drives recurring service. RouteID only applies to recurring service.
IF COL_LENGTH(N'dbo.Projects', N'EngagementType') IS NULL
    ALTER TABLE dbo.Projects ADD EngagementType varchar(16) NOT NULL
        CONSTRAINT DF_Projects_EngagementType DEFAULT 'Project' WITH VALUES;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_EngagementType')
    ALTER TABLE dbo.Projects ADD CONSTRAINT CK_Projects_EngagementType CHECK (EngagementType IN ('Project', 'Service'));
GO

IF COL_LENGTH(N'dbo.Projects', N'RecurrenceFrequency') IS NULL
    ALTER TABLE dbo.Projects ADD RecurrenceFrequency varchar(16) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_RecurrenceFrequency')
    ALTER TABLE dbo.Projects ADD CONSTRAINT CK_Projects_RecurrenceFrequency
        CHECK (RecurrenceFrequency IS NULL OR RecurrenceFrequency IN ('Weekly', 'Biweekly', 'Monthly'));
GO

-- A route is a geographic/day grouping of recurring (or one-off) service stops, assigned to a crew.
IF OBJECT_ID(N'dbo.Routes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Routes (
        RouteID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Routes PRIMARY KEY,
        RouteName nvarchar(150) NOT NULL,
        CrewLeadEmployeeID int NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Routes_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Routes_CrewLead FOREIGN KEY (CrewLeadEmployeeID) REFERENCES dbo.Employees(EmployeeID)
    );
END;
GO

IF COL_LENGTH(N'dbo.Projects', N'RouteID') IS NULL
    ALTER TABLE dbo.Projects ADD RouteID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_Routes')
    ALTER TABLE dbo.Projects ADD CONSTRAINT FK_Projects_Routes FOREIGN KEY (RouteID) REFERENCES dbo.Routes(RouteID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'IX_Projects_RouteID')
    CREATE INDEX IX_Projects_RouteID ON dbo.Projects(RouteID);
GO

-- One row per actual field occurrence (a single recurring stop, or a one-off dispatched visit).
-- This is what Field Operations looks at day-to-day, regardless of whether the parent project
-- recurs or not, and is where visit-level completion tracking lives.
IF OBJECT_ID(N'dbo.ServiceVisits', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ServiceVisits (
        ServiceVisitID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ServiceVisits PRIMARY KEY,
        ProjectID int NOT NULL,
        VisitDate date NOT NULL,
        Status varchar(16) NOT NULL CONSTRAINT DF_ServiceVisits_Status DEFAULT 'Scheduled',
        CompletedAt datetime2(0) NULL,
        Notes nvarchar(300) NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_ServiceVisits_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ServiceVisits_Projects FOREIGN KEY (ProjectID) REFERENCES dbo.Projects(ProjectID),
        CONSTRAINT CK_ServiceVisits_Status CHECK (Status IN ('Scheduled', 'Completed', 'Skipped'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ServiceVisits') AND name = N'IX_ServiceVisits_ProjectID_VisitDate')
    CREATE INDEX IX_ServiceVisits_ProjectID_VisitDate ON dbo.ServiceVisits(ProjectID, VisitDate);
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Routes TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ServiceVisits TO [applicationLogin];
END;
GO
