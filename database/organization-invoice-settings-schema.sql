SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.OrganizationInvoiceSettings', N'U') IS NULL
CREATE TABLE dbo.OrganizationInvoiceSettings (
    OrganizationID int NOT NULL PRIMARY KEY REFERENCES dbo.Organizations(OrganizationID),
    TemplateStyle varchar(32) NOT NULL DEFAULT 'modern' CHECK (TemplateStyle IN ('modern', 'classic', 'compact', 'minimal')),
    AccentColor varchar(16) NOT NULL DEFAULT '#0284c7',
    InvoiceTitle nvarchar(64) NOT NULL DEFAULT 'INVOICE',
    CompanyName nvarchar(150) NULL,
    CompanyAddressLine1 nvarchar(200) NULL,
    CompanyAddressLine2 nvarchar(200) NULL,
    CompanyCity nvarchar(100) NULL,
    CompanyState nvarchar(50) NULL,
    CompanyZip nvarchar(20) NULL,
    CompanyPhone nvarchar(50) NULL,
    CompanyEmail nvarchar(254) NULL,
    CompanyWebsite nvarchar(200) NULL,
    TaxNumber nvarchar(50) NULL,
    PaymentTerms nvarchar(100) NOT NULL DEFAULT 'Net 30',
    PaymentInstructions nvarchar(max) NULL,
    DefaultCustomerNotes nvarchar(max) NULL,
    EmailSubjectTemplate nvarchar(250) NOT NULL DEFAULT 'Invoice {invoiceNo} from {companyName}',
    EmailBodyTemplate nvarchar(max) NOT NULL DEFAULT 'Hello {customerName},

Please find attached Invoice {invoiceNo} for {invoiceAmount}.
Project: {projectName}
Due date: {dueDate}

Thank you for your business!

Sincerely,
{companyName}',
    ShowShippingAddress bit NOT NULL DEFAULT 1,
    ShowProjectName bit NOT NULL DEFAULT 1,
    ShowItemizedScopes bit NOT NULL DEFAULT 1,
    UpdatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Seed defaults for Contoso test organization if not already seeded
IF EXISTS (SELECT 1 FROM dbo.Organizations WHERE OrganizationID = 1)
   AND NOT EXISTS (SELECT 1 FROM dbo.OrganizationInvoiceSettings WHERE OrganizationID = 1)
BEGIN
    INSERT INTO dbo.OrganizationInvoiceSettings (
        OrganizationID,
        TemplateStyle,
        AccentColor,
        InvoiceTitle,
        CompanyName,
        CompanyAddressLine1,
        CompanyCity,
        CompanyState,
        CompanyZip,
        CompanyPhone,
        CompanyEmail,
        PaymentTerms,
        PaymentInstructions,
        DefaultCustomerNotes
    ) VALUES (
        1,
        'modern',
        '#0284c7',
        'INVOICE',
        'Contoso',
        '1000 Innovation Way, Suite 400',
        'Seattle',
        'WA',
        '98101',
        '(206) 555-0199',
        'billing@contoso.com',
        'Net 30',
        'Please remit payments via check or ACH direct deposit to Contoso Accounts Receivable. Reference invoice number with payment.',
        'Thank you for your business! If you have questions regarding this invoice, please contact our billing department.'
    );
END;

IF COL_LENGTH(N'dbo.Invoices', N'LastEmailedAt') IS NULL
    ALTER TABLE dbo.Invoices ADD LastEmailedAt datetime2(0) NULL;

IF COL_LENGTH(N'dbo.Invoices', N'LastEmailedTo') IS NULL
    ALTER TABLE dbo.Invoices ADD LastEmailedTo nvarchar(254) NULL;

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'applicationLogin')
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.OrganizationInvoiceSettings TO applicationLogin;
    GRANT SELECT, UPDATE ON dbo.Invoices TO applicationLogin;
END;

COMMIT TRANSACTION;
