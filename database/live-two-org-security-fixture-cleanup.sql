-- Surgical rollback for live-two-org-security-fixture-setup.sql.
-- Run only by an operator connected directly to overhead-testdb after review.
-- Deletes only rows whose exact primary keys were tracked by the paired setup.
-- It refuses unknown or additional tenant data; it never disables constraints,
-- uses CASCADE, or deletes the existing Overhead Demo organization.
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
    THROW 51220, 'Connect directly to overhead-testdb before running the live two-organization fixture cleanup.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @OrganizationAKey varchar(80) = 'manual-secverify-20261016-7f29d2e6-a';
    DECLARE @OrganizationBKey varchar(80) = 'manual-secverify-20261016-7f29d2e6-b';
    DECLARE @MarkerA nvarchar(60) = N'SECVERIFY-20261016-7F29D2E6-A';
    DECLARE @MarkerB nvarchar(60) = N'SECVERIFY-20261016-7F29D2E6-B';
    DECLARE @OrganizationAID int;
    DECLARE @OrganizationBID int;
    DECLARE @OrganizationCount int;

    IF OBJECT_ID(N'dbo.Organizations', N'U') IS NULL
       OR OBJECT_ID(N'dbo.SampleDataRecords', N'U') IS NULL
        THROW 51221, 'Organizations or SampleDataRecords is missing; no cleanup was attempted.', 1;

    SELECT @OrganizationCount = COUNT(*)
    FROM dbo.Organizations
    WHERE OrganizationKey IN (@OrganizationAKey, @OrganizationBKey);

    IF @OrganizationCount = 0
    BEGIN
        IF EXISTS (
            SELECT 1 FROM dbo.Users
            WHERE NormalizedEmail IN (
                N'secverify-a-owner@security-fixture.invalid',
                N'secverify-a-viewer@security-fixture.invalid',
                N'secverify-b-owner@security-fixture.invalid',
                N'secverify-b-viewer@security-fixture.invalid'
            )
        ) OR EXISTS (SELECT 1 FROM dbo.Bills WHERE [id] IN (N'SVA-B-0001', N'SVB-B-0001'))
          OR EXISTS (SELECT 1 FROM dbo.Invoices WHERE [Invoice No] IN (N'SVA-261016', N'SVB-261016'))
          OR EXISTS (SELECT 1 FROM dbo.AccessRoles WHERE RoleName IN (
                CONCAT(@MarkerA, N' Owner'), CONCAT(@MarkerA, N' Recruiter Viewer'),
                CONCAT(@MarkerB, N' Owner'), CONCAT(@MarkerB, N' Recruiter Viewer')
            ))
          OR EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName IN (
                CONCAT(@MarkerA, N' Synthetic Technician'),
                CONCAT(@MarkerB, N' Synthetic Technician')
            ))
          OR EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeName IN (
                CONCAT(@MarkerA, N' Synthetic Technician'),
                CONCAT(@MarkerB, N' Synthetic Technician')
            ))
          OR EXISTS (SELECT 1 FROM dbo.EmployeeHistory WHERE Notes IN (
                CONCAT(N'Synthetic onboarding history ', @MarkerA),
                CONCAT(N'Synthetic onboarding history ', @MarkerB)
            ))
          OR EXISTS (SELECT 1 FROM dbo.Customers WHERE
                Email IN (N'customer-a@security-fixture.invalid', N'customer-b@security-fixture.invalid')
                OR CompanyName IN (
                    CONCAT(@MarkerA, N' Synthetic Customer'),
                    CONCAT(@MarkerB, N' Synthetic Customer')
                ))
          OR EXISTS (SELECT 1 FROM dbo.Projects WHERE ProjectName IN (
                CONCAT(@MarkerA, N' Synthetic Project'),
                CONCAT(@MarkerB, N' Synthetic Project')
            ))
            THROW 51222, 'Fixture organization keys are absent but one or more exact fixture sentinels remain. Review orphaned rows manually; nothing was deleted.', 1;

        COMMIT TRANSACTION;
        PRINT 'No fixture organizations or exact user/bill/invoice sentinels remain; cleanup is a no-op.';
        RETURN;
    END;

    IF @OrganizationCount <> 2
        THROW 51223, 'Only one uniquely marked fixture organization was found. Cleanup refuses partial or ambiguous ownership.', 1;

    SELECT @OrganizationAID = OrganizationID
    FROM dbo.Organizations
    WHERE OrganizationKey = @OrganizationAKey;
    SELECT @OrganizationBID = OrganizationID
    FROM dbo.Organizations
    WHERE OrganizationKey = @OrganizationBKey;

    DECLARE @FixtureOrganizations TABLE (
        OrganizationID int NOT NULL PRIMARY KEY,
        OrganizationKey varchar(80) NOT NULL UNIQUE
    );
    INSERT INTO @FixtureOrganizations (OrganizationID, OrganizationKey)
    VALUES (@OrganizationAID, @OrganizationAKey), (@OrganizationBID, @OrganizationBKey);

    DECLARE @ExpectedTracking TABLE (
        TableName sysname NOT NULL PRIMARY KEY,
        RowsPerOrganization int NOT NULL
    );
    INSERT INTO @ExpectedTracking (TableName, RowsPerOrganization) VALUES
        (N'Organizations', 1),
        (N'Users', 2),
        (N'AccessRoles', 2),
        (N'OrganizationMemberships', 2),
        (N'MembershipAccessRoles', 2),
        (N'AccessRolePermissions', 24),
        (N'Roles', 1),
        (N'Employees', 1),
        (N'EmployeeHistory', 1),
        (N'Customers', 1),
        (N'Projects', 1),
        (N'Bills', 1),
        (N'Invoices', 1);

    IF EXISTS (
        SELECT 1
        FROM dbo.SampleDataRecords s
        JOIN @FixtureOrganizations o ON o.OrganizationID = s.OrganizationID
        WHERE NOT EXISTS (
            SELECT 1 FROM @ExpectedTracking e WHERE e.TableName = s.TableName
        )
    )
        THROW 51224, 'Unexpected tracked table rows exist in a fixture organization. Remove/review manually added data before cleanup.', 1;

    IF EXISTS (
        SELECT 1
        FROM @FixtureOrganizations o
        CROSS JOIN @ExpectedTracking e
        LEFT JOIN dbo.SampleDataRecords s
          ON s.OrganizationID = o.OrganizationID
         AND s.TableName = e.TableName
        GROUP BY o.OrganizationID, e.TableName, e.RowsPerOrganization
        HAVING COUNT(s.SampleRecordID) <> e.RowsPerOrganization
    )
        THROW 51225, 'Fixture ownership markers differ from the exact setup inventory. Cleanup refuses partial, edited, or extra tracked data.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.Users u
        JOIN dbo.SampleDataRecords s
          ON s.TableName = N'Users'
         AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), u.UserID))
        JOIN @FixtureOrganizations o ON o.OrganizationID = s.OrganizationID
        WHERE u.NormalizedEmail NOT IN (
            N'secverify-a-owner@security-fixture.invalid',
            N'secverify-a-viewer@security-fixture.invalid',
            N'secverify-b-owner@security-fixture.invalid',
            N'secverify-b-viewer@security-fixture.invalid'
        )
    )
        THROW 51226, 'A tracked fixture UserID no longer has its reserved synthetic email. Review it manually; no user will be deleted.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.Users u
        JOIN dbo.SampleDataRecords s
          ON s.TableName = N'Users'
         AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), u.UserID))
        JOIN @FixtureOrganizations o ON o.OrganizationID = s.OrganizationID
        JOIN dbo.OrganizationMemberships m ON m.UserID = u.UserID
        WHERE m.OrganizationID NOT IN (@OrganizationAID, @OrganizationBID)
    )
        THROW 51227, 'A fixture user has a membership in another organization. Cleanup refuses to delete or detach that identity.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.Users u
        JOIN dbo.SampleDataRecords s
          ON s.TableName = N'Users'
         AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), u.UserID))
        JOIN @FixtureOrganizations o ON o.OrganizationID = s.OrganizationID
        JOIN dbo.UserIdentities i ON i.UserID = u.UserID
    )
        THROW 51228, 'A fixture user has a linked UserIdentity. Cleanup will not remove or unlink an identity record.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables t
        JOIN sys.schemas sc ON sc.schema_id = t.schema_id
        JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'OrganizationID'
        WHERE sc.name = N'dbo'
          AND t.name <> N'SampleDataRecords'
          AND NOT EXISTS (
              SELECT 1 FROM sys.indexes i
              WHERE i.object_id = t.object_id AND i.is_primary_key = 1
          )
    )
        THROW 51229, 'An OrganizationID table has no primary key, so exact ownership cannot be verified. Review the schema before cleanup.', 1;

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
            OR fk.parent_object_id = OBJECT_ID(N'dbo.UserIdentities')
            OR fk.referenced_object_id = OBJECT_ID(N'dbo.Users')
        )
          AND (fk.is_disabled = 1 OR fk.is_not_trusted = 1)
    )
        THROW 51230, 'A tenant-related foreign key is disabled or untrusted. Cleanup will not risk leaving orphan rows.', 1;

    -- Every row in every OrganizationID-bearing table must have an exact
    -- setup marker whose key matches that table's primary key. This is also
    -- the fail-closed check for records manually added during browser testing.
    DECLARE @TableName sysname;
    DECLARE @KeyExpression nvarchar(max);
    DECLARE @KeyArguments nvarchar(max);
    DECLARE @KeyColumn sysname;
    DECLARE @KeyOrdinal int;
    DECLARE @KeyCount int;
    DECLARE @Sql nvarchar(max);
    DECLARE @HasUntrackedRows bit = 0;
    DECLARE @KeyColumns TABLE (KeyOrdinal int NOT NULL, ColumnName sysname NOT NULL);
    DECLARE ownedTableCursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT t.name
        FROM sys.tables t
        JOIN sys.schemas sc ON sc.schema_id = t.schema_id
        JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'OrganizationID'
        WHERE sc.name = N'dbo'
          AND t.name <> N'SampleDataRecords'
        ORDER BY t.name;

    OPEN ownedTableCursor;
    FETCH NEXT FROM ownedTableCursor INTO @TableName;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        DELETE FROM @KeyColumns;
        INSERT INTO @KeyColumns (KeyOrdinal, ColumnName)
        SELECT ic.key_ordinal, c.name
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID(N'dbo.' + QUOTENAME(@TableName))
          AND i.is_primary_key = 1
          AND ic.key_ordinal > 0;

        SELECT @KeyCount = COUNT(*) FROM @KeyColumns;
        IF @KeyCount = 0
            THROW 51232, 'A tenant table primary key could not be resolved. Cleanup stopped without deleting data.', 1;

        IF @KeyCount = 1
        BEGIN
            SELECT @KeyColumn = ColumnName FROM @KeyColumns;
            SET @KeyExpression =
                N'RTRIM(CONVERT(nvarchar(100), r.' + QUOTENAME(@KeyColumn) + N'))';
        END
        ELSE
        BEGIN
            SET @KeyArguments = N'';
            DECLARE keyColumnCursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT KeyOrdinal, ColumnName FROM @KeyColumns ORDER BY KeyOrdinal;
            OPEN keyColumnCursor;
            FETCH NEXT FROM keyColumnCursor INTO @KeyOrdinal, @KeyColumn;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                IF @KeyArguments <> N'' SET @KeyArguments += N', N'':'' , ';
                SET @KeyArguments += N'RTRIM(CONVERT(nvarchar(100), r.' + QUOTENAME(@KeyColumn) + N'))';
                FETCH NEXT FROM keyColumnCursor INTO @KeyOrdinal, @KeyColumn;
            END;
            CLOSE keyColumnCursor;
            DEALLOCATE keyColumnCursor;
            SET @KeyExpression = N'CONCAT(' + @KeyArguments + N')';
        END;

        SET @Sql = N'
            IF EXISTS (
                SELECT 1
                FROM dbo.' + QUOTENAME(@TableName) + N' r
                WHERE r.OrganizationID IN (@OrganizationAID, @OrganizationBID)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM dbo.SampleDataRecords s
                      WHERE s.OrganizationID = r.OrganizationID
                        AND s.TableName = @TableName
                        AND s.RecordKey = ' + @KeyExpression + N'
                  )
            ) SET @HasUntrackedRows = 1;';

        EXEC sys.sp_executesql
            @Sql,
            N'@OrganizationAID int, @OrganizationBID int, @TableName sysname, @HasUntrackedRows bit OUTPUT',
            @OrganizationAID = @OrganizationAID,
            @OrganizationBID = @OrganizationBID,
            @TableName = @TableName,
            @HasUntrackedRows = @HasUntrackedRows OUTPUT;

        FETCH NEXT FROM ownedTableCursor INTO @TableName;
    END;
    CLOSE ownedTableCursor;
    DEALLOCATE ownedTableCursor;

    IF @HasUntrackedRows = 1
        THROW 51233, 'Untracked or manually added tenant data exists in a fixture organization. Remove/review it manually, then rerun cleanup.', 1;

    -- Delete in the reviewed FK order: documents and bills, projects, history,
    -- personnel and business roles, membership grants, memberships, users,
    -- then the two marked organizations. No dynamic deletes or cascades occur.
    DELETE i
    FROM dbo.Invoices i
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = i.OrganizationID
     AND s.TableName = N'Invoices'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), i.id))
    JOIN @FixtureOrganizations o ON o.OrganizationID = i.OrganizationID;

    DELETE b
    FROM dbo.Bills b
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = b.OrganizationID
     AND s.TableName = N'Bills'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), b.[id]))
    JOIN @FixtureOrganizations o ON o.OrganizationID = b.OrganizationID;

    DELETE p
    FROM dbo.Projects p
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = p.OrganizationID
     AND s.TableName = N'Projects'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), p.ProjectID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = p.OrganizationID;

    DELETE h
    FROM dbo.EmployeeHistory h
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = h.OrganizationID
     AND s.TableName = N'EmployeeHistory'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), h.EmployeeHistoryID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = h.OrganizationID;

    DELETE e
    FROM dbo.Employees e
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = e.OrganizationID
     AND s.TableName = N'Employees'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), e.EmployeeID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = e.OrganizationID;

    DELETE c
    FROM dbo.Customers c
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = c.OrganizationID
     AND s.TableName = N'Customers'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), c.CustomerID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = c.OrganizationID;

    DELETE r
    FROM dbo.Roles r
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = r.OrganizationID
     AND s.TableName = N'Roles'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), r.RoleID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = r.OrganizationID;

    DELETE mar
    FROM dbo.MembershipAccessRoles mar
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = mar.OrganizationID
     AND s.TableName = N'MembershipAccessRoles'
     AND s.RecordKey = CONCAT(mar.MembershipID, N':', mar.AccessRoleID)
    JOIN @FixtureOrganizations o ON o.OrganizationID = mar.OrganizationID;

    DELETE arp
    FROM dbo.AccessRolePermissions arp
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = arp.OrganizationID
     AND s.TableName = N'AccessRolePermissions'
     AND s.RecordKey = CONCAT(arp.OrganizationID, N':', arp.AccessRoleID, N':', arp.PermissionKey)
    JOIN @FixtureOrganizations o ON o.OrganizationID = arp.OrganizationID;

    DELETE m
    FROM dbo.OrganizationMemberships m
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = m.OrganizationID
     AND s.TableName = N'OrganizationMemberships'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), m.MembershipID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = m.OrganizationID;

    DELETE ar
    FROM dbo.AccessRoles ar
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = ar.OrganizationID
     AND s.TableName = N'AccessRoles'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), ar.AccessRoleID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = ar.OrganizationID;

    DELETE u
    FROM dbo.Users u
    JOIN dbo.SampleDataRecords s
      ON s.TableName = N'Users'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), u.UserID))
    JOIN @FixtureOrganizations o ON o.OrganizationID = s.OrganizationID
    WHERE u.NormalizedEmail IN (
        N'secverify-a-owner@security-fixture.invalid',
        N'secverify-a-viewer@security-fixture.invalid',
        N'secverify-b-owner@security-fixture.invalid',
        N'secverify-b-viewer@security-fixture.invalid'
    );

    DELETE org
    FROM dbo.Organizations org
    JOIN dbo.SampleDataRecords s
      ON s.OrganizationID = org.OrganizationID
     AND s.TableName = N'Organizations'
     AND s.RecordKey = RTRIM(CONVERT(nvarchar(100), org.OrganizationID))
    WHERE org.OrganizationKey IN (@OrganizationAKey, @OrganizationBKey);

    DELETE s
    FROM dbo.SampleDataRecords s
    JOIN @FixtureOrganizations o ON o.OrganizationID = s.OrganizationID;

    IF EXISTS (
        SELECT 1 FROM dbo.Organizations
        WHERE OrganizationID IN (@OrganizationAID, @OrganizationBID)
    ) OR EXISTS (
        SELECT 1 FROM dbo.Users
        WHERE NormalizedEmail IN (
            N'secverify-a-owner@security-fixture.invalid',
            N'secverify-a-viewer@security-fixture.invalid',
            N'secverify-b-owner@security-fixture.invalid',
            N'secverify-b-viewer@security-fixture.invalid'
        )
    )
        THROW 51234, 'Fixture organizations or reserved users remain after targeted deletes. Transaction rolled back.', 1;

    COMMIT TRANSACTION;
    PRINT 'The two exact security-verification fixture organizations and their setup-owned rows were removed.';
    PRINT 'No Overhead Demo records, unrelated users, credentials, or non-fixture records were targeted.';
END TRY
BEGIN CATCH
    IF CURSOR_STATUS('local', 'keyColumnCursor') >= 0 CLOSE keyColumnCursor;
    IF CURSOR_STATUS('local', 'keyColumnCursor') > -3 DEALLOCATE keyColumnCursor;
    IF CURSOR_STATUS('local', 'ownedTableCursor') >= 0 CLOSE ownedTableCursor;
    IF CURSOR_STATUS('local', 'ownedTableCursor') > -3 DEALLOCATE ownedTableCursor;
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
