-- Remove the OrganizationID = 1 bootstrap defaults captured by azure-sql-baseline.sql.
-- This changes defaults only; it does not update or migrate existing rows.
-- Review the target database before running. The baseline tables and columns below
-- are checked first, and the entire migration runs transactionally.
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @targets TABLE (TableName sysname PRIMARY KEY);
  INSERT INTO @targets (TableName) VALUES
    (N'AccessRoles'),
    (N'Bills'),
    (N'Customers'),
    (N'EmployeeHistory'),
    (N'Employees'),
    (N'Equipment'),
    (N'EstimateLineItems'),
    (N'EstimateRevisions'),
    (N'Estimates'),
    (N'EstimateScopesOfWork'),
    (N'FieldOperationsTaskAssignments'),
    (N'FieldOperationsTasks'),
    (N'Invoices'),
    (N'MaterialPrices'),
    (N'Materials'),
    (N'MembershipAccessRoles'),
    (N'ProjectActualCosts'),
    (N'ProjectBillCosts'),
    (N'ProjectBillingMilestones'),
    (N'ProjectBillingScopes'),
    (N'ProjectBillingSettings'),
    (N'ProjectBillingUnits'),
    (N'ProjectInvoiceAllocations'),
    (N'ProjectIssuedInvoices'),
    (N'ProjectLineItemProgress'),
    (N'ProjectResourceAssignments'),
    (N'Projects'),
    (N'Roles'),
    (N'Routes'),
    (N'ScopeTemplateComponents'),
    (N'ScopeTemplates'),
    (N'ServiceVisits'),
    (N'UnitsOfMeasurement');

  IF EXISTS (
    SELECT 1
    FROM @targets t
    WHERE OBJECT_ID(N'dbo.' + QUOTENAME(t.TableName), N'U') IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM sys.columns c
         WHERE c.object_id = OBJECT_ID(N'dbo.' + QUOTENAME(t.TableName))
           AND c.name = N'OrganizationID'
       )
  )
    THROW 51060, 'The expected azure-sql-baseline OrganizationID schema is not present; no defaults were removed.', 1;

  DECLARE @table sysname;
  DECLARE @constraint sysname;
  DECLARE @definition nvarchar(max);
  DECLARE defaults_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT TableName FROM @targets ORDER BY TableName;

  OPEN defaults_cursor;
  FETCH NEXT FROM defaults_cursor INTO @table;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @constraint = NULL;
    SET @definition = NULL;
    SELECT @constraint = dc.name, @definition = dc.definition
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.' + QUOTENAME(@table))
      AND c.name = N'OrganizationID';

    IF @constraint IS NOT NULL
    BEGIN
      IF REPLACE(REPLACE(REPLACE(REPLACE(@definition, N'(', N''), N')', N''), N' ', N''), NCHAR(9), N'') <> N'1'
        THROW 51061, 'An OrganizationID default is not the reviewed value 1; no defaults were removed.', 1;

      EXEC(N'ALTER TABLE dbo.' + QUOTENAME(@table) + N' DROP CONSTRAINT ' + QUOTENAME(@constraint) + N';');
    END;

    FETCH NEXT FROM defaults_cursor INTO @table;
  END;
  CLOSE defaults_cursor;
  DEALLOCATE defaults_cursor;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF CURSOR_STATUS('local', 'defaults_cursor') >= 0 CLOSE defaults_cursor;
  IF CURSOR_STATUS('local', 'defaults_cursor') > -3 DEALLOCATE defaults_cursor;
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
