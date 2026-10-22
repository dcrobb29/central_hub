-- Run only against the intended test database after organization-role-uniqueness.sql.
-- Requires two existing organizations. All inserted test roles are rolled back.
IF @@TRANCOUNT <> 0
    THROW 51071, 'Run this verification in a session with no open transaction.', 1;

SET XACT_ABORT OFF;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @orgA int, @orgB int;
    SELECT @orgA = MIN(OrganizationID), @orgB = MAX(OrganizationID) FROM dbo.Organizations;
    IF @orgA IS NULL OR @orgA = @orgB
        THROW 51072, 'Create two test organizations through the application before running verification.', 1;

    DECLARE @name nvarchar(80) = N'Role isolation check ' + CONVERT(nvarchar(36), NEWID());
    INSERT INTO dbo.Roles (OrganizationID, RoleName) VALUES (@orgA, @name), (@orgB, @name);

    IF (SELECT COUNT(*) FROM dbo.Roles WHERE RoleName = @name AND OrganizationID IN (@orgA, @orgB)) <> 2
        THROW 51073, 'The same role name must be allowed in two organizations.', 1;

    DECLARE @duplicateRejected bit = 0;
    BEGIN TRY
        INSERT INTO dbo.Roles (OrganizationID, RoleName) VALUES (@orgA, @name);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
        SET @duplicateRejected = 1;
    END CATCH;

    IF @duplicateRejected = 0
        THROW 51074, 'A duplicate role name within one organization must be rejected.', 1;

    ROLLBACK TRANSACTION;
    SET XACT_ABORT ON;
    SELECT N'PASS: cross-organization names allowed; same-organization duplicates rejected; test rows rolled back.' AS Result;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    SET XACT_ABORT ON;
    THROW;
END CATCH;
