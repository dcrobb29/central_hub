-- =============================================================================
-- Migration: Sample Data Tracking Table
-- Purpose: Safely track every inserted sample data record by OrganizationID
--          so that "Exclude Sample Data" can perform a 100% clean and surgical
--          removal without touching real user records.
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'SampleDataRecords'
)
BEGIN
    CREATE TABLE dbo.SampleDataRecords (
        SampleRecordID int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        OrganizationID int NOT NULL,
        TableName nvarchar(80) NOT NULL,
        RecordKey nvarchar(100) NOT NULL,
        CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE NONCLUSTERED INDEX IX_SampleDataRecords_Org_Table
    ON dbo.SampleDataRecords (OrganizationID, TableName);

    CREATE NONCLUSTERED INDEX IX_SampleDataRecords_Org_Key
    ON dbo.SampleDataRecords (OrganizationID, TableName, RecordKey);
END
GO

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.SampleDataRecords TO applicationLogin;
GRANT DELETE, SELECT, INSERT, UPDATE ON SCHEMA::dbo TO applicationLogin;
GO
