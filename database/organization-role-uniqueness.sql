-- Apply separately to local and Azure databases after OrganizationID exists on Roles.
-- Preserves RoleID, employee references, and every existing role.
IF @@TRANCOUNT <> 0
    THROW 51071, 'Run this migration in a session with no open transaction.', 1;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
       OR COL_LENGTH(N'dbo.Roles', N'OrganizationID') IS NULL
        THROW 51070, 'Roles must have OrganizationID before applying organization-scoped role uniqueness.', 1;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.Roles') AND name = N'UX_Roles_Organization_RoleName'
    )
        EXEC (N'CREATE UNIQUE INDEX UX_Roles_Organization_RoleName ON dbo.Roles(OrganizationID, RoleName);');

    -- Establish tenant-scoped uniqueness before removing the old global restriction.
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.Roles') AND name = N'UX_Roles_RoleName'
    )
        DROP INDEX UX_Roles_RoleName ON dbo.Roles;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
