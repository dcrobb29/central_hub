SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.Estimates') AND name = N'CK_Estimates_Status')
    ALTER TABLE dbo.Estimates DROP CONSTRAINT CK_Estimates_Status;

ALTER TABLE dbo.Estimates WITH CHECK ADD CONSTRAINT CK_Estimates_Status
    CHECK (EstimateStatus IN ('Draft', 'Sent', 'Won', 'Lost'));

COMMIT TRANSACTION;
GO
