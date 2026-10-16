SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.Estimates WHERE EstimateStatus = 'Sent')
    THROW 51033, 'Change Sent estimates to Draft or Lost before rolling back estimate statuses.', 1;

ALTER TABLE dbo.Estimates DROP CONSTRAINT CK_Estimates_Status;
ALTER TABLE dbo.Estimates WITH CHECK ADD CONSTRAINT CK_Estimates_Status
    CHECK (EstimateStatus IN ('Draft', 'Won', 'Lost'));

COMMIT TRANSACTION;
GO
