SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Customers (
        CustomerID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Customers PRIMARY KEY,
        FirstName nvarchar(100) NOT NULL,
        LastName nvarchar(100) NULL,
        CompanyName nvarchar(150) NULL,
        Email nvarchar(254) NULL,
        Phone nvarchar(50) NULL,
        BillingAddressLine1 nvarchar(200) NULL,
        BillingAddressLine2 nvarchar(200) NULL,
        BillingAddressCity nvarchar(100) NULL,
        BillingAddressState nvarchar(100) NULL,
        BillingAddressZip nvarchar(20) NULL,
        ShippingAddressLine1 nvarchar(200) NULL,
        ShippingAddressLine2 nvarchar(200) NULL,
        ShippingAddressCity nvarchar(100) NULL,
        ShippingAddressState nvarchar(100) NULL,
        ShippingAddressZip nvarchar(20) NULL,
        IsActive bit NOT NULL CONSTRAINT DF_Customers_IsActive DEFAULT 1,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Customers_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_Customers_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Customers_ContactName CHECK (LEN(LTRIM(RTRIM(FirstName))) > 0)
    );
END;

IF COL_LENGTH(N'dbo.Invoices', N'CustomerID') IS NULL
    ALTER TABLE dbo.Invoices ADD CustomerID int NULL;
IF COL_LENGTH(N'dbo.Projects', N'CustomerID') IS NULL
    ALTER TABLE dbo.Projects ADD CustomerID int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Invoices_Customers')
    ALTER TABLE dbo.Invoices ADD CONSTRAINT FK_Invoices_Customers FOREIGN KEY (CustomerID) REFERENCES dbo.Customers(CustomerID);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_Customers')
    ALTER TABLE dbo.Projects ADD CONSTRAINT FK_Projects_Customers FOREIGN KEY (CustomerID) REFERENCES dbo.Customers(CustomerID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Invoices') AND name = N'IX_Invoices_CustomerID')
    CREATE INDEX IX_Invoices_CustomerID ON dbo.Invoices(CustomerID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'IX_Projects_CustomerID')
    CREATE INDEX IX_Projects_CustomerID ON dbo.Projects(CustomerID);

-- Preserve invoice snapshots but remove the legacy contact/address length limits.
ALTER TABLE dbo.Invoices ALTER COLUMN [First Name] nvarchar(100) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Last Name] nvarchar(100) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Company Name] nvarchar(150) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Billing Address Line 1] nvarchar(200) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Billing Address Line 2] nvarchar(200) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Billing Address City] nvarchar(100) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Billing Address State] nvarchar(100) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Billing Address Zip] nvarchar(20) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Shipping Address Line 1] nvarchar(200) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Shipping Address Line 2] nvarchar(200) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Shipping Address City] nvarchar(100) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Shipping Address State] nvarchar(100) NULL;
ALTER TABLE dbo.Invoices ALTER COLUMN [Shipping Address Zip] nvarchar(20) NULL;

-- Refresh the completed-project guard to include the new CustomerID column.
DECLARE @columns nvarchar(max) = (
    SELECT STRING_AGG(CAST(QUOTENAME(name) AS nvarchar(max)), ',')
    FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name <> 'ProjectStatus' AND is_computed = 0
);
DECLARE @trigger nvarchar(max) = N'
CREATE OR ALTER TRIGGER dbo.TR_Projects_CompletedReadOnly ON dbo.Projects AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.ProjectID = d.ProjectID
        WHERE d.ProjectStatus = ''Complete'' AND (
            i.ProjectID IS NULL OR i.ProjectStatus NOT IN (''Complete'', ''Active'')
            OR EXISTS (SELECT ' + @columns + N' FROM deleted WHERE ProjectID = d.ProjectID
                       EXCEPT SELECT ' + @columns + N' FROM inserted WHERE ProjectID = d.ProjectID))
    )
        THROW 51030, ''This job is Complete and read-only. Reopen it to Active in Project Management before making changes.'', 1;
END';
EXEC sys.sp_executesql @trigger;

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Customers TO [applicationLogin];

COMMIT TRANSACTION;
