-- Apply to overhead-testdb before deploying the public account-registration code.
-- Creates only account-verification and shared authentication rate-limit tables.
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'overhead-testdb'
    THROW 51200, 'Connect directly to overhead-testdb before applying account-registration-schema.sql.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.PendingAccountVerifications', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.PendingAccountVerifications (
            NormalizedEmail nvarchar(254) NOT NULL,
            DisplayName nvarchar(150) NOT NULL,
            OrganizationName nvarchar(150) NOT NULL,
            TokenHash varbinary(32) NOT NULL,
            CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_PendingAccountVerifications_CreatedAt DEFAULT SYSUTCDATETIME(),
            ExpiresAt datetime2(0) NOT NULL,
            CONSTRAINT PK_PendingAccountVerifications PRIMARY KEY (NormalizedEmail),
            CONSTRAINT UX_PendingAccountVerifications_TokenHash UNIQUE (TokenHash)
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.PendingAccountVerifications')
          AND name = N'IX_PendingAccountVerifications_ExpiresAt'
    )
        CREATE INDEX IX_PendingAccountVerifications_ExpiresAt
            ON dbo.PendingAccountVerifications (ExpiresAt);

    IF OBJECT_ID(N'dbo.AuthenticationRateLimits', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AuthenticationRateLimits (
            Scope varchar(32) NOT NULL,
            KeyHash binary(32) NOT NULL,
            WindowStartedAt datetime2(0) NOT NULL,
            RequestCount int NOT NULL,
            CONSTRAINT PK_AuthenticationRateLimits PRIMARY KEY (Scope, KeyHash, WindowStartedAt),
            CONSTRAINT CK_AuthenticationRateLimits_RequestCount CHECK (RequestCount > 0)
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.AuthenticationRateLimits')
          AND name = N'IX_AuthenticationRateLimits_WindowStartedAt'
    )
        CREATE INDEX IX_AuthenticationRateLimits_WindowStartedAt
            ON dbo.AuthenticationRateLimits (WindowStartedAt);

    IF DATABASE_PRINCIPAL_ID(N'overhead_app') IS NULL
        THROW 51201, 'The expected overhead_app database principal does not exist; review the app database principal before granting migration access.', 1;

    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.PendingAccountVerifications TO [overhead_app];
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.AuthenticationRateLimits TO [overhead_app];

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT
    OBJECT_ID(N'dbo.PendingAccountVerifications', N'U') AS PendingAccountVerificationsObjectId,
    OBJECT_ID(N'dbo.AuthenticationRateLimits', N'U') AS AuthenticationRateLimitsObjectId;
