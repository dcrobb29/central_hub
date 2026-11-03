-- Apply separately to local and Azure databases before deploying the longer bill company input.
IF @@TRANCOUNT <> 0
    THROW 51310, 'Run this migration with no open transaction.', 1;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.Bills', N'Company Name') IS NULL
        THROW 51311, 'Expected dbo.Bills.Company Name column is missing.', 1;
    IF COL_LENGTH(N'dbo.Bills', N'Company Name') < 300
        ALTER TABLE dbo.Bills ALTER COLUMN [Company Name] nvarchar(150) NULL;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
