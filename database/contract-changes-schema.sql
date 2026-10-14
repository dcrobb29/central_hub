SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.Estimates','DocumentKind') IS NULL
    ALTER TABLE dbo.Estimates ADD DocumentKind varchar(16) NOT NULL DEFAULT 'Base'
      CHECK (DocumentKind IN ('Base','Alternate','ChangeOrder'));
IF COL_LENGTH('dbo.EstimateLineItems','LineOperation') IS NULL
    ALTER TABLE dbo.EstimateLineItems ADD LineOperation varchar(8) NOT NULL DEFAULT 'Add'
      CHECK (LineOperation IN ('Add','Deduct')), DeductLineID int NULL,
      SellAmount decimal(19,2) NULL, LandedAmount decimal(19,2) NULL;
IF OBJECT_ID('dbo.ContractChanges','U') IS NULL
CREATE TABLE dbo.ContractChanges(
    ChangeID int IDENTITY PRIMARY KEY,
    OrganizationID int NOT NULL REFERENCES dbo.Organizations(OrganizationID),
    DocumentEstimateID int NOT NULL UNIQUE REFERENCES dbo.Estimates(EstimateID),
    ParentEstimateID int NOT NULL REFERENCES dbo.Estimates(EstimateID),
    ProjectID int NULL REFERENCES dbo.Projects(ProjectID),
    Kind varchar(16) NOT NULL CHECK (Kind IN ('Alternate','ChangeOrder')),
    Status varchar(16) NOT NULL DEFAULT 'Draft' CHECK (Status IN ('Draft','Proposed','Approved','Rejected')),
    Version int NOT NULL DEFAULT 1,
    SourceAlternateID int NULL REFERENCES dbo.ContractChanges(ChangeID),
    ApprovedAt date NULL,
    ApprovalReference nvarchar(500) NULL,
    ApprovedByUserID int NULL REFERENCES dbo.Users(UserID),
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CHECK (Status<>'Approved' OR (ProjectID IS NOT NULL AND ApprovedAt IS NOT NULL
      AND ApprovalReference IS NOT NULL AND ApprovedByUserID IS NOT NULL))
);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ContractChanges') AND name='IX_Changes_Parent')
    CREATE INDEX IX_Changes_Parent ON dbo.ContractChanges(OrganizationID,ParentEstimateID,ProjectID);
IF COL_LENGTH('dbo.ContractChanges','ContractBeforeAmount') IS NULL
    ALTER TABLE dbo.ContractChanges ADD ContractBeforeAmount decimal(19,2) NULL,ContractAfterAmount decimal(19,2) NULL;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ContractChanges') AND name='UX_Changes_Source')
    CREATE UNIQUE INDEX UX_Changes_Source ON dbo.ContractChanges(SourceAlternateID) WHERE SourceAlternateID IS NOT NULL;
IF OBJECT_ID('dbo.ContractChangeDeductions','U') IS NULL
CREATE TABLE dbo.ContractChangeDeductions(
    ChangeID int NOT NULL REFERENCES dbo.ContractChanges(ChangeID),
    EstimateLineItemID int NOT NULL REFERENCES dbo.EstimateLineItems(EstimateLineItemID),
    BillingScopeID int NOT NULL REFERENCES dbo.ProjectBillingScopes(BillingScopeID),
    Quantity decimal(19,4) NOT NULL CHECK (Quantity>0),
    SellAmount decimal(19,2) NOT NULL CHECK (SellAmount>=0),
    LandedAmount decimal(19,2) NOT NULL CHECK (LandedAmount>=0),
    PRIMARY KEY(ChangeID,EstimateLineItemID)
);
COMMIT;
GO
CREATE OR ALTER VIEW dbo.EffectiveProjectBillingUnits AS
SELECT u.BillingUnitID,u.ProjectID,u.ServiceVisitID,u.SourceRevisionID,u.CompletionStatus,u.OrganizationID,
    u.ContractValue+COALESCE((SELECT SUM(r.QuotedTotal) FROM dbo.ContractChanges c
      JOIN dbo.EstimateRevisions r ON r.EstimateID=c.DocumentEstimateID
      WHERE c.ProjectID=u.ProjectID AND c.Status='Approved'),0) AS ContractValue
FROM dbo.ProjectBillingUnits u;
GO
CREATE OR ALTER VIEW dbo.EffectiveProjectBillingScopes AS
SELECT s.BillingScopeID,s.BillingUnitID,s.SourceScopeID,s.ScopeName,s.SortOrder,s.CompletionStatus,s.OrganizationID,
    s.ContractValue-COALESCE((SELECT SUM(d.SellAmount) FROM dbo.ContractChangeDeductions d
      JOIN dbo.ContractChanges c ON c.ChangeID=d.ChangeID
      WHERE d.BillingScopeID=s.BillingScopeID AND c.Status='Approved'),0) AS ContractValue
FROM dbo.ProjectBillingScopes s;
GO
CREATE OR ALTER VIEW dbo.EffectiveProjectEstimateLines AS
WITH sources AS (
 SELECT p.ProjectID,li.EstimateLineItemID,li.EstimateRevisionID,p.OrganizationID,CAST(NULL AS int) AS ChangeID
 FROM dbo.Projects p JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID=p.AcceptedEstimateRevisionID
 UNION ALL
 SELECT c.ProjectID,li.EstimateLineItemID,li.EstimateRevisionID,c.OrganizationID,c.ChangeID
 FROM dbo.ContractChanges c JOIN dbo.EstimateRevisions r ON r.EstimateID=c.DocumentEstimateID
 JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID=r.EstimateRevisionID
 WHERE c.Status='Approved' AND li.LineOperation='Add'
)
SELECT x.ProjectID,x.OrganizationID,x.ChangeID,li.EstimateLineItemID,li.EstimateRevisionID,li.EstimateScopeOfWorkID,
 li.Description,li.LineType,li.LineNumber,li.UnitName,li.UnitCost,li.LineMarkupPercent,r.TaxPercent,
 li.Quantity-COALESCE(d.Quantity,0) AS Quantity,
 CONVERT(decimal(19,2),COALESCE(li.LandedAmount,
   ROUND(li.Quantity*li.UnitCost,2)+ROUND(li.FreightAmount,2)+
   ROUND((ROUND(li.Quantity*li.UnitCost,2)+ROUND(li.FreightAmount,2))*r.TaxPercent/100,2))-COALESCE(d.LandedAmount,0)) AS LandedCostAmount,
 CONVERT(decimal(19,4),li.FreightAmount*(li.Quantity-COALESCE(d.Quantity,0))/li.Quantity) AS FreightAmount
FROM sources x JOIN dbo.EstimateLineItems li ON li.EstimateLineItemID=x.EstimateLineItemID
JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=li.EstimateRevisionID
OUTER APPLY(SELECT SUM(d.Quantity) AS Quantity,SUM(d.LandedAmount) AS LandedAmount FROM dbo.ContractChangeDeductions d
 JOIN dbo.ContractChanges c ON c.ChangeID=d.ChangeID
 WHERE d.EstimateLineItemID=li.EstimateLineItemID AND c.Status='Approved') d;
GO
CREATE OR ALTER TRIGGER dbo.TR_ContractChanges_Approved ON dbo.ContractChanges AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted WHERE Status='Approved')
   THROW 51042,'Approved contract changes are immutable; issue a new change order.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ContractChangeDeductions_Locked ON dbo.ContractChangeDeductions AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT ChangeID FROM inserted UNION SELECT ChangeID FROM deleted) x
   JOIN dbo.ContractChanges c ON c.ChangeID=x.ChangeID WHERE c.Status='Approved')
   THROW 51042,'Approved deduction history is immutable.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ChangeEstimate_Locked ON dbo.Estimates AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d JOIN dbo.ContractChanges c ON c.DocumentEstimateID=d.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change documents are immutable.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ChangeRevision_Locked ON dbo.EstimateRevisions AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT EstimateID FROM inserted UNION SELECT EstimateID FROM deleted) x
   JOIN dbo.ContractChanges c ON c.DocumentEstimateID=x.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change pricing is immutable.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ChangeLine_Locked ON dbo.EstimateLineItems AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT EstimateRevisionID FROM inserted UNION SELECT EstimateRevisionID FROM deleted) x
   JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=x.EstimateRevisionID
   JOIN dbo.ContractChanges c ON c.DocumentEstimateID=r.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change lines are immutable.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_ChangeScope_Locked ON dbo.EstimateScopesOfWork AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT EstimateRevisionID FROM inserted UNION SELECT EstimateRevisionID FROM deleted) x
   JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=x.EstimateRevisionID
   JOIN dbo.ContractChanges c ON c.DocumentEstimateID=r.EstimateID WHERE c.Status='Approved')
   THROW 51042,'Approved change scopes are immutable.',1;
END;
GO
-- Preserve the existing allocation protections, changing only the budget source.
DECLARE @definition nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID('dbo.TR_BillingAllocations_Validate'));
IF @definition IS NULL THROW 51042,'Apply project billing migrations before contract changes.',1;
SET @definition=N'ALTER '+SUBSTRING(@definition,CHARINDEX('TRIGGER',UPPER(@definition)),LEN(@definition));
SET @definition=REPLACE(@definition,'>s.ContractValue',
 '>(SELECT ContractValue FROM dbo.EffectiveProjectBillingScopes WHERE BillingScopeID=s.BillingScopeID)');
SET @definition=REPLACE(@definition,'>u.ContractValue',
 '>(SELECT ContractValue FROM dbo.EffectiveProjectBillingUnits WHERE BillingUnitID=u.BillingUnitID)');
EXEC sp_executesql @definition;
GO
IF DATABASE_PRINCIPAL_ID('applicationLogin') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT,UPDATE,DELETE ON dbo.ContractChanges TO applicationLogin;
 GRANT SELECT,INSERT,UPDATE,DELETE ON dbo.ContractChangeDeductions TO applicationLogin;
 GRANT SELECT ON dbo.EffectiveProjectBillingUnits TO applicationLogin;
 GRANT SELECT ON dbo.EffectiveProjectBillingScopes TO applicationLogin;
 GRANT SELECT ON dbo.EffectiveProjectEstimateLines TO applicationLogin;
END;
