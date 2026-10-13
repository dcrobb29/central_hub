SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME()<>N'centralHubTest'
    THROW 51050, 'This Contoso bootstrap is for centralHubTest only. Review tenant onboarding before applying to another database.', 1;
BEGIN TRANSACTION;

-- Single-organization bootstrap only. Authentication and row isolation must
-- replace the bootstrap defaults before another organization uses the app.
IF OBJECT_ID(N'dbo.Organizations',N'U') IS NULL
CREATE TABLE dbo.Organizations (
    OrganizationID int IDENTITY PRIMARY KEY,
    OrganizationKey varchar(80) NOT NULL UNIQUE,
    OrganizationName nvarchar(150) NOT NULL,
    Status varchar(16) NOT NULL DEFAULT 'Trial' CHECK (Status IN ('Trial','Active','Suspended','Archived')),
    CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CHECK (LEN(LTRIM(RTRIM(OrganizationName)))>0)
);
IF OBJECT_ID(N'dbo.Users',N'U') IS NULL
CREATE TABLE dbo.Users (
    UserID int IDENTITY PRIMARY KEY,
    Email nvarchar(254) NOT NULL,
    NormalizedEmail AS LOWER(LTRIM(RTRIM(Email))) PERSISTED,
    DisplayName nvarchar(150) NOT NULL,
    IsActive bit NOT NULL DEFAULT 1,
    CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CHECK (LEN(LTRIM(RTRIM(Email)))>0),
    CONSTRAINT UX_Users_Email UNIQUE (NormalizedEmail)
);
IF OBJECT_ID(N'dbo.UserIdentities',N'U') IS NULL
CREATE TABLE dbo.UserIdentities (
    UserIdentityID int IDENTITY PRIMARY KEY,
    UserID int NOT NULL REFERENCES dbo.Users(UserID),
    Issuer nvarchar(200) NOT NULL,
    Subject nvarchar(200) NOT NULL,
    CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (Issuer,Subject),
    CHECK (LEN(LTRIM(RTRIM(Issuer)))>0 AND LEN(LTRIM(RTRIM(Subject)))>0)
);
-- Existing dbo.Roles describes employee job titles, not application access.
IF OBJECT_ID(N'dbo.AccessRoles',N'U') IS NULL
CREATE TABLE dbo.AccessRoles (
    AccessRoleID int IDENTITY PRIMARY KEY,
    RoleKey varchar(32) NOT NULL UNIQUE,
    RoleName nvarchar(80) NOT NULL
);
IF OBJECT_ID(N'dbo.OrganizationMemberships',N'U') IS NULL
CREATE TABLE dbo.OrganizationMemberships (
    MembershipID int IDENTITY PRIMARY KEY,
    OrganizationID int NOT NULL REFERENCES dbo.Organizations(OrganizationID),
    UserID int NOT NULL REFERENCES dbo.Users(UserID),
    IsActive bit NOT NULL DEFAULT 1,
    CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE (OrganizationID,UserID),
    UNIQUE (OrganizationID,MembershipID)
);
IF OBJECT_ID(N'dbo.MembershipAccessRoles',N'U') IS NULL
CREATE TABLE dbo.MembershipAccessRoles (
    MembershipID int NOT NULL REFERENCES dbo.OrganizationMemberships(MembershipID),
    AccessRoleID int NOT NULL REFERENCES dbo.AccessRoles(AccessRoleID),
    PRIMARY KEY (MembershipID,AccessRoleID)
);
IF OBJECT_ID(N'dbo.SubscriptionPlans',N'U') IS NULL
CREATE TABLE dbo.SubscriptionPlans (
    PlanID int IDENTITY PRIMARY KEY,
    PlanKey varchar(32) NOT NULL UNIQUE,
    PlanName nvarchar(100) NOT NULL,
    IsTestPlan bit NOT NULL DEFAULT 0
);
IF OBJECT_ID(N'dbo.OrganizationSubscriptions',N'U') IS NULL
CREATE TABLE dbo.OrganizationSubscriptions (
    OrganizationSubscriptionID int IDENTITY PRIMARY KEY,
    OrganizationID int NOT NULL UNIQUE REFERENCES dbo.Organizations(OrganizationID),
    PlanID int NOT NULL REFERENCES dbo.SubscriptionPlans(PlanID),
    Status varchar(16) NOT NULL CHECK (Status IN ('Trial','Active','PastDue','Canceled')),
    SeatLimit int NULL CHECK (SeatLimit>0),
    TrialEndsAt datetime2(0) NULL,
    BillingProvider varchar(32) NULL,
    ProviderSubscriptionID nvarchar(200) NULL,
    CreatedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CHECK ((BillingProvider IS NULL AND ProviderSubscriptionID IS NULL)
        OR (BillingProvider IS NOT NULL AND ProviderSubscriptionID IS NOT NULL))
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.OrganizationSubscriptions') AND name='UX_OrganizationSubscriptions_Provider')
CREATE UNIQUE INDEX UX_OrganizationSubscriptions_Provider
    ON dbo.OrganizationSubscriptions(BillingProvider,ProviderSubscriptionID) WHERE ProviderSubscriptionID IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.Organizations WHERE OrganizationKey='contoso-test')
    INSERT INTO dbo.Organizations(OrganizationKey,OrganizationName) VALUES('contoso-test',N'Contoso');
DECLARE @organizationId int=(SELECT OrganizationID FROM dbo.Organizations WHERE OrganizationKey='contoso-test');

-- Access roles are organization-defined. Their names carry no intrinsic power.
IF COL_LENGTH(N'dbo.AccessRoles',N'OrganizationID') IS NULL
BEGIN
    DECLARE @roleOwnership nvarchar(max)=N'ALTER TABLE dbo.AccessRoles ADD OrganizationID int NOT NULL
      CONSTRAINT DF_AccessRoles_BootstrapOrganization DEFAULT '+CONVERT(nvarchar(12),@organizationId)+N' WITH VALUES;';
    EXEC sys.sp_executesql @roleOwnership;
END;
IF COL_LENGTH(N'dbo.MembershipAccessRoles',N'OrganizationID') IS NULL
BEGIN
    DECLARE @assignmentOwnership nvarchar(max)=N'ALTER TABLE dbo.MembershipAccessRoles ADD OrganizationID int NOT NULL
      CONSTRAINT DF_MembershipAccessRoles_BootstrapOrganization DEFAULT '+CONVERT(nvarchar(12),@organizationId)+N' WITH VALUES;';
    EXEC sys.sp_executesql @assignmentOwnership;
END;
GO
DECLARE @organizationId int=(SELECT OrganizationID FROM dbo.Organizations WHERE OrganizationKey='contoso-test');
DECLARE @globalRoleKey sysname=(
    SELECT TOP(1) kc.name FROM sys.key_constraints kc
    WHERE kc.parent_object_id=OBJECT_ID('dbo.AccessRoles') AND kc.type='UQ'
      AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id AND ic.key_ordinal>0)=1
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
        WHERE ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id AND c.name='RoleKey')
);
IF @globalRoleKey IS NOT NULL
BEGIN
    DECLARE @dropGlobalRole nvarchar(max)=N'ALTER TABLE dbo.AccessRoles DROP CONSTRAINT '+QUOTENAME(@globalRoleKey);
    EXEC sys.sp_executesql @dropGlobalRole;
END;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_AccessRoles_Organization')
    ALTER TABLE dbo.AccessRoles ADD CONSTRAINT FK_AccessRoles_Organization FOREIGN KEY(OrganizationID) REFERENCES dbo.Organizations(OrganizationID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.AccessRoles') AND name='UX_AccessRoles_OrganizationKey')
    CREATE UNIQUE INDEX UX_AccessRoles_OrganizationKey ON dbo.AccessRoles(OrganizationID,RoleKey);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.AccessRoles') AND name='UX_AccessRoles_OrganizationRole')
    CREATE UNIQUE INDEX UX_AccessRoles_OrganizationRole ON dbo.AccessRoles(OrganizationID,AccessRoleID);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_MembershipAccessRoles_OrganizationMembership')
    ALTER TABLE dbo.MembershipAccessRoles ADD CONSTRAINT FK_MembershipAccessRoles_OrganizationMembership
        FOREIGN KEY(OrganizationID,MembershipID) REFERENCES dbo.OrganizationMemberships(OrganizationID,MembershipID);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_MembershipAccessRoles_OrganizationRole')
    ALTER TABLE dbo.MembershipAccessRoles ADD CONSTRAINT FK_MembershipAccessRoles_OrganizationRole
        FOREIGN KEY(OrganizationID,AccessRoleID) REFERENCES dbo.AccessRoles(OrganizationID,AccessRoleID);
IF OBJECT_ID(N'dbo.Permissions',N'U') IS NULL
CREATE TABLE dbo.Permissions (
    PermissionKey varchar(64) NOT NULL PRIMARY KEY,
    Description nvarchar(150) NOT NULL
);
IF OBJECT_ID(N'dbo.AccessRolePermissions',N'U') IS NULL
CREATE TABLE dbo.AccessRolePermissions (
    OrganizationID int NOT NULL,
    AccessRoleID int NOT NULL,
    PermissionKey varchar(64) NOT NULL REFERENCES dbo.Permissions(PermissionKey),
    PRIMARY KEY(OrganizationID,AccessRoleID,PermissionKey),
    FOREIGN KEY(OrganizationID,AccessRoleID) REFERENCES dbo.AccessRoles(OrganizationID,AccessRoleID)
);
INSERT INTO dbo.Permissions(PermissionKey,Description)
SELECT PermissionKey,Description FROM (VALUES
    ('customers.read',N'View business customers'),('customers.write',N'Manage business customers'),
    ('sales.read',N'View leads and estimates'),('sales.write',N'Manage leads and estimates'),
    ('projects.read',N'View projects and completion'),('projects.write',N'Manage projects and completion'),
    ('planning.read',N'View scheduling'),('planning.write',N'Manage scheduling and assignments'),
    ('finances.read',N'View bills and invoices'),('finances.write',N'Manage bills and invoices'),
    ('personnel.read',N'View employees and equipment'),('personnel.write',N'Manage employees and equipment'),
    ('catalogs.read',N'View catalogs and templates'),('catalogs.write',N'Manage catalogs and templates'),
    ('organization.manage',N'Manage organization settings'),('members.manage',N'Manage memberships and access roles'),
    ('subscription.manage',N'Manage SaaS subscription')
) p(PermissionKey,Description) WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions known WHERE known.PermissionKey=p.PermissionKey);

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE NormalizedEmail='dcrobb29@gmail.com')
    INSERT INTO dbo.Users(Email,DisplayName) VALUES(N'dcrobb29@gmail.com',N'Contoso Owner');
DECLARE @userId int=(SELECT UserID FROM dbo.Users WHERE NormalizedEmail='dcrobb29@gmail.com');
IF NOT EXISTS (SELECT 1 FROM dbo.OrganizationMemberships WHERE OrganizationID=@organizationId AND UserID=@userId)
    INSERT INTO dbo.OrganizationMemberships(OrganizationID,UserID) VALUES(@organizationId,@userId);
DECLARE @membershipId int=(SELECT MembershipID FROM dbo.OrganizationMemberships WHERE OrganizationID=@organizationId AND UserID=@userId);
INSERT INTO dbo.AccessRoles(OrganizationID,RoleKey,RoleName)
SELECT @organizationId,RoleKey,RoleName FROM (VALUES
    ('Owner',N'Owner'),('Admin',N'Administrator'),('ProjectManager',N'Project manager'),
    ('Finance',N'Finance'),('Field',N'Field personnel'),('Viewer',N'Viewer')
) r(RoleKey,RoleName) WHERE NOT EXISTS (SELECT 1 FROM dbo.AccessRoles a WHERE a.RoleKey=r.RoleKey AND a.OrganizationID=@organizationId);
IF NOT EXISTS (SELECT 1 FROM dbo.MembershipAccessRoles WHERE MembershipID=@membershipId
    AND AccessRoleID=(SELECT AccessRoleID FROM dbo.AccessRoles WHERE RoleKey='Owner' AND OrganizationID=@organizationId))
    INSERT INTO dbo.MembershipAccessRoles(OrganizationID,MembershipID,AccessRoleID)
    SELECT @organizationId,@membershipId,AccessRoleID FROM dbo.AccessRoles WHERE RoleKey='Owner' AND OrganizationID=@organizationId;
-- Only bootstrap the initial owner's grants once. Reruns never undo deliberate
-- permission changes, and other role names grant nothing until configured.
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class=1 AND major_id=OBJECT_ID('dbo.AccessRolePermissions') AND name='ContosoPermissionsSeeded')
BEGIN
    INSERT INTO dbo.AccessRolePermissions(OrganizationID,AccessRoleID,PermissionKey)
    SELECT @organizationId,r.AccessRoleID,p.PermissionKey FROM dbo.AccessRoles r CROSS JOIN dbo.Permissions p
    WHERE r.OrganizationID=@organizationId AND r.RoleKey='Owner';
    EXEC sys.sp_addextendedproperty @name=N'ContosoPermissionsSeeded',@value=N'Owner bootstrap only',
        @level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'AccessRolePermissions';
END;
IF NOT EXISTS (SELECT 1 FROM dbo.SubscriptionPlans WHERE PlanKey='test-trial')
    INSERT INTO dbo.SubscriptionPlans(PlanKey,PlanName,IsTestPlan) VALUES('test-trial',N'Test trial (no purchased license)',1);
IF NOT EXISTS (SELECT 1 FROM dbo.OrganizationSubscriptions WHERE OrganizationID=@organizationId)
    INSERT INTO dbo.OrganizationSubscriptions(OrganizationID,PlanID,Status)
    SELECT @organizationId,PlanID,'Trial' FROM dbo.SubscriptionPlans WHERE PlanKey='test-trial';

DECLARE @tables TABLE (TableName sysname PRIMARY KEY, BeforeCount bigint NULL, BeforeChecksum int NULL);
INSERT INTO @tables(TableName) VALUES
 ('Bills'),('Customers'),('EmployeeHistory'),('Employees'),('Equipment'),('EstimateLineItems'),
 ('EstimateRevisions'),('Estimates'),('EstimateScopesOfWork'),('FieldOperationsTaskAssignments'),
 ('FieldOperationsTasks'),('Invoices'),('MaterialPrices'),('Materials'),('ProjectActualCosts'),
 ('ProjectBillCosts'),('ProjectBillingMilestones'),('ProjectBillingScopes'),('ProjectBillingSettings'),
 ('ProjectBillingUnits'),('ProjectInvoiceAllocations'),('ProjectIssuedInvoices'),('ProjectLineItemProgress'),
 ('ProjectResourceAssignments'),('Projects'),('Roles'),('Routes'),('ScopeTemplateComponents'),
 ('ScopeTemplates'),('ServiceVisits'),('UnitsOfMeasurement');
IF EXISTS (SELECT 1 FROM @tables WHERE OBJECT_ID(N'dbo.'+TableName,N'U') IS NULL)
    THROW 51050, 'Apply existing business schemas before the organization foundation migration.', 1;
IF EXISTS (
    SELECT 1 FROM sys.tables t WHERE t.schema_id=SCHEMA_ID('dbo') AND t.is_ms_shipped=0
    AND NOT EXISTS (SELECT 1 FROM @tables x WHERE x.TableName=t.name)
    AND t.name NOT IN ('Organizations','Users','UserIdentities','AccessRoles','OrganizationMemberships',
      'MembershipAccessRoles','SubscriptionPlans','OrganizationSubscriptions','OrganizationEmployeeUsers','Permissions','AccessRolePermissions')
) THROW 51050, 'Unclassified business table found. Review organization ownership before migrating.', 1;

DECLARE @table sysname,@sql nvarchar(max),@columns nvarchar(max),@count bigint,@checksum int;
DECLARE ownedTables CURSOR LOCAL FAST_FORWARD FOR SELECT TableName FROM @tables ORDER BY TableName;
OPEN ownedTables;
FETCH NEXT FROM ownedTables INTO @table;
WHILE @@FETCH_STATUS=0
BEGIN
    SELECT @columns=STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(name)),',') WITHIN GROUP (ORDER BY column_id)
      FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.'+@table) AND name<>'OrganizationID' AND is_computed=0;
    SET @sql=N'SELECT @count=COUNT_BIG(*),@checksum=CHECKSUM_AGG(BINARY_CHECKSUM('+@columns+N')) FROM dbo.'+QUOTENAME(@table)+N' WITH(TABLOCKX,HOLDLOCK)';
    EXEC sys.sp_executesql @sql,N'@count bigint OUTPUT,@checksum int OUTPUT',@count OUTPUT,@checksum OUTPUT;
    UPDATE @tables SET BeforeCount=@count,BeforeChecksum=@checksum WHERE TableName=@table;
    IF COL_LENGTH(N'dbo.'+@table,N'OrganizationID') IS NULL
    BEGIN
        -- ADD WITH VALUES assigns existing records without invoking frozen-history
        -- UPDATE triggers. The named defaults are explicitly temporary.
        SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ADD OrganizationID int NOT NULL CONSTRAINT '
          +QUOTENAME(N'DF_'+@table+N'_BootstrapOrganization')+N' DEFAULT '+CONVERT(nvarchar(12),@organizationId)+N' WITH VALUES;';
        EXEC sys.sp_executesql @sql;
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_'+@table+N'_Organization')
    BEGIN
        SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' WITH CHECK ADD CONSTRAINT '
          +QUOTENAME(N'FK_'+@table+N'_Organization')+N' FOREIGN KEY(OrganizationID) REFERENCES dbo.Organizations(OrganizationID);';
        EXEC sys.sp_executesql @sql;
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.'+@table) AND name=N'IX_'+@table+N'_Organization')
    BEGIN
        SET @sql=N'CREATE INDEX '+QUOTENAME(N'IX_'+@table+N'_Organization')+N' ON dbo.'+QUOTENAME(@table)+N'(OrganizationID);';
        EXEC sys.sp_executesql @sql;
    END;
    SET @sql=N'CREATE OR ALTER TRIGGER dbo.'+QUOTENAME(N'TR_'+@table+N'_OrganizationImmutable')+
      N' ON dbo.'+QUOTENAME(@table)+N' AFTER UPDATE AS
      BEGIN SET NOCOUNT ON;
        IF UPDATE(OrganizationID) THROW 51050, ''Business record organization ownership cannot be changed.'', 1;
      END;';
    EXEC sys.sp_executesql @sql;
    SET @sql=N'SELECT @count=COUNT_BIG(*),@checksum=CHECKSUM_AGG(BINARY_CHECKSUM('+@columns+N')) FROM dbo.'+QUOTENAME(@table)+N';';
    EXEC sys.sp_executesql @sql,N'@count bigint OUTPUT,@checksum int OUTPUT',@count OUTPUT,@checksum OUTPUT;
    IF EXISTS (SELECT 1 FROM @tables WHERE TableName=@table AND
        (BeforeCount<>@count OR ISNULL(BeforeChecksum,0)<>ISNULL(@checksum,0)))
        THROW 51050, 'Business data preservation verification failed. Migration rolled back.', 1;
    FETCH NEXT FROM ownedTables INTO @table;
END;
CLOSE ownedTables;
DEALLOCATE ownedTables;

-- Keep original foreign keys and add organization-aware counterparts. This
-- protects relationships, but is not a substitute for read/write row isolation.
DECLARE @foreignKeys TABLE (FKName sysname PRIMARY KEY, ChildTable sysname, ParentTable sysname, ChildColumns nvarchar(max), ParentColumns nvarchar(max));
INSERT INTO @foreignKeys
SELECT fk.name,ct.name,pt.name,
    STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(cc.name)),',') WITHIN GROUP (ORDER BY fc.constraint_column_id),
    STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(pc.name)),',') WITHIN GROUP (ORDER BY fc.constraint_column_id)
FROM sys.foreign_keys fk
JOIN sys.tables ct ON ct.object_id=fk.parent_object_id JOIN @tables c ON c.TableName=ct.name
JOIN sys.tables pt ON pt.object_id=fk.referenced_object_id JOIN @tables p ON p.TableName=pt.name
JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
JOIN sys.columns cc ON cc.object_id=ct.object_id AND cc.column_id=fc.parent_column_id
JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fc.referenced_column_id
WHERE fk.name NOT LIKE 'FK[_]Tenant[_]%'
GROUP BY fk.name,ct.name,pt.name;
DECLARE @fk sysname,@child sysname,@parent sysname,@childColumns nvarchar(max),@parentColumns nvarchar(max);
DECLARE tenantKeys CURSOR LOCAL FAST_FORWARD FOR SELECT FKName,ChildTable,ParentTable,ChildColumns,ParentColumns FROM @foreignKeys ORDER BY FKName;
OPEN tenantKeys;
FETCH NEXT FROM tenantKeys INTO @fk,@child,@parent,@childColumns,@parentColumns;
WHILE @@FETCH_STATUS=0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.'+@parent) AND name=N'UX_Tenant_'+@fk)
    BEGIN
        SET @sql=N'CREATE UNIQUE INDEX '+QUOTENAME(N'UX_Tenant_'+@fk)+N' ON dbo.'+QUOTENAME(@parent)+N'(OrganizationID,'+@parentColumns+N');';
        EXEC sys.sp_executesql @sql;
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_Tenant_'+@fk)
    BEGIN
        SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@child)+N' WITH CHECK ADD CONSTRAINT '+QUOTENAME(N'FK_Tenant_'+@fk)
          +N' FOREIGN KEY(OrganizationID,'+@childColumns+N') REFERENCES dbo.'+QUOTENAME(@parent)+N'(OrganizationID,'+@parentColumns+N');';
        EXEC sys.sp_executesql @sql;
    END;
    FETCH NEXT FROM tenantKeys INTO @fk,@child,@parent,@childColumns,@parentColumns;
END;
CLOSE tenantKeys;
DEALLOCATE tenantKeys;

IF OBJECT_ID(N'dbo.OrganizationEmployeeUsers',N'U') IS NULL
BEGIN
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Employees') AND name='UX_Employees_OrganizationEmployee')
    CREATE UNIQUE INDEX UX_Employees_OrganizationEmployee ON dbo.Employees(OrganizationID,EmployeeID);
CREATE TABLE dbo.OrganizationEmployeeUsers (
    OrganizationID int NOT NULL,
    EmployeeID int NOT NULL,
    MembershipID int NOT NULL,
    PRIMARY KEY (OrganizationID,EmployeeID),
    UNIQUE (OrganizationID,MembershipID),
    FOREIGN KEY (OrganizationID,EmployeeID) REFERENCES dbo.Employees(OrganizationID,EmployeeID),
    FOREIGN KEY (OrganizationID,MembershipID) REFERENCES dbo.OrganizationMemberships(OrganizationID,MembershipID)
);
END;
COMMIT TRANSACTION;
PRINT 'Contoso foundation ready. No authentication, paid subscription, role enforcement or row isolation is enabled.';
