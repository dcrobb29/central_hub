IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NULL
    THROW 51000, 'Database user applicationLogin was not found.', 1;
GO

GRANT INSERT ON OBJECT::dbo.Invoices TO [applicationLogin];
GRANT INSERT ON OBJECT::dbo.Bills TO [applicationLogin];
GO
