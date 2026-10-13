SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT OFF;
IF DB_NAME()<>N'centralHubTest' THROW 51050, 'Run this fixture verification only in centralHubTest.', 1;
DECLARE @organizationId int=(SELECT OrganizationID FROM dbo.Organizations WHERE OrganizationKey='contoso-test');
DECLARE @ownerId int=(SELECT UserID FROM dbo.Users WHERE NormalizedEmail='dcrobb29@gmail.com');
IF @organizationId IS NULL OR @ownerId IS NULL THROW 51050, 'Contoso seed is missing.', 1;
IF NOT EXISTS (
    SELECT 1 FROM dbo.OrganizationMemberships m
    JOIN dbo.MembershipAccessRoles mr ON mr.MembershipID=m.MembershipID
    JOIN dbo.AccessRoles r ON r.AccessRoleID=mr.AccessRoleID
    WHERE m.OrganizationID=@organizationId AND m.UserID=@ownerId AND r.RoleKey='Owner' AND m.IsActive=1
) THROW 51050, 'Owner membership seed is incorrect.', 1;
IF EXISTS (SELECT 1 FROM dbo.UserIdentities WHERE UserID=@ownerId)
    THROW 51050, 'Bootstrap unexpectedly created an authentication identity.', 1;
IF NOT EXISTS (
    SELECT 1 FROM dbo.OrganizationSubscriptions s JOIN dbo.SubscriptionPlans p ON p.PlanID=s.PlanID
    WHERE s.OrganizationID=@organizationId AND s.Status='Trial' AND p.IsTestPlan=1
      AND s.ProviderSubscriptionID IS NULL AND s.BillingProvider IS NULL
) THROW 51050, 'Test subscription seed is incorrect.', 1;
PRINT 'PASS: Contoso owner membership and test-only subscription; no fabricated authentication identity.';

DECLARE @table sysname,@sql nvarchar(max),@bad bigint,@tables int=0;
DECLARE ownership CURSOR LOCAL FAST_FORWARD FOR
SELECT t.name FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
WHERE t.schema_id=SCHEMA_ID('dbo') AND c.name='OrganizationID'
  AND t.name NOT IN ('Organizations','OrganizationMemberships','OrganizationSubscriptions','OrganizationEmployeeUsers',
    'AccessRoles','MembershipAccessRoles','AccessRolePermissions');
OPEN ownership;
FETCH NEXT FROM ownership INTO @table;
WHILE @@FETCH_STATUS=0
BEGIN
    SET @sql=N'SELECT @bad=COUNT_BIG(*) FROM dbo.'+QUOTENAME(@table)+N' WHERE OrganizationID<>@organizationId OR OrganizationID IS NULL;';
    EXEC sys.sp_executesql @sql,N'@bad bigint OUTPUT,@organizationId int',@bad OUTPUT,@organizationId;
    IF @bad<>0 THROW 51050, 'Existing business data is not entirely assigned to Contoso.', 1;
    SET @tables+=1;
    FETCH NEXT FROM ownership INTO @table;
END;
CLOSE ownership;
DEALLOCATE ownership;
IF @tables<>31 THROW 51050, 'Expected organization ownership on 31 business tables.', 1;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name LIKE 'FK[_]Tenant[_]%' AND (is_disabled=1 OR is_not_trusted=1))
    THROW 51050, 'An organization-aware foreign key is disabled or untrusted.', 1;
PRINT 'PASS: All 31 business tables belong to Contoso; tenant relationship constraints are enabled and trusted.';

BEGIN TRANSACTION;
BEGIN TRY
    INSERT INTO dbo.Organizations(OrganizationKey,OrganizationName) VALUES('fixture-isolation-check',N'Fabrikam (rollback fixture)');
    DECLARE @otherOrganizationId int=SCOPE_IDENTITY();
    INSERT INTO dbo.OrganizationMemberships(OrganizationID,UserID) VALUES(@otherOrganizationId,@ownerId);
    DECLARE @otherMembership int=SCOPE_IDENTITY();
    INSERT INTO dbo.AccessRoles(OrganizationID,RoleKey,RoleName) VALUES(@otherOrganizationId,'VP',N'Vice President');
    DECLARE @otherRole int=SCOPE_IDENTITY();
    INSERT INTO dbo.MembershipAccessRoles(OrganizationID,MembershipID,AccessRoleID)
    VALUES(@otherOrganizationId,@otherMembership,@otherRole);
    INSERT INTO dbo.AccessRolePermissions(OrganizationID,AccessRoleID,PermissionKey)
    VALUES(@otherOrganizationId,@otherRole,'projects.read');
    IF EXISTS (
        SELECT 1 FROM dbo.MembershipAccessRoles mr JOIN dbo.AccessRoles r ON r.AccessRoleID=mr.AccessRoleID
        WHERE mr.MembershipID=@otherMembership AND r.RoleKey='Owner'
    ) THROW 51050, 'Owner role leaked into another organization membership.', 1;
    PRINT 'PASS: One user can belong to multiple organizations with different roles.';
    INSERT INTO dbo.AccessRoles(OrganizationID,RoleKey,RoleName) VALUES(@organizationId,'VP',N'Vice President');
    DECLARE @contosoRole int=SCOPE_IDENTITY();
    INSERT INTO dbo.AccessRolePermissions(OrganizationID,AccessRoleID,PermissionKey)
    VALUES(@organizationId,@contosoRole,'projects.read'),(@organizationId,@contosoRole,'projects.write');
    IF EXISTS (SELECT 1 FROM dbo.AccessRolePermissions WHERE OrganizationID=@otherOrganizationId AND AccessRoleID=@otherRole AND PermissionKey='projects.write')
        THROW 51050, 'Same-named role inherited permissions from another organization.', 1;
    PRINT 'PASS: Vice President is read-only in one organization and read/write in another.';

    DECLARE @roleRejected bit=0;
    BEGIN TRY
        INSERT INTO dbo.MembershipAccessRoles(OrganizationID,MembershipID,AccessRoleID)
        VALUES(@otherOrganizationId,@otherMembership,@contosoRole);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER()<>547 THROW;
        SET @roleRejected=1;
    END CATCH;
    IF @roleRejected=0 THROW 51050, 'A role from another organization was accepted.', 1;
    PRINT 'PASS: Access roles cannot be assigned across organizations.';

    INSERT INTO dbo.Customers(OrganizationID,FirstName) VALUES(@organizationId,N'Contoso rollback customer');
    DECLARE @customerId int=SCOPE_IDENTITY(),@rejected bit=0;
    BEGIN TRY
        INSERT INTO dbo.Projects(OrganizationID,ProjectName,ProjectStatus,CustomerID)
        VALUES(@otherOrganizationId,N'Invalid cross-organization fixture','Upcoming',@customerId);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER()<>547 THROW;
        SET @rejected=1;
    END CATCH;
    IF @rejected=0 THROW 51050, 'Cross-organization customer link was accepted.', 1;
    PRINT 'PASS: Projects cannot reference another organization customer.';

    INSERT INTO dbo.Employees(OrganizationID,EmployeeName,RoleID)
    SELECT @organizationId,N'Contoso rollback employee',RoleID FROM dbo.Roles WHERE RoleID=(SELECT MIN(RoleID) FROM dbo.Roles);
    IF @@ROWCOUNT<>1 THROW 51050, 'Employee role fixture is unavailable.', 1;
    DECLARE @employeeId int=SCOPE_IDENTITY();
    SET @rejected=0;
    BEGIN TRY
        INSERT INTO dbo.OrganizationEmployeeUsers(OrganizationID,EmployeeID,MembershipID)
        VALUES(@otherOrganizationId,@employeeId,@otherMembership);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER()<>547 THROW;
        SET @rejected=1;
    END CATCH;
    IF @rejected=0 THROW 51050, 'Cross-organization employee login link was accepted.', 1;
    PRINT 'PASS: Employee/login links must belong to the same organization.';
    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

BEGIN TRANSACTION;
BEGIN TRY
    UPDATE dbo.Customers SET OrganizationID=OrganizationID WHERE CustomerID=(SELECT MIN(CustomerID) FROM dbo.Customers);
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW 51050, 'Organization ownership update unexpectedly succeeded.', 1;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    IF ERROR_NUMBER()<>51050 OR ERROR_MESSAGE()<>'Business record organization ownership cannot be changed.' THROW;
    PRINT 'PASS: Business record organization ownership is immutable.';
END CATCH;
IF EXISTS (SELECT 1 FROM dbo.Organizations WHERE OrganizationKey='fixture-isolation-check')
    THROW 51050, 'Rollback fixture was left behind.', 1;
PRINT 'Organization foundation verification passed. All fixture changes rolled back.';
