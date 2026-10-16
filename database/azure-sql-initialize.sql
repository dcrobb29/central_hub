-- Run after azure-sql-baseline.sql and estimate-status-schema.sql.
-- Single-organization demo initialization, not production SaaS onboarding.
-- Copies approved reference values only; no local users, hashes, or business records.
-- Both application accounts remain INACTIVE until production login is secured
-- and passwords are provisioned privately. No SQL/Entra principals are created.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() <> N'overhead-testdb'
    THROW 51100, 'Connect directly to overhead-testdb before running this initialization.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM dbo.Organizations
        WHERE OrganizationID <> 1 OR OrganizationKey <> 'overhead-demo'
            OR OrganizationName <> N'Overhead Demo' OR Status <> 'Active')
        THROW 51101, 'This initializer requires an empty organization table or the existing Overhead Demo organization at ID 1.', 1;

    -- Legacy defaults in the exported schema still assign OrganizationID = 1.
    IF NOT EXISTS (SELECT 1 FROM dbo.Organizations WHERE OrganizationID = 1)
    BEGIN
        SET IDENTITY_INSERT dbo.Organizations ON;
        INSERT INTO dbo.Organizations (OrganizationID, OrganizationKey, OrganizationName, Status)
        VALUES (1, 'overhead-demo', N'Overhead Demo', 'Active');
        SET IDENTITY_INSERT dbo.Organizations OFF;
    END;

    DECLARE @permissions TABLE (
        PermissionKey varchar(64) PRIMARY KEY,
        Description nvarchar(150) NOT NULL,
        DemoRead bit NOT NULL
    );
    INSERT INTO @permissions (PermissionKey, Description, DemoRead) VALUES
        ('catalogs.read', N'View catalogs and templates', 1),
        ('catalogs.write', N'Manage catalogs and templates', 0),
        ('customers.read', N'View business customers', 1),
        ('customers.write', N'Manage business customers', 0),
        ('finances.read', N'View bills and invoices', 1),
        ('finances.write', N'Manage bills and invoices', 0),
        ('members.manage', N'Manage memberships and access roles', 0),
        ('organization.manage', N'Manage organization settings', 0),
        ('personnel.read', N'View employees and equipment', 1),
        ('personnel.write', N'Manage employees and equipment', 0),
        ('planning.read', N'View scheduling', 1),
        ('planning.write', N'Manage scheduling and assignments', 0),
        ('projects.read', N'View projects and completion', 1),
        ('projects.write', N'Manage projects and completion', 0),
        ('sales.read', N'View leads and estimates', 1),
        ('sales.write', N'Manage leads and estimates', 0),
        ('subscription.manage', N'Manage SaaS subscription', 0);

    INSERT INTO dbo.Permissions (PermissionKey, Description)
    SELECT p.PermissionKey, p.Description FROM @permissions p
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions known WHERE known.PermissionKey = p.PermissionKey);

    DECLARE @roles TABLE (RoleKey varchar(32) PRIMARY KEY, RoleName nvarchar(80) NOT NULL);
    INSERT INTO @roles VALUES ('Owner', N'Owner'), ('Viewer', N'Recruiter Viewer');
    INSERT INTO dbo.AccessRoles (OrganizationID, RoleKey, RoleName)
    SELECT 1, r.RoleKey, r.RoleName FROM @roles r
    WHERE NOT EXISTS (SELECT 1 FROM dbo.AccessRoles known
        WHERE known.OrganizationID = 1 AND known.RoleKey = r.RoleKey);

    DECLARE @ownerRole int = (SELECT AccessRoleID FROM dbo.AccessRoles WHERE OrganizationID = 1 AND RoleKey = 'Owner');
    DECLARE @viewerRole int = (SELECT AccessRoleID FROM dbo.AccessRoles WHERE OrganizationID = 1 AND RoleKey = 'Viewer');

    -- Refuse unexpected existing grants rather than silently changing access.
    IF EXISTS (
        SELECT 1 FROM dbo.AccessRolePermissions a
        WHERE a.OrganizationID = 1 AND (
            (a.AccessRoleID = @ownerRole AND NOT EXISTS (
                SELECT 1 FROM @permissions p WHERE p.PermissionKey = a.PermissionKey))
            OR (a.AccessRoleID = @viewerRole AND NOT EXISTS (
                SELECT 1 FROM @permissions p WHERE p.PermissionKey = a.PermissionKey AND p.DemoRead = 1))
        )
    )
        THROW 51102, 'Owner or Viewer has unexpected grants. Review access manually before initializing.', 1;

    INSERT INTO dbo.AccessRolePermissions (OrganizationID, AccessRoleID, PermissionKey)
    SELECT 1, r.AccessRoleID, p.PermissionKey
    FROM dbo.AccessRoles r CROSS JOIN @permissions p
    WHERE r.OrganizationID = 1
        AND (r.AccessRoleID = @ownerRole OR (r.AccessRoleID = @viewerRole AND p.DemoRead = 1))
        AND NOT EXISTS (SELECT 1 FROM dbo.AccessRolePermissions known
            WHERE known.OrganizationID = 1 AND known.AccessRoleID = r.AccessRoleID AND known.PermissionKey = p.PermissionKey);

    DECLARE @accounts TABLE (
        Email nvarchar(254) PRIMARY KEY,
        DisplayName nvarchar(150) NOT NULL,
        AccessRoleID int NOT NULL
    );
    INSERT INTO @accounts VALUES
        (N'dcrobb29@gmail.com', N'Doug', @ownerRole),
        (N'demo@overhead.example', N'Recruiter Demo', @viewerRole);

    IF EXISTS (SELECT 1 FROM dbo.Users u JOIN @accounts a ON a.Email = u.NormalizedEmail
        WHERE u.IsActive = 1 OR u.PasswordHash IS NOT NULL OR u.DisplayName <> a.DisplayName)
        THROW 51103, 'An initialization account is already activated, credentialed, or has different details. No account was overwritten.', 1;

    IF EXISTS (SELECT 1 FROM dbo.OrganizationMemberships m
        JOIN dbo.Users u ON u.UserID = m.UserID JOIN @accounts a ON a.Email = u.NormalizedEmail
        WHERE m.OrganizationID <> 1 OR m.IsActive = 0)
        THROW 51104, 'An initialization account has an unexpected membership. Review it manually.', 1;

    INSERT INTO dbo.Users (Email, DisplayName, IsActive, PasswordHash)
    SELECT a.Email, a.DisplayName, 0, NULL FROM @accounts a
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.NormalizedEmail = a.Email);

    INSERT INTO dbo.OrganizationMemberships (OrganizationID, UserID, IsActive)
    SELECT 1, u.UserID, 1 FROM dbo.Users u JOIN @accounts a ON a.Email = u.NormalizedEmail
    WHERE NOT EXISTS (SELECT 1 FROM dbo.OrganizationMemberships m WHERE m.OrganizationID = 1 AND m.UserID = u.UserID);

    IF EXISTS (SELECT 1 FROM dbo.MembershipAccessRoles mar
        JOIN dbo.OrganizationMemberships m ON m.MembershipID = mar.MembershipID AND m.OrganizationID = mar.OrganizationID
        JOIN dbo.Users u ON u.UserID = m.UserID JOIN @accounts a ON a.Email = u.NormalizedEmail
        WHERE mar.OrganizationID = 1 AND mar.AccessRoleID <> a.AccessRoleID)
        THROW 51105, 'An initialization account has unexpected role assignments. No roles were removed.', 1;

    INSERT INTO dbo.MembershipAccessRoles (OrganizationID, MembershipID, AccessRoleID)
    SELECT 1, m.MembershipID, a.AccessRoleID
    FROM dbo.OrganizationMemberships m JOIN dbo.Users u ON u.UserID = m.UserID
    JOIN @accounts a ON a.Email = u.NormalizedEmail
    WHERE m.OrganizationID = 1 AND NOT EXISTS (
        SELECT 1 FROM dbo.MembershipAccessRoles known
        WHERE known.OrganizationID = 1 AND known.MembershipID = m.MembershipID AND known.AccessRoleID = a.AccessRoleID);

    DECLARE @units TABLE (UnitName nvarchar(20) NOT NULL, Abbreviation nvarchar(10) PRIMARY KEY);
    INSERT INTO @units VALUES
        (N'Cubic Yard', N'CY'), (N'Day', N'DY'), (N'Each', N'EA'),
        (N'Gallon', N'GAL'), (N'Hour', N'HR'), (N'Pound', N'LB'),
        (N'Linear Foot', N'LF'), (N'Lump Sum', N'LS'), (N'Month', N'MO'),
        (N'Square Foot', N'SF'), (N'Ton', N'TN'), (N'Week', N'WK');

    IF EXISTS (SELECT 1 FROM dbo.UnitsOfMeasurement u
        JOIN @units wanted ON wanted.Abbreviation = RTRIM(u.[Unit Abbreviation])
        WHERE u.OrganizationID = 1 AND RTRIM(u.[Unit Name]) <> wanted.UnitName)
        THROW 51106, 'An existing unit abbreviation has a conflicting name. No presets were overwritten.', 1;
    IF EXISTS (SELECT 1 FROM dbo.UnitsOfMeasurement WHERE OrganizationID = 1
        GROUP BY [Unit Abbreviation] HAVING COUNT(*) > 1)
        THROW 51107, 'Duplicate unit abbreviations require manual review.', 1;

    INSERT INTO dbo.UnitsOfMeasurement (OrganizationID, [Unit Name], [Unit Abbreviation])
    SELECT 1, u.UnitName, u.Abbreviation FROM @units u
    WHERE NOT EXISTS (SELECT 1 FROM dbo.UnitsOfMeasurement known
        WHERE known.OrganizationID = 1 AND RTRIM(known.[Unit Abbreviation]) = u.Abbreviation);

    INSERT INTO dbo.Roles (OrganizationID, RoleName)
    SELECT 1, r.RoleName FROM (VALUES (N'CEO'), (N'VP'), (N'Project Manager')) r(RoleName)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles known WHERE known.OrganizationID = 1 AND known.RoleName = r.RoleName);

    -- Internal demo metadata only: no billing provider or paid subscription is implied.
    IF NOT EXISTS (SELECT 1 FROM dbo.SubscriptionPlans WHERE PlanKey = 'overhead-demo')
        INSERT INTO dbo.SubscriptionPlans (PlanKey, PlanName, IsTestPlan)
        VALUES ('overhead-demo', N'Internal portfolio demo', 1);
    DECLARE @planId int = (SELECT PlanID FROM dbo.SubscriptionPlans WHERE PlanKey = 'overhead-demo' AND IsTestPlan = 1);
    IF @planId IS NULL
        THROW 51108, 'The demo plan key is already assigned to a non-test plan.', 1;
    IF EXISTS (SELECT 1 FROM dbo.OrganizationSubscriptions WHERE OrganizationID = 1
        AND (PlanID <> @planId OR Status <> 'Active' OR SeatLimit <> 2 OR SeatLimit IS NULL
            OR TrialEndsAt IS NOT NULL OR BillingProvider IS NOT NULL OR ProviderSubscriptionID IS NOT NULL))
        THROW 51109, 'Existing subscription metadata differs from the internal demo. No subscription was overwritten.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.OrganizationSubscriptions WHERE OrganizationID = 1)
        INSERT INTO dbo.OrganizationSubscriptions (OrganizationID, PlanID, Status, SeatLimit)
        VALUES (1, @planId, 'Active', 2);

    IF NOT EXISTS (SELECT 1 FROM dbo.OrganizationInvoiceSettings WHERE OrganizationID = 1)
        INSERT INTO dbo.OrganizationInvoiceSettings (OrganizationID, CompanyName) VALUES (1, N'Overhead Demo');

    IF (SELECT COUNT(*) FROM dbo.AccessRolePermissions WHERE OrganizationID = 1 AND AccessRoleID = @ownerRole) <> 17
        OR (SELECT COUNT(*) FROM dbo.AccessRolePermissions WHERE OrganizationID = 1 AND AccessRoleID = @viewerRole) <> 7
        THROW 51110, 'Permission verification failed; initialization will roll back.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    SET IDENTITY_INSERT dbo.Organizations OFF;
    THROW;
END CATCH;

SELECT OrganizationID, OrganizationKey, OrganizationName, Status FROM dbo.Organizations WHERE OrganizationID = 1;
SELECT u.Email, u.DisplayName, u.IsActive, ar.RoleKey,
    CASE WHEN u.PasswordHash IS NULL THEN 'Not provisioned' ELSE 'Provisioned' END AS PasswordState
FROM dbo.Users u
JOIN dbo.OrganizationMemberships m ON m.UserID = u.UserID AND m.OrganizationID = 1
JOIN dbo.MembershipAccessRoles mar ON mar.MembershipID = m.MembershipID AND mar.OrganizationID = m.OrganizationID
JOIN dbo.AccessRoles ar ON ar.AccessRoleID = mar.AccessRoleID AND ar.OrganizationID = mar.OrganizationID
WHERE u.NormalizedEmail IN (N'dcrobb29@gmail.com', N'demo@overhead.example');
SELECT ar.RoleKey, COUNT(*) AS PermissionCount FROM dbo.AccessRoles ar
JOIN dbo.AccessRolePermissions p ON p.AccessRoleID = ar.AccessRoleID AND p.OrganizationID = ar.OrganizationID
WHERE ar.OrganizationID = 1 AND ar.RoleKey IN ('Owner', 'Viewer') GROUP BY ar.RoleKey;
SELECT RTRIM([Unit Name]) AS UnitName, RTRIM([Unit Abbreviation]) AS Abbreviation
FROM dbo.UnitsOfMeasurement WHERE OrganizationID = 1 ORDER BY [Unit Abbreviation];
SELECT RoleName FROM dbo.Roles WHERE OrganizationID = 1 ORDER BY RoleName;
PRINT 'Initialization complete. Both accounts are inactive with no passwords. Secure authentication before activation.';
