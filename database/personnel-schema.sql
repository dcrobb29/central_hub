IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles (
        RoleID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
        RoleName nvarchar(80) NOT NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.Roles') AND name = N'UX_Roles_RoleName'
)
BEGIN
    CREATE UNIQUE INDEX UX_Roles_RoleName ON dbo.Roles(RoleName);
END;
GO

IF OBJECT_ID(N'dbo.Employees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employees (
        EmployeeID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
        EmployeeName nvarchar(200) NOT NULL,
        RoleID int NOT NULL,
        ManagerID int NULL,
        CONSTRAINT FK_Employees_Roles FOREIGN KEY (RoleID)
            REFERENCES dbo.Roles(RoleID),
        CONSTRAINT FK_Employees_Manager FOREIGN KEY (ManagerID)
            REFERENCES dbo.Employees(EmployeeID),
        CONSTRAINT CK_Employees_ManagerNotSelf CHECK (ManagerID IS NULL OR ManagerID <> EmployeeID)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.Employees') AND name = N'IX_Employees_ManagerID'
)
BEGIN
    CREATE INDEX IX_Employees_ManagerID ON dbo.Employees(ManagerID);
END;
GO

IF OBJECT_ID(N'dbo.EmployeeHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmployeeHistory (
        EmployeeHistoryID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmployeeHistory PRIMARY KEY,
        EmployeeID int NOT NULL,
        EventDate date NOT NULL,
        Notes nvarchar(max) NOT NULL,
        CONSTRAINT FK_EmployeeHistory_Employees FOREIGN KEY (EmployeeID)
            REFERENCES dbo.Employees(EmployeeID)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.EmployeeHistory') AND name = N'IX_EmployeeHistory_Employee_EventDate'
)
BEGIN
    CREATE INDEX IX_EmployeeHistory_Employee_EventDate
        ON dbo.EmployeeHistory(EmployeeID, EventDate DESC);
END;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT ON OBJECT::dbo.Roles TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Employees TO [applicationLogin];
    GRANT SELECT, INSERT ON OBJECT::dbo.EmployeeHistory TO [applicationLogin];
END;
GO
