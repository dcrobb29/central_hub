-- Apply to overhead-testdb before deploying code that collects passwords after email verification.
-- Removes the pre-verification password column from pending signups.
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'overhead-testdb'
    THROW 51210, 'Connect directly to overhead-testdb before applying this migration.', 1;

IF OBJECT_ID(N'dbo.PendingAccountVerifications', N'U') IS NULL
    THROW 51211, 'PendingAccountVerifications does not exist; apply account-registration-schema.sql first.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.PendingAccountVerifications', N'PasswordHash') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.PendingAccountVerifications
            DROP COLUMN PasswordHash;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT COL_LENGTH(N'dbo.PendingAccountVerifications', N'PasswordHash') AS PendingPasswordHashColumnLength;
