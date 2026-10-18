-- Controlled, synthetic fixtures for live manual two-organization verification.
-- Run only by an operator connected directly to overhead-testdb after reviewing
-- this file. This script writes no credentials, creates no SQL principals, and
-- does not modify the existing Overhead Demo organization or its users.
-- Pair only with live-two-org-security-fixture-cleanup.sql.
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
    THROW 51200, 'Connect directly to overhead-testdb before running the live two-organization fixture setup.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @OrganizationAKey varchar(80) = 'manual-secverify-20261016-7f29d2e6-a';
    DECLARE @OrganizationBKey varchar(80) = 'manual-secverify-20261016-7f29d2e6-b';
    DECLARE @MarkerA nvarchar(60) = N'SECVERIFY-20261016-7F29D2E6-A';
    DECLARE @MarkerB nvarchar(60) = N'SECVERIFY-20261016-7F29D2E6-B';
    DECLARE @Today date = CONVERT(date, SYSUTCDATETIME());
    DECLARE @OrganizationAID int;
    DECLARE @OrganizationBID int;

    IF OBJECT_ID(N'dbo.Organizations', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Users', N'U') IS NULL
       OR OBJECT_ID(N'dbo.UserIdentities', N'U') IS NULL
       OR OBJECT_ID(N'dbo.OrganizationMemberships', N'U') IS NULL
       OR OBJECT_ID(N'dbo.MembershipAccessRoles', N'U') IS NULL
       OR OBJECT_ID(N'dbo.AccessRoles', N'U') IS NULL
       OR OBJECT_ID(N'dbo.AccessRolePermissions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Permissions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.SampleDataRecords', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Roles', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Employees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.EmployeeHistory', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Customers', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Projects', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Bills', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Invoices', N'U') IS NULL
        THROW 51201, 'Required baseline, organization, customer, personnel, invoice, bill, or sample-tracking tables are missing.', 1;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.Organizations
        WHERE OrganizationID = 1
          AND OrganizationKey = 'overhead-demo'
          AND OrganizationName = N'Overhead Demo'
          AND Status = 'Active'
    )
        THROW 51202, 'Expected existing OrganizationID 1 (Overhead Demo, Active) was not found unchanged.', 1;

    IF (SELECT COUNT_BIG(*) FROM dbo.OrganizationMemberships WHERE OrganizationID = 1) <> 2
        THROW 51203, 'Expected exactly two existing Overhead Demo memberships; review the live database before continuing.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.Organizations
        WHERE OrganizationKey IN (@OrganizationAKey, @OrganizationBKey)
           OR OrganizationName IN (
                N'LIVE MANUAL SECURITY VERIFICATION A',
                N'LIVE MANUAL SECURITY VERIFICATION B'
           )
    )
        THROW 51204, 'A uniquely marked fixture organization already exists. Setup is fail-closed; inspect it and use the paired cleanup script if appropriate.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.Users
        WHERE NormalizedEmail IN (
            N'secverify-a-owner@security-fixture.invalid',
            N'secverify-a-viewer@security-fixture.invalid',
            N'secverify-b-owner@security-fixture.invalid',
            N'secverify-b-viewer@security-fixture.invalid'
        )
    )
        THROW 51205, 'A reserved synthetic fixture email already belongs to a user. No existing identity will be changed.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.Bills
        WHERE [id] IN (N'SVA-B-0001', N'SVB-B-0001')
    ) OR EXISTS (
        SELECT 1 FROM dbo.Invoices
        WHERE [Invoice No] IN (N'SVA-261016', N'SVB-261016')
    )
        THROW 51206, 'A fixture bill or invoice business key already exists. No existing record will be changed.', 1;

    DECLARE @RequiredPermissions TABLE (
        PermissionKey varchar(64) NOT NULL PRIMARY KEY,
        ReadOnlyGrant bit NOT NULL
    );
    INSERT INTO @RequiredPermissions (PermissionKey, ReadOnlyGrant) VALUES
        ('catalogs.read', 1),
        ('catalogs.write', 0),
        ('customers.read', 1),
        ('customers.write', 0),
        ('finances.read', 1),
        ('finances.write', 0),
        ('members.manage', 0),
        ('organization.manage', 0),
        ('personnel.read', 1),
        ('personnel.write', 0),
        ('planning.read', 1),
        ('planning.write', 0),
        ('projects.read', 1),
        ('projects.write', 0),
        ('sales.read', 1),
        ('sales.write', 0),
        ('subscription.manage', 0);

    IF EXISTS (
        SELECT 1
        FROM @RequiredPermissions wanted
        LEFT JOIN dbo.Permissions existing ON existing.PermissionKey = wanted.PermissionKey
        WHERE existing.PermissionKey IS NULL
    )
        THROW 51207, 'The existing application permission catalog is incomplete. Apply/review its approved seed before creating test organizations.', 1;

    DECLARE @TenantTables TABLE (TableName sysname NOT NULL PRIMARY KEY);
    INSERT INTO @TenantTables (TableName) VALUES
        (N'AccessRoles'), (N'AccessRolePermissions'), (N'OrganizationMemberships'),
        (N'MembershipAccessRoles'), (N'Roles'), (N'Employees'), (N'EmployeeHistory'),
        (N'Customers'), (N'Projects'), (N'Bills'), (N'Invoices');

    IF EXISTS (
        SELECT 1
        FROM @TenantTables t
        WHERE COL_LENGTH(N'dbo.' + QUOTENAME(t.TableName), N'OrganizationID') IS NULL
    )
        THROW 51208, 'A required tenant table lacks OrganizationID. Review the live schema instead of relying on legacy defaults.', 1;

    IF EXISTS (
        SELECT 1
        FROM @TenantTables t
        JOIN sys.default_constraints dc
          ON dc.parent_object_id = OBJECT_ID(N'dbo.' + QUOTENAME(t.TableName))
        JOIN sys.columns c
          ON c.object_id = dc.parent_object_id
         AND c.column_id = dc.parent_column_id
        WHERE c.name = N'OrganizationID'
    )
        THROW 51209, 'A legacy OrganizationID default remains on a target table. Remove/review it before this explicit-tenant fixture setup.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys fk
        WHERE (
            fk.parent_object_id IN (
                SELECT t.object_id
                FROM sys.tables t
                JOIN sys.schemas sc ON sc.schema_id = t.schema_id
                JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'OrganizationID'
                WHERE sc.name = N'dbo'
            )
            OR fk.referenced_object_id IN (
                SELECT t.object_id
                FROM sys.tables t
                JOIN sys.schemas sc ON sc.schema_id = t.schema_id
                JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'OrganizationID'
                WHERE sc.name = N'dbo'
            )
            OR fk.parent_object_id = OBJECT_ID(N'dbo.Users')
            OR fk.referenced_object_id = OBJECT_ID(N'dbo.Users')
        )
          AND (fk.is_disabled = 1 OR fk.is_not_trusted = 1)
    )
        THROW 51210, 'A tenant-related or user-related foreign key is disabled or untrusted. No constraints will be changed by this script.', 1;

    DECLARE @FixtureOrganizations TABLE (
        Fixture char(1) NOT NULL PRIMARY KEY,
        OrganizationID int NOT NULL UNIQUE,
        OrganizationKey varchar(80) NOT NULL UNIQUE,
        Marker nvarchar(60) NOT NULL
    );

    INSERT INTO dbo.Organizations
        (OrganizationKey, OrganizationName, Status, CreatedAt)
    VALUES
        (@OrganizationAKey, N'LIVE MANUAL SECURITY VERIFICATION A', 'Active', SYSUTCDATETIME());
    SET @OrganizationAID = CONVERT(int, SCOPE_IDENTITY());

    INSERT INTO dbo.Organizations
        (OrganizationKey, OrganizationName, Status, CreatedAt)
    VALUES
        (@OrganizationBKey, N'LIVE MANUAL SECURITY VERIFICATION B', 'Active', SYSUTCDATETIME());
    SET @OrganizationBID = CONVERT(int, SCOPE_IDENTITY());

    INSERT INTO @FixtureOrganizations (Fixture, OrganizationID, OrganizationKey, Marker)
    VALUES
        ('A', @OrganizationAID, @OrganizationAKey, @MarkerA),
        ('B', @OrganizationBID, @OrganizationBKey, @MarkerB);

    DECLARE @FixtureAccounts TABLE (
        Fixture char(1) NOT NULL,
        RoleKey varchar(32) NOT NULL,
        Email nvarchar(254) NOT NULL PRIMARY KEY,
        DisplayName nvarchar(150) NOT NULL
    );
    INSERT INTO @FixtureAccounts (Fixture, RoleKey, Email, DisplayName) VALUES
        ('A', 'Owner', N'secverify-a-owner@security-fixture.invalid', N'Synthetic Owner A (SECVERIFY)'),
        ('A', 'Viewer', N'secverify-a-viewer@security-fixture.invalid', N'Synthetic Read-only A (SECVERIFY)'),
        ('B', 'Owner', N'secverify-b-owner@security-fixture.invalid', N'Synthetic Owner B (SECVERIFY)'),
        ('B', 'Viewer', N'secverify-b-viewer@security-fixture.invalid', N'Synthetic Read-only B (SECVERIFY)');

    DECLARE @CreatedUsers TABLE (UserID int NOT NULL, Email nvarchar(254) NOT NULL);
    INSERT INTO dbo.Users (Email, DisplayName, IsActive, CreatedAt, PasswordHash)
    OUTPUT inserted.UserID, inserted.Email INTO @CreatedUsers (UserID, Email)
    SELECT Email, DisplayName, 0, SYSUTCDATETIME(), NULL
    FROM @FixtureAccounts;

    DECLARE @FixtureUsers TABLE (
        Fixture char(1) NOT NULL,
        RoleKey varchar(32) NOT NULL,
        OrganizationID int NOT NULL,
        UserID int NOT NULL UNIQUE,
        Email nvarchar(254) NOT NULL UNIQUE,
        DisplayName nvarchar(150) NOT NULL
    );
    INSERT INTO @FixtureUsers (Fixture, RoleKey, OrganizationID, UserID, Email, DisplayName)
    SELECT a.Fixture, a.RoleKey, o.OrganizationID, created.UserID, a.Email, a.DisplayName
    FROM @FixtureAccounts a
    JOIN @CreatedUsers created ON created.Email = a.Email
    JOIN @FixtureOrganizations o ON o.Fixture = a.Fixture;

    DECLARE @FixtureRoles TABLE (
        Fixture char(1) NULL,
        OrganizationID int NOT NULL,
        AccessRoleID int NOT NULL UNIQUE,
        RoleKey varchar(32) NOT NULL,
        RoleName nvarchar(80) NOT NULL
    );
    INSERT INTO dbo.AccessRoles (OrganizationID, RoleKey, RoleName)
    OUTPUT inserted.OrganizationID, inserted.AccessRoleID, inserted.RoleKey, inserted.RoleName
        INTO @FixtureRoles (OrganizationID, AccessRoleID, RoleKey, RoleName)
    SELECT o.OrganizationID, r.RoleKey, CONCAT(o.Marker, N' ', r.RoleName)
    FROM @FixtureOrganizations o
    CROSS JOIN (VALUES ('Owner', N'Owner'), ('Viewer', N'Recruiter Viewer')) r(RoleKey, RoleName);

    UPDATE roles
    SET Fixture = o.Fixture
    FROM @FixtureRoles roles
    JOIN @FixtureOrganizations o ON o.OrganizationID = roles.OrganizationID;

    INSERT INTO dbo.AccessRolePermissions (OrganizationID, AccessRoleID, PermissionKey)
    SELECT roles.OrganizationID, roles.AccessRoleID, p.PermissionKey
    FROM @FixtureRoles roles
    JOIN @RequiredPermissions p
      ON roles.RoleKey = 'Owner'
      OR (roles.RoleKey = 'Viewer' AND p.ReadOnlyGrant = 1);

    DECLARE @FixtureMemberships TABLE (
        Fixture char(1) NOT NULL,
        OrganizationID int NOT NULL,
        UserID int NOT NULL UNIQUE,
        MembershipID int NOT NULL UNIQUE
    );
    DECLARE @CreatedMemberships TABLE (
        OrganizationID int NOT NULL,
        UserID int NOT NULL,
        MembershipID int NOT NULL
    );
    INSERT INTO dbo.OrganizationMemberships (OrganizationID, UserID, IsActive, CreatedAt)
    OUTPUT inserted.OrganizationID, inserted.UserID, inserted.MembershipID
        INTO @CreatedMemberships (OrganizationID, UserID, MembershipID)
    SELECT OrganizationID, UserID, 1, SYSUTCDATETIME()
    FROM @FixtureUsers;

    INSERT INTO @FixtureMemberships (Fixture, OrganizationID, UserID, MembershipID)
    SELECT u.Fixture, u.OrganizationID, u.UserID, created.MembershipID
    FROM @FixtureUsers u
    JOIN @CreatedMemberships created
      ON created.OrganizationID = u.OrganizationID
     AND created.UserID = u.UserID;

    INSERT INTO dbo.MembershipAccessRoles (OrganizationID, MembershipID, AccessRoleID)
    SELECT m.OrganizationID, m.MembershipID, r.AccessRoleID
    FROM @FixtureMemberships m
    JOIN @FixtureUsers u ON u.UserID = m.UserID
    JOIN @FixtureRoles r
      ON r.OrganizationID = m.OrganizationID
     AND r.RoleKey = u.RoleKey;

    DECLARE @FixturePersonnelRoles TABLE (
        Fixture char(1) NOT NULL,
        OrganizationID int NOT NULL,
        RoleID int NOT NULL UNIQUE,
        RoleName nvarchar(80) NOT NULL
    );
    DECLARE @CreatedPersonnelRoles TABLE (
        OrganizationID int NOT NULL,
        RoleID int NOT NULL,
        RoleName nvarchar(80) NOT NULL
    );
    INSERT INTO dbo.Roles (OrganizationID, RoleName)
    OUTPUT inserted.OrganizationID, inserted.RoleID, inserted.RoleName
        INTO @CreatedPersonnelRoles (OrganizationID, RoleID, RoleName)
    SELECT OrganizationID, CONCAT(Marker, N' Synthetic Technician')
    FROM @FixtureOrganizations;

    INSERT INTO @FixturePersonnelRoles (Fixture, OrganizationID, RoleID, RoleName)
    SELECT o.Fixture, o.OrganizationID, created.RoleID, created.RoleName
    FROM @FixtureOrganizations o
    JOIN @CreatedPersonnelRoles created ON created.OrganizationID = o.OrganizationID;

    DECLARE @FixtureEmployees TABLE (
        Fixture char(1) NOT NULL,
        OrganizationID int NOT NULL,
        EmployeeID int NOT NULL UNIQUE,
        EmployeeName nvarchar(200) NOT NULL
    );
    DECLARE @CreatedEmployees TABLE (
        OrganizationID int NOT NULL,
        EmployeeID int NOT NULL,
        EmployeeName nvarchar(200) NOT NULL
    );
    INSERT INTO dbo.Employees
        (EmployeeName, RoleID, ManagerID, OrganizationID, IsActive)
    OUTPUT inserted.OrganizationID, inserted.EmployeeID, inserted.EmployeeName
        INTO @CreatedEmployees (OrganizationID, EmployeeID, EmployeeName)
    SELECT CONCAT(o.Marker, N' Synthetic Technician'), r.RoleID, NULL, o.OrganizationID, 1
    FROM @FixtureOrganizations o
    JOIN @FixturePersonnelRoles r ON r.OrganizationID = o.OrganizationID;

    INSERT INTO @FixtureEmployees (Fixture, OrganizationID, EmployeeID, EmployeeName)
    SELECT o.Fixture, created.OrganizationID, created.EmployeeID, created.EmployeeName
    FROM @FixtureOrganizations o
    JOIN @CreatedEmployees created ON created.OrganizationID = o.OrganizationID;

    DECLARE @CreatedCustomers TABLE (
        OrganizationID int NOT NULL,
        CustomerID int NOT NULL,
        CustomerEmail nvarchar(254) NOT NULL,
        CompanyName nvarchar(150) NOT NULL
    );
    INSERT INTO dbo.Customers (
        FirstName, LastName, CompanyName, Email, Phone,
        BillingAddressLine1, BillingAddressLine2, BillingAddressCity, BillingAddressState, BillingAddressZip,
        ShippingAddressLine1, ShippingAddressLine2, ShippingAddressCity, ShippingAddressState, ShippingAddressZip,
        IsActive, CreatedAt, UpdatedAt, OrganizationID
    )
    OUTPUT inserted.OrganizationID, inserted.CustomerID, inserted.Email, inserted.CompanyName
        INTO @CreatedCustomers (OrganizationID, CustomerID, CustomerEmail, CompanyName)
    SELECT
        N'Synthetic', o.Fixture, CONCAT(o.Marker, N' Synthetic Customer'),
        CONCAT(N'customer-', LOWER(o.Fixture), N'@security-fixture.invalid'), N'(555) 010-2026',
        N'100 Synthetic Test Way', NULL, N'Test City', N'CO', N'80000',
        N'100 Synthetic Test Way', NULL, N'Test City', N'CO', N'80000',
        1, SYSUTCDATETIME(), SYSUTCDATETIME(), o.OrganizationID
    FROM @FixtureOrganizations o;

    DECLARE @CreatedProjects TABLE (
        OrganizationID int NOT NULL,
        ProjectID int NOT NULL,
        ProjectName nvarchar(150) NOT NULL,
        CustomerID int NOT NULL
    );
    INSERT INTO dbo.Projects (
        ProjectName, CreatedAt, AcceptedEstimateRevisionID, ProjectStatus,
        ProjectManagerID, EngagementType, RecurrenceFrequency, RouteID,
        ExpectedStartDate, ExpectedEndDate, InternalNotes, CustomerNotes,
        CustomerID, OrganizationID
    )
    OUTPUT inserted.OrganizationID, inserted.ProjectID, inserted.ProjectName, inserted.CustomerID
        INTO @CreatedProjects (OrganizationID, ProjectID, ProjectName, CustomerID)
    SELECT
        CONCAT(o.Marker, N' Synthetic Project'), SYSUTCDATETIME(), NULL, 'Active',
        e.EmployeeID, 'Project', NULL, NULL,
        @Today, DATEADD(day, 30, @Today),
        CONCAT(N'Synthetic security verification fixture ', o.Marker),
        N'Synthetic project only; no real customer information.',
        c.CustomerID, o.OrganizationID
    FROM @FixtureOrganizations o
    JOIN @CreatedCustomers c ON c.OrganizationID = o.OrganizationID
    JOIN @FixtureEmployees e ON e.OrganizationID = o.OrganizationID;

    DECLARE @CreatedBills TABLE (
        OrganizationID int NOT NULL,
        BillID nchar(10) NOT NULL,
        BillNo nchar(10) NOT NULL
    );
    INSERT INTO dbo.Bills (
        [id], [Bill No], [Bill Date], [Bill Due Date], [Bill Paid Date],
        [Bill Amount], [Company Name], [Billing Address Line 1], [Billing Address Line 2],
        [Billing Address City], [Billing Address State], [Billing Address Zip],
        ProjectID, IsSplit, OrganizationID
    )
    OUTPUT inserted.OrganizationID, inserted.[id], inserted.[Bill No]
        INTO @CreatedBills (OrganizationID, BillID, BillNo)
    SELECT
        CASE o.Fixture WHEN 'A' THEN N'SVA-B-0001' ELSE N'SVB-B-0001' END,
        CASE o.Fixture WHEN 'A' THEN N'SVA-B-0001' ELSE N'SVB-B-0001' END,
        @Today, DATEADD(day, 30, @Today), NULL, N'1250.00',
        CASE o.Fixture WHEN 'A' THEN N'TestVend A' ELSE N'TestVend B' END,
        N'100 Synthetic Test Way', NULL, N'Test City', N'CO', N'80000',
        p.ProjectID, 0, o.OrganizationID
    FROM @FixtureOrganizations o
    JOIN @CreatedProjects p ON p.OrganizationID = o.OrganizationID;

    DECLARE @CreatedInvoices TABLE (
        OrganizationID int NOT NULL,
        InvoiceID int NOT NULL,
        InvoiceNo nchar(10) NOT NULL
    );
    INSERT INTO dbo.Invoices (
        [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Amount],
        [First Name], [Last Name], [Company Name],
        [Billing Address Line 1], [Billing Address Line 2], [Billing Address City],
        [Billing Address State], [Billing Address Zip],
        [Shipping Address Line 1], [Shipping Address Line 2], [Shipping Address City],
        [Shipping Address State], [Shipping Address Zip],
        [Invoice Paid Date], ProjectID, CustomerID, IsProjectBilling,
        InternalNotes, CustomerNotes, OrganizationID, LastEmailedAt, LastEmailedTo
    )
    OUTPUT inserted.OrganizationID, inserted.id, inserted.[Invoice No]
        INTO @CreatedInvoices (OrganizationID, InvoiceID, InvoiceNo)
    SELECT
        CASE o.Fixture WHEN 'A' THEN N'SVA-261016' ELSE N'SVB-261016' END,
        @Today, DATEADD(day, 30, @Today), N'2500.00',
        N'Synthetic', o.Fixture, c.CompanyName,
        N'100 Synthetic Test Way', NULL, N'Test City', N'CO', N'80000',
        N'100 Synthetic Test Way', NULL, N'Test City', N'CO', N'80000',
        NULL, p.ProjectID, c.CustomerID, 0,
        CONCAT(N'Synthetic security verification fixture ', o.Marker),
        N'Synthetic invoice only; no real customer information.',
        o.OrganizationID, NULL, NULL
    FROM @FixtureOrganizations o
    JOIN @CreatedCustomers c ON c.OrganizationID = o.OrganizationID
    JOIN @CreatedProjects p ON p.OrganizationID = o.OrganizationID;

    INSERT INTO dbo.EmployeeHistory (EmployeeID, EventDate, Notes, OrganizationID)
    SELECT e.EmployeeID, @Today, CONCAT(N'Synthetic onboarding history ', o.Marker), o.OrganizationID
    FROM @FixtureOrganizations o
    JOIN @FixtureEmployees e ON e.OrganizationID = o.OrganizationID;

    -- Track the exact inserted primary keys for cleanup and the baseline's
    -- sample-aware guards. No application or database rows are deleted here.
    INSERT INTO dbo.SampleDataRecords (OrganizationID, TableName, RecordKey)
    SELECT OrganizationID, N'Organizations', CONVERT(nvarchar(100), OrganizationID)
    FROM @FixtureOrganizations
    UNION ALL
    SELECT OrganizationID, N'Users', CONVERT(nvarchar(100), UserID) FROM @FixtureUsers
    UNION ALL
    SELECT OrganizationID, N'AccessRoles', CONVERT(nvarchar(100), AccessRoleID) FROM @FixtureRoles
    UNION ALL
    SELECT OrganizationID, N'OrganizationMemberships', CONVERT(nvarchar(100), MembershipID) FROM @FixtureMemberships
    UNION ALL
    SELECT m.OrganizationID, N'MembershipAccessRoles',
        CONCAT(m.MembershipID, N':', r.AccessRoleID)
    FROM @FixtureMemberships m
    JOIN @FixtureUsers u ON u.UserID = m.UserID
    JOIN @FixtureRoles r ON r.OrganizationID = m.OrganizationID AND r.RoleKey = u.RoleKey
    UNION ALL
    SELECT OrganizationID, N'AccessRolePermissions',
        CONCAT(OrganizationID, N':', AccessRoleID, N':', PermissionKey)
    FROM dbo.AccessRolePermissions
    WHERE OrganizationID IN (@OrganizationAID, @OrganizationBID)
    UNION ALL
    SELECT OrganizationID, N'Roles', CONVERT(nvarchar(100), RoleID) FROM @FixturePersonnelRoles
    UNION ALL
    SELECT OrganizationID, N'Employees', CONVERT(nvarchar(100), EmployeeID) FROM @FixtureEmployees
    UNION ALL
    SELECT OrganizationID, N'EmployeeHistory', CONVERT(nvarchar(100), EmployeeHistoryID)
    FROM dbo.EmployeeHistory
    WHERE OrganizationID IN (@OrganizationAID, @OrganizationBID)
      AND Notes IN (
          CONCAT(N'Synthetic onboarding history ', @MarkerA),
          CONCAT(N'Synthetic onboarding history ', @MarkerB)
      )
    UNION ALL
    SELECT OrganizationID, N'Customers', CONVERT(nvarchar(100), CustomerID) FROM @CreatedCustomers
    UNION ALL
    SELECT OrganizationID, N'Projects', CONVERT(nvarchar(100), ProjectID) FROM @CreatedProjects
    UNION ALL
    SELECT OrganizationID, N'Bills', RTRIM(CONVERT(nvarchar(100), BillID)) FROM @CreatedBills
    UNION ALL
    SELECT OrganizationID, N'Invoices', CONVERT(nvarchar(100), InvoiceID) FROM @CreatedInvoices;

    IF (SELECT COUNT(*) FROM dbo.AccessRolePermissions WHERE OrganizationID = @OrganizationAID) <> 24
       OR (SELECT COUNT(*) FROM dbo.AccessRolePermissions WHERE OrganizationID = @OrganizationBID) <> 24
       OR EXISTS (
            SELECT 1
            FROM @FixtureOrganizations o
            JOIN @FixtureRoles r ON r.OrganizationID = o.OrganizationID
            WHERE r.RoleKey = 'Owner'
              AND (SELECT COUNT(*) FROM dbo.AccessRolePermissions p
                   WHERE p.OrganizationID = r.OrganizationID AND p.AccessRoleID = r.AccessRoleID) <> 17
       )
       OR EXISTS (
            SELECT 1
            FROM @FixtureOrganizations o
            JOIN @FixtureRoles r ON r.OrganizationID = o.OrganizationID
            WHERE r.RoleKey = 'Viewer'
              AND (SELECT COUNT(*) FROM dbo.AccessRolePermissions p
                   WHERE p.OrganizationID = r.OrganizationID AND p.AccessRoleID = r.AccessRoleID) <> 7
       )
        THROW 51211, 'The fixture grants did not match the expected Owner (17) and read-only Viewer (7) permissions.', 1;

    IF EXISTS (
        SELECT 1
        FROM @FixtureUsers expected
        JOIN dbo.Users actual ON actual.UserID = expected.UserID
        WHERE actual.IsActive <> 0 OR actual.PasswordHash IS NOT NULL
    )
        THROW 51212, 'A synthetic fixture user was unexpectedly activated or credentialed during setup.', 1;

    SELECT o.Fixture, o.OrganizationID, o.OrganizationKey, o.Marker
    FROM @FixtureOrganizations o
    ORDER BY o.Fixture;

    SELECT expected.Fixture, expected.RoleKey, actual.Email, actual.UserID, actual.IsActive,
           CASE WHEN actual.PasswordHash IS NULL THEN N'Not provisioned' ELSE N'Unexpectedly provisioned' END AS PasswordState
    FROM @FixtureUsers expected
    JOIN dbo.Users actual ON actual.UserID = expected.UserID
    ORDER BY expected.Fixture, expected.RoleKey;

    SELECT o.Fixture, r.RoleKey, COUNT(p.PermissionKey) AS PermissionCount
    FROM @FixtureOrganizations o
    JOIN @FixtureRoles r ON r.OrganizationID = o.OrganizationID
    LEFT JOIN dbo.AccessRolePermissions p
      ON p.OrganizationID = r.OrganizationID
     AND p.AccessRoleID = r.AccessRoleID
    GROUP BY o.Fixture, r.RoleKey
    ORDER BY o.Fixture, r.RoleKey;

    SELECT o.Fixture,
           (SELECT COUNT(*) FROM dbo.Customers c WHERE c.OrganizationID = o.OrganizationID) AS CustomerCount,
           (SELECT COUNT(*) FROM dbo.Projects p WHERE p.OrganizationID = o.OrganizationID) AS ProjectCount,
           (SELECT COUNT(*) FROM dbo.Bills b WHERE b.OrganizationID = o.OrganizationID) AS BillCount,
           (SELECT COUNT(*) FROM dbo.Invoices i WHERE i.OrganizationID = o.OrganizationID) AS InvoiceCount,
           (SELECT COUNT(*) FROM dbo.Employees e WHERE e.OrganizationID = o.OrganizationID) AS EmployeeCount,
           (SELECT COUNT(*) FROM dbo.EmployeeHistory h WHERE h.OrganizationID = o.OrganizationID) AS EmployeeHistoryCount
    FROM @FixtureOrganizations o
    ORDER BY o.Fixture;

    SELECT OrganizationID, OrganizationKey, OrganizationName, Status,
           (SELECT COUNT(*) FROM dbo.OrganizationMemberships m WHERE m.OrganizationID = 1) AS MembershipCount
    FROM dbo.Organizations
    WHERE OrganizationID = 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
