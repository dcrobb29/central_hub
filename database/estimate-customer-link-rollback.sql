SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Estimates_Customers_Organization')
    ALTER TABLE dbo.Estimates DROP CONSTRAINT FK_Estimates_Customers_Organization;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Estimates') AND name = N'IX_Estimates_CustomerID')
    DROP INDEX IX_Estimates_CustomerID ON dbo.Estimates;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Customers') AND name = N'UX_Customers_Organization_Customer')
    DROP INDEX UX_Customers_Organization_Customer ON dbo.Customers;
IF COL_LENGTH(N'dbo.Estimates', N'CustomerID') IS NOT NULL
    ALTER TABLE dbo.Estimates DROP COLUMN CustomerID;
IF COL_LENGTH(N'dbo.Estimates', N'CustomerAddressSnapshot') IS NOT NULL
    ALTER TABLE dbo.Estimates DROP COLUMN CustomerAddressSnapshot;

COMMIT TRANSACTION;
