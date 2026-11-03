-- Apply separately to local and Azure before deploying 201-character customer snapshots.
IF @@TRANCOUNT <> 0
    THROW 51320, 'Run this migration with no open transaction.', 1;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.Estimates', N'CustomerName') IS NULL
        THROW 51321, 'Expected dbo.Estimates.CustomerName column is missing.', 1;
    IF COL_LENGTH(N'dbo.Estimates', N'CustomerName') < 402
        ALTER TABLE dbo.Estimates ALTER COLUMN CustomerName nvarchar(201) NULL;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT COL_LENGTH(N'dbo.Estimates', N'CustomerName') AS CustomerNameBytes,
    @@TRANCOUNT AS OpenTransactions;
