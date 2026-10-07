SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF COL_LENGTH(N'dbo.Projects', N'ProjectStatus') IS NULL
    ALTER TABLE dbo.Projects ADD ProjectStatus varchar(24) NOT NULL
        CONSTRAINT DF_Projects_ProjectStatus DEFAULT 'Upcoming' WITH VALUES;
GO

UPDATE dbo.Projects SET ProjectStatus = 'Upcoming' WHERE ProjectStatus = 'Planning';
UPDATE dbo.Projects SET ProjectStatus = 'Complete' WHERE ProjectStatus = 'Completed';
IF EXISTS (SELECT 1 FROM dbo.Projects WHERE ProjectStatus NOT IN ('Upcoming', 'Active', 'Complete') OR ProjectStatus IS NULL)
    THROW 51031, 'Unknown project status found. Review it before applying the status migration.', 1;
ALTER TABLE dbo.Projects ALTER COLUMN ProjectStatus varchar(24) NOT NULL;
GO

DECLARE @defaultName sysname = (
    SELECT d.name FROM sys.default_constraints d
    JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    WHERE d.parent_object_id = OBJECT_ID(N'dbo.Projects') AND c.name = N'ProjectStatus'
);
IF @defaultName IS NOT NULL
BEGIN
    DECLARE @dropDefault nvarchar(max) = N'ALTER TABLE dbo.Projects DROP CONSTRAINT ' + QUOTENAME(@defaultName);
    EXEC sys.sp_executesql @dropDefault;
END;
ALTER TABLE dbo.Projects ADD CONSTRAINT DF_Projects_ProjectStatus DEFAULT 'Upcoming' FOR ProjectStatus;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Projects_ProjectStatus')
    ALTER TABLE dbo.Projects ADD CONSTRAINT CK_Projects_ProjectStatus CHECK (ProjectStatus IN ('Upcoming', 'Active', 'Complete'));
GO

-- Reopening changes only status. All other fields of a completed job stay frozen.
DECLARE @columns nvarchar(max) = (
    SELECT STRING_AGG(CAST(QUOTENAME(name) AS nvarchar(max)), ',')
    FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name <> 'ProjectStatus' AND is_computed = 0
);
DECLARE @trigger nvarchar(max) = N'
CREATE OR ALTER TRIGGER dbo.TR_Projects_CompletedReadOnly ON dbo.Projects AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.ProjectID = d.ProjectID
        WHERE d.ProjectStatus = ''Complete'' AND (
            i.ProjectID IS NULL OR i.ProjectStatus NOT IN (''Complete'', ''Active'')
            OR EXISTS (SELECT ' + @columns + N' FROM deleted WHERE ProjectID = d.ProjectID
                       EXCEPT SELECT ' + @columns + N' FROM inserted WHERE ProjectID = d.ProjectID))
    )
        THROW 51030, ''This job is Complete and read-only. Reopen it to Active in Project Management before making changes.'', 1;
END';
EXEC sys.sp_executesql @trigger;
GO

-- Cover all existing job data, checking both old and new ownership so reassignment
-- cannot bypass the lock. HOLDLOCK serializes these checks with status updates.
DECLARE @targets TABLE (TableName sysname, ProjectJoin nvarchar(max));
INSERT INTO @targets VALUES
    ('Bills', 'p.ProjectID = c.ProjectID OR p.ProjectID IN (SELECT bc.ProjectID FROM dbo.ProjectBillCosts bc WHERE bc.BillID = c.id AND bc.IsActive = 1)'),
    ('Invoices', 'p.ProjectID = c.ProjectID'),
    ('ProjectBillCosts', 'p.ProjectID = c.ProjectID'),
    ('ProjectActualCosts', 'p.ProjectID = c.ProjectID'),
    ('ProjectResourceAssignments', 'p.ProjectID = c.ProjectID'),
    ('ProjectBillingMilestones', 'p.ProjectID = c.ProjectID'),
    ('ServiceVisits', 'p.ProjectID = c.ProjectID'),
    ('FieldOperationsTasks', 'p.ProjectID IN (SELECT v.ProjectID FROM dbo.ServiceVisits v WHERE v.ServiceVisitID = c.ServiceVisitID)'),
    ('FieldOperationsTaskAssignments', 'p.ProjectID IN (SELECT v.ProjectID FROM dbo.FieldOperationsTasks t JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID WHERE t.FieldOperationsTaskID = c.FieldOperationsTaskID)'),
    ('ProjectLineItemProgress', 'p.AcceptedEstimateRevisionID IN (SELECT li.EstimateRevisionID FROM dbo.EstimateLineItems li WHERE li.EstimateLineItemID = c.EstimateLineItemID)'),
    ('EstimateLineItems', 'p.AcceptedEstimateRevisionID = c.EstimateRevisionID'),
    ('EstimateScopesOfWork', 'p.AcceptedEstimateRevisionID = c.EstimateRevisionID'),
    ('EstimateRevisions', 'p.AcceptedEstimateRevisionID = c.EstimateRevisionID'),
    ('Estimates', 'p.AcceptedEstimateRevisionID IN (SELECT r.EstimateRevisionID FROM dbo.EstimateRevisions r WHERE r.EstimateID = c.EstimateID)');

DECLARE @table sysname, @join nvarchar(max), @sql nvarchar(max);
DECLARE targets CURSOR LOCAL FAST_FORWARD FOR SELECT TableName, ProjectJoin FROM @targets;
OPEN targets;
FETCH NEXT FROM targets INTO @table, @join;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(N'dbo.' + @table, N'U') IS NOT NULL
    BEGIN
        SET @sql = N'CREATE OR ALTER TRIGGER dbo.' + QUOTENAME(N'TR_' + @table + N'_CompletedProjectReadOnly')
            + N' ON dbo.' + QUOTENAME(@table) + N' AFTER INSERT, UPDATE, DELETE AS
            BEGIN
                SET NOCOUNT ON;
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON ' + @join + N' WHERE p.ProjectStatus = ''Complete'')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON ' + @join + N' WHERE p.ProjectStatus = ''Complete'')
                    THROW 51030, ''This job is Complete and read-only. Reopen it to Active in Project Management before making changes.'', 1;
            ';
        IF @table IN ('ServiceVisits', 'FieldOperationsTasks', 'FieldOperationsTaskAssignments')
            SET @sql += N'
                IF EXISTS (SELECT 1 FROM inserted c JOIN dbo.Projects p WITH (HOLDLOCK) ON ' + @join + N' WHERE p.ProjectStatus <> ''Active'')
                   OR EXISTS (SELECT 1 FROM deleted c JOIN dbo.Projects p WITH (HOLDLOCK) ON ' + @join + N' WHERE p.ProjectStatus <> ''Active'')
                    THROW 51032, ''Only Active jobs can be assigned or changed in the weekly planner. Set this job to Active in Project Management first.'', 1;
            ';
        SET @sql += N'END';
        EXEC sys.sp_executesql @sql;
    END;
    FETCH NEXT FROM targets INTO @table, @join;
END;
CLOSE targets;
DEALLOCATE targets;
GO
