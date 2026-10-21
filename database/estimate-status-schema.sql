SET XACT_ABORT ON;

IF DB_NAME() NOT IN (N'centralHubTest', N'overhead-testdb')
    THROW 51033, 'Select centralHubTest or overhead-testdb before migrating estimate statuses.', 1;

IF OBJECT_ID(N'dbo.Estimates', N'U') IS NULL
    THROW 51034, 'Create dbo.Estimates before migrating estimate statuses.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1 FROM dbo.Estimates WITH (TABLOCKX, HOLDLOCK)
        WHERE EstimateStatus IS NULL OR EstimateStatus NOT IN ('Draft', 'Sent', 'Won', 'Lost'))
        THROW 51035, 'Unexpected estimate statuses found. Review them before migrating; no records were changed.', 1;

    UPDATE dbo.Estimates SET EstimateStatus = 'Draft' WHERE EstimateStatus = 'Sent';
    DECLARE @ConvertedSentEstimates int = @@ROWCOUNT;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.Estimates') AND name = N'CK_Estimates_Status')
        ALTER TABLE dbo.Estimates DROP CONSTRAINT CK_Estimates_Status;

    ALTER TABLE dbo.Estimates WITH CHECK ADD CONSTRAINT CK_Estimates_Status
        CHECK (EstimateStatus IN ('Draft', 'Won', 'Lost'));

    COMMIT TRANSACTION;
    SELECT @ConvertedSentEstimates AS ConvertedSentEstimates;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
