IF COL_LENGTH(N'dbo.Invoices', N'Invoice Paid Date') IS NOT NULL
BEGIN
    DECLARE @hasPaidDates bit = 0;
    EXEC sys.sp_executesql
        N'SELECT @hasPaidDatesOut = CASE WHEN EXISTS (
            SELECT 1 FROM dbo.Invoices WHERE [Invoice Paid Date] IS NOT NULL
        ) THEN 1 ELSE 0 END',
        N'@hasPaidDatesOut bit OUTPUT',
        @hasPaidDatesOut = @hasPaidDates OUTPUT;

    IF @hasPaidDates = 1
        THROW 51000, 'Rollback stopped: invoice paid dates have been recorded.', 1;

    ALTER TABLE dbo.Invoices DROP COLUMN [Invoice Paid Date];
END;
GO
