IF COL_LENGTH(N'dbo.Invoices', N'Invoice Paid Date') IS NULL
BEGIN
    ALTER TABLE dbo.Invoices
        ADD [Invoice Paid Date] date NULL;
END;
GO
