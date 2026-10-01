IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    REVOKE INSERT ON OBJECT::dbo.Invoices FROM [applicationLogin];
    REVOKE INSERT ON OBJECT::dbo.Bills FROM [applicationLogin];
END;
GO
