SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;

-- Estimates keep CustomerName as the display-name snapshot and gain a customer link plus a billing-address snapshot.
IF COL_LENGTH(N'dbo.Estimates', N'CustomerID') IS NULL
    ALTER TABLE dbo.Estimates ADD CustomerID int NULL;
IF COL_LENGTH(N'dbo.Estimates', N'CustomerAddressSnapshot') IS NULL
    ALTER TABLE dbo.Estimates ADD CustomerAddressSnapshot nvarchar(600) NULL;

-- Composite key so an estimate can only reference a customer in its own organization.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Customers') AND name = N'UX_Customers_Organization_Customer')
    CREATE UNIQUE INDEX UX_Customers_Organization_Customer ON dbo.Customers(OrganizationID, CustomerID);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Estimates_Customers_Organization')
    ALTER TABLE dbo.Estimates ADD CONSTRAINT FK_Estimates_Customers_Organization
        FOREIGN KEY (OrganizationID, CustomerID) REFERENCES dbo.Customers(OrganizationID, CustomerID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Estimates') AND name = N'IX_Estimates_CustomerID')
    CREATE INDEX IX_Estimates_CustomerID ON dbo.Estimates(OrganizationID, CustomerID);

-- The columns above are new, so the backfill runs as dynamic SQL and compiles after they exist.
-- Existing estimates link only when the saved name matches exactly one customer in the same organization;
-- existing unapproved alternates and change orders take their parent contract's customer when they have none yet.
-- Approved change documents are immutable (TR_ChangeEstimate_Locked) and are intentionally left untouched.
EXEC (N'
DECLARE @links TABLE (EstimateID int PRIMARY KEY, CustomerID int NOT NULL);
WITH Names AS (
    SELECT c.OrganizationID, c.CustomerID, LOWER(LTRIM(RTRIM(n.Name))) AS Name
    FROM dbo.Customers c
    CROSS APPLY (VALUES
        (c.CompanyName),
        (LTRIM(RTRIM(CONCAT(c.FirstName, N'' '', c.LastName)))),
        (CASE WHEN c.CompanyName IS NOT NULL
              THEN CONCAT(c.CompanyName, N'' - '', LTRIM(RTRIM(CONCAT(c.FirstName, N'' '', c.LastName)))) END)
    ) n(Name)
    WHERE n.Name IS NOT NULL AND LTRIM(RTRIM(n.Name)) <> N''''
), Distinct_ AS (
    SELECT DISTINCT OrganizationID, CustomerID, Name FROM Names
), Unique_ AS (
    SELECT OrganizationID, Name, MIN(CustomerID) AS CustomerID
    FROM Distinct_ GROUP BY OrganizationID, Name HAVING COUNT(*) = 1
)
INSERT INTO @links (EstimateID, CustomerID)
SELECT e.EstimateID, u.CustomerID
FROM dbo.Estimates e
JOIN Unique_ u ON u.OrganizationID = e.OrganizationID AND u.Name = LOWER(LTRIM(RTRIM(e.CustomerName)))
WHERE e.CustomerID IS NULL AND e.CustomerName IS NOT NULL;

UPDATE e SET CustomerID = l.CustomerID
FROM dbo.Estimates e JOIN @links l ON l.EstimateID = e.EstimateID;

SELECT COUNT(*) AS EstimatesLinked FROM @links;

UPDATE d SET CustomerID = p.CustomerID,
    CustomerName = p.CustomerName,
    CustomerAddressSnapshot = p.CustomerAddressSnapshot
FROM dbo.ContractChanges c
JOIN dbo.Estimates d ON d.EstimateID = c.DocumentEstimateID
JOIN dbo.Estimates p ON p.EstimateID = c.ParentEstimateID AND p.OrganizationID = d.OrganizationID
WHERE d.CustomerID IS NULL AND d.CustomerName IS NULL AND p.CustomerID IS NOT NULL
  AND c.Status <> N''Approved'';

SELECT @@ROWCOUNT AS ChangeDocumentsLinked;
');

COMMIT TRANSACTION;
