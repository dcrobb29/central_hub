SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Tasks are the schedulable units within one dated project occurrence. A visit may
-- contain several tasks, which allows future routing and split-day assignments.
IF OBJECT_ID(N'dbo.FieldOperationsTasks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FieldOperationsTasks (
        FieldOperationsTaskID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_FieldOperationsTasks PRIMARY KEY,
        ServiceVisitID int NOT NULL,
        TaskName nvarchar(150) NOT NULL,
        PlannedLaborHours decimal(10,2) NOT NULL CONSTRAINT DF_FieldOperationsTasks_PlannedLaborHours DEFAULT 0,
        SortOrder int NOT NULL CONSTRAINT DF_FieldOperationsTasks_SortOrder DEFAULT 0,
        IsActive bit NOT NULL CONSTRAINT DF_FieldOperationsTasks_IsActive DEFAULT 1,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_FieldOperationsTasks_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_FieldOperationsTasks_ServiceVisits FOREIGN KEY (ServiceVisitID)
            REFERENCES dbo.ServiceVisits(ServiceVisitID),
        CONSTRAINT CK_FieldOperationsTasks_PlannedLaborHours CHECK (PlannedLaborHours >= 0),
        CONSTRAINT CK_FieldOperationsTasks_TaskName CHECK (LEN(LTRIM(RTRIM(TaskName))) > 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.FieldOperationsTasks') AND name = N'IX_FieldOperationsTasks_ServiceVisitID')
    CREATE INDEX IX_FieldOperationsTasks_ServiceVisitID ON dbo.FieldOperationsTasks(ServiceVisitID, IsActive, SortOrder);
GO

-- One resource is assigned to one task at a time. Soft removal preserves scheduling history.
IF OBJECT_ID(N'dbo.FieldOperationsTaskAssignments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FieldOperationsTaskAssignments (
        FieldOperationsTaskAssignmentID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_FieldOperationsTaskAssignments PRIMARY KEY,
        FieldOperationsTaskID int NOT NULL,
        EmployeeID int NULL,
        EquipmentID int NULL,
        IsActive bit NOT NULL CONSTRAINT DF_FieldOperationsTaskAssignments_IsActive DEFAULT 1,
        AssignedAt datetime2(0) NOT NULL CONSTRAINT DF_FieldOperationsTaskAssignments_AssignedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_FieldOperationsTaskAssignments_Tasks FOREIGN KEY (FieldOperationsTaskID)
            REFERENCES dbo.FieldOperationsTasks(FieldOperationsTaskID),
        CONSTRAINT FK_FieldOperationsTaskAssignments_Employees FOREIGN KEY (EmployeeID)
            REFERENCES dbo.Employees(EmployeeID),
        CONSTRAINT FK_FieldOperationsTaskAssignments_Equipment FOREIGN KEY (EquipmentID)
            REFERENCES dbo.Equipment(EquipmentID),
        CONSTRAINT CK_FieldOperationsTaskAssignments_OneResource CHECK (
            (CASE WHEN EmployeeID IS NOT NULL THEN 1 ELSE 0 END)
            + (CASE WHEN EquipmentID IS NOT NULL THEN 1 ELSE 0 END) = 1
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.FieldOperationsTaskAssignments') AND name = N'UX_FieldOperationsTaskAssignments_ActiveEmployee')
    CREATE UNIQUE INDEX UX_FieldOperationsTaskAssignments_ActiveEmployee
        ON dbo.FieldOperationsTaskAssignments(FieldOperationsTaskID, EmployeeID)
        WHERE IsActive = 1 AND EmployeeID IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.FieldOperationsTaskAssignments') AND name = N'UX_FieldOperationsTaskAssignments_ActiveEquipment')
    CREATE UNIQUE INDEX UX_FieldOperationsTaskAssignments_ActiveEquipment
        ON dbo.FieldOperationsTaskAssignments(FieldOperationsTaskID, EquipmentID)
        WHERE IsActive = 1 AND EquipmentID IS NOT NULL;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.FieldOperationsTasks TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.FieldOperationsTaskAssignments TO [applicationLogin];
END;
GO
