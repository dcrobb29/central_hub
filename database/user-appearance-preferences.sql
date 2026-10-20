-- Apply to the intended database before deploying appearance preferences.
SET XACT_ABORT ON;
IF DB_NAME() NOT IN (N'centralHubTest', N'overhead-testdb')
    THROW 51301, 'Select centralHubTest or overhead-testdb before applying this migration.', 1;
IF DB_NAME() = N'overhead-testdb' AND DATABASE_PRINCIPAL_ID(N'overhead_app') IS NULL
    THROW 51300, 'Expected overhead_app principal not found; review the application principal before granting access.', 1;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.UserAppearancePreferences', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserAppearancePreferences (
        UserID int NOT NULL CONSTRAINT PK_UserAppearancePreferences PRIMARY KEY,
        PreferencesJson nvarchar(2000) NOT NULL,
        UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_UserAppearancePreferences_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_UserAppearancePreferences_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT CK_UserAppearancePreferences_Json CHECK (ISJSON(PreferencesJson) = 1)
    );
END;
IF DATABASE_PRINCIPAL_ID(N'overhead_app') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON dbo.UserAppearancePreferences TO [overhead_app];
COMMIT TRANSACTION;
