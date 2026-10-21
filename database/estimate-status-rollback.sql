SET XACT_ABORT ON;

IF DB_NAME() NOT IN (N'centralHubTest', N'overhead-testdb')
    THROW 51033, 'Select centralHubTest or overhead-testdb before rolling back estimate statuses.', 1;

-- Restores the old allowed values, not the identities of former Sent estimates.
BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.Estimates') AND name = N'CK_Estimates_Status')
        ALTER TABLE dbo.Estimates DROP CONSTRAINT CK_Estimates_Status;

    ALTER TABLE dbo.Estimates WITH CHECK ADD CONSTRAINT CK_Estimates_Status
        CHECK (EstimateStatus IN ('Draft', 'Sent', 'Won', 'Lost'));

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
