-- =============================================================================
-- Rollback: Sample Data Tracking Table
-- =============================================================================

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'SampleDataRecords'
)
BEGIN
    DROP TABLE dbo.SampleDataRecords;
END
GO
