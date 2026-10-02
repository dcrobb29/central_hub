SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Preset "scope of work" bundles (e.g. "Pavers w/ 1in setting bed, per SF"). An estimator picks a
-- template, enters one top-level quantity in the template's own unit, and every component below
-- is pre-scaled by its QuantityPerUnit ratio and inserted as a new scope + its line items in one
-- shot. This mirrors how these crews actually built their old bids: the SF of pavers drove the
-- gravel, sand, pavers, and labor quantities together. Applying a template is a one-time stamp —
-- once inserted, the resulting lines are ordinary, independently editable estimate lines with no
-- further link back to the template (consistent with how catalog materials snapshot their price
-- at entry rather than staying live-linked).
IF OBJECT_ID(N'dbo.ScopeTemplates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ScopeTemplates (
        ScopeTemplateID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScopeTemplates PRIMARY KEY,
        TemplateName nvarchar(150) NOT NULL,
        UnitName nvarchar(30) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_ScopeTemplates_IsActive DEFAULT 1,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_ScopeTemplates_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ScopeTemplates') AND name = N'IX_ScopeTemplates_TemplateName')
    CREATE INDEX IX_ScopeTemplates_TemplateName ON dbo.ScopeTemplates(TemplateName);
GO

-- One row per component that gets stamped into the estimate when the template is applied.
-- QuantityPerUnit is the ratio to the template's own top-level unit (e.g. 0.083 tons of gravel
-- per SF of pavers). MaterialID is optional — only used to prefill a cost from the Materials
-- catalog when building the template; UnitCost is stored independently so edits to the catalog
-- later never silently change an existing template.
IF OBJECT_ID(N'dbo.ScopeTemplateComponents', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ScopeTemplateComponents (
        ScopeTemplateComponentID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScopeTemplateComponents PRIMARY KEY,
        ScopeTemplateID int NOT NULL,
        Description nvarchar(300) NOT NULL,
        LineType varchar(16) NOT NULL,
        QuantityPerUnit decimal(19,6) NOT NULL,
        UnitName nvarchar(30) NULL,
        UnitCost decimal(19,4) NOT NULL,
        MaterialID int NULL,
        SortOrder int NOT NULL CONSTRAINT DF_ScopeTemplateComponents_SortOrder DEFAULT 0,
        CONSTRAINT FK_ScopeTemplateComponents_ScopeTemplates FOREIGN KEY (ScopeTemplateID)
            REFERENCES dbo.ScopeTemplates(ScopeTemplateID),
        CONSTRAINT FK_ScopeTemplateComponents_Materials FOREIGN KEY (MaterialID)
            REFERENCES dbo.Materials(MaterialID),
        CONSTRAINT CK_ScopeTemplateComponents_LineType CHECK (LineType IN ('Material', 'Labor', 'Equipment')),
        CONSTRAINT CK_ScopeTemplateComponents_QuantityPerUnit CHECK (QuantityPerUnit >= 0),
        CONSTRAINT CK_ScopeTemplateComponents_UnitCost CHECK (UnitCost >= 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ScopeTemplateComponents') AND name = N'IX_ScopeTemplateComponents_ScopeTemplateID')
    CREATE INDEX IX_ScopeTemplateComponents_ScopeTemplateID ON dbo.ScopeTemplateComponents(ScopeTemplateID, SortOrder);
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ScopeTemplates TO [applicationLogin];
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.ScopeTemplateComponents TO [applicationLogin];
END;
GO
