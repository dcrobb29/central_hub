SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- PDF export preference: toggle between a one-line total or full line-item detail.
IF COL_LENGTH(N'dbo.Estimates', N'ExportDetailLevel') IS NULL
BEGIN
    ALTER TABLE dbo.Estimates
        ADD ExportDetailLevel varchar(10) NOT NULL
        CONSTRAINT DF_Estimates_ExportDetailLevel DEFAULT 'Summary' WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Estimates_ExportDetailLevel')
BEGIN
    ALTER TABLE dbo.Estimates
        ADD CONSTRAINT CK_Estimates_ExportDetailLevel CHECK (ExportDetailLevel IN ('Summary', 'Detail'));
END;
GO

-- Single owner column for filtering/evaluating projects by project manager.
IF COL_LENGTH(N'dbo.Projects', N'ProjectManagerID') IS NULL
    ALTER TABLE dbo.Projects ADD ProjectManagerID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_ProjectManager')
BEGIN
    ALTER TABLE dbo.Projects
        ADD CONSTRAINT FK_Projects_ProjectManager FOREIGN KEY (ProjectManagerID)
        REFERENCES dbo.Employees(EmployeeID);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'IX_Projects_ProjectManagerID')
    CREATE INDEX IX_Projects_ProjectManagerID ON dbo.Projects(ProjectManagerID);
GO

-- Equipment master list (trucks, machinery) to mirror Employees for site assignments.
IF OBJECT_ID(N'dbo.Equipment', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Equipment (
        EquipmentID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Equipment PRIMARY KEY,
        EquipmentName nvarchar(150) NOT NULL,
        EquipmentType nvarchar(80) NULL,
        AssetTag nvarchar(50) NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Equipment_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- Tracks employees and/or equipment moving on/off a job site for billing and recordkeeping.
IF OBJECT_ID(N'dbo.ProjectResourceAssignments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectResourceAssignments (
        ProjectResourceAssignmentID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProjectResourceAssignments PRIMARY KEY,
        ProjectID int NOT NULL,
        EmployeeID int NULL,
        EquipmentID int NULL,
        AssignedDate date NOT NULL,
        RemovedDate date NULL,
        Notes nvarchar(300) NULL,
        CONSTRAINT FK_ProjectResourceAssignments_Projects FOREIGN KEY (ProjectID)
            REFERENCES dbo.Projects(ProjectID),
        CONSTRAINT FK_ProjectResourceAssignments_Employees FOREIGN KEY (EmployeeID)
            REFERENCES dbo.Employees(EmployeeID),
        CONSTRAINT FK_ProjectResourceAssignments_Equipment FOREIGN KEY (EquipmentID)
            REFERENCES dbo.Equipment(EquipmentID),
        CONSTRAINT CK_ProjectResourceAssignments_OneResource CHECK (
            (CASE WHEN EmployeeID IS NOT NULL THEN 1 ELSE 0 END)
            + (CASE WHEN EquipmentID IS NOT NULL THEN 1 ELSE 0 END) = 1
        ),
        CONSTRAINT CK_ProjectResourceAssignments_Dates CHECK (RemovedDate IS NULL OR RemovedDate >= AssignedDate)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProjectResourceAssignments') AND name = N'IX_ProjectResourceAssignments_ProjectID')
    CREATE INDEX IX_ProjectResourceAssignments_ProjectID ON dbo.ProjectResourceAssignments(ProjectID);
GO

-- Actual purchases/costs against a project, optionally tied back to the estimated line they relate to.
-- InvoiceReference/BillReference are plain text, not foreign keys, per earlier agreement to keep this loose for now.
IF OBJECT_ID(N'dbo.ProjectActualCosts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectActualCosts (
        ProjectActualCostID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProjectActualCosts PRIMARY KEY,
        ProjectID int NOT NULL,
        EstimateLineItemID int NULL,
        Description nvarchar(300) NOT NULL,
        Quantity decimal(19,4) NULL,
        UnitCost decimal(19,4) NULL,
        Amount decimal(19,2) NOT NULL,
        CostDate date NOT NULL,
        SourceReference nvarchar(50) NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_ProjectActualCosts_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ProjectActualCosts_Projects FOREIGN KEY (ProjectID)
            REFERENCES dbo.Projects(ProjectID),
        CONSTRAINT FK_ProjectActualCosts_EstimateLineItems FOREIGN KEY (EstimateLineItemID)
            REFERENCES dbo.EstimateLineItems(EstimateLineItemID)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProjectActualCosts') AND name = N'IX_ProjectActualCosts_ProjectID')
    CREATE INDEX IX_ProjectActualCosts_ProjectID ON dbo.ProjectActualCosts(ProjectID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProjectActualCosts') AND name = N'IX_ProjectActualCosts_EstimateLineItemID')
    CREATE INDEX IX_ProjectActualCosts_EstimateLineItemID ON dbo.ProjectActualCosts(EstimateLineItemID);
GO

-- Progress toward completing each estimated line item, used to bill as work is completed.
-- Quantifiable lines (SF/LF) track QuantityCompleted; vaguely-described lines fall back to PercentComplete.
IF OBJECT_ID(N'dbo.ProjectLineItemProgress', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectLineItemProgress (
        ProjectLineItemProgressID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProjectLineItemProgress PRIMARY KEY,
        EstimateLineItemID int NOT NULL,
        QuantityCompleted decimal(19,4) NULL,
        PercentComplete decimal(5,2) NULL,
        Status varchar(16) NOT NULL CONSTRAINT DF_ProjectLineItemProgress_Status DEFAULT 'NotStarted',
        LastUpdated datetime2(0) NOT NULL CONSTRAINT DF_ProjectLineItemProgress_LastUpdated DEFAULT SYSUTCDATETIME(),
        Notes nvarchar(300) NULL,
        CONSTRAINT FK_ProjectLineItemProgress_EstimateLineItems FOREIGN KEY (EstimateLineItemID)
            REFERENCES dbo.EstimateLineItems(EstimateLineItemID),
        CONSTRAINT UQ_ProjectLineItemProgress_Line UNIQUE (EstimateLineItemID),
        CONSTRAINT CK_ProjectLineItemProgress_Status CHECK (Status IN ('NotStarted', 'InProgress', 'Complete')),
        CONSTRAINT CK_ProjectLineItemProgress_Quantity CHECK (QuantityCompleted IS NULL OR QuantityCompleted >= 0),
        CONSTRAINT CK_ProjectLineItemProgress_Percent CHECK (PercentComplete IS NULL OR PercentComplete BETWEEN 0 AND 100)
    );
END;
GO

-- Lightweight milestone table so percent-of-contract billing can be layered on without a redesign.
IF OBJECT_ID(N'dbo.ProjectBillingMilestones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectBillingMilestones (
        ProjectBillingMilestoneID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProjectBillingMilestones PRIMARY KEY,
        ProjectID int NOT NULL,
        MilestoneName nvarchar(150) NOT NULL,
        TargetPercent decimal(5,2) NULL,
        Status varchar(16) NOT NULL CONSTRAINT DF_ProjectBillingMilestones_Status DEFAULT 'Pending',
        CompletedDate date NULL,
        InvoiceReference nvarchar(20) NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_ProjectBillingMilestones_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ProjectBillingMilestones_Projects FOREIGN KEY (ProjectID)
            REFERENCES dbo.Projects(ProjectID),
        CONSTRAINT CK_ProjectBillingMilestones_Status CHECK (Status IN ('Pending', 'Billed')),
        CONSTRAINT CK_ProjectBillingMilestones_Percent CHECK (TargetPercent IS NULL OR TargetPercent BETWEEN 0 AND 100)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ProjectBillingMilestones') AND name = N'IX_ProjectBillingMilestones_ProjectID')
    CREATE INDEX IX_ProjectBillingMilestones_ProjectID ON dbo.ProjectBillingMilestones(ProjectID);
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Equipment TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectResourceAssignments TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectActualCosts TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectLineItemProgress TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ProjectBillingMilestones TO [applicationLogin];
END;
GO
