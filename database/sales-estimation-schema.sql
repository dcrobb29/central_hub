SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID(N'dbo.Estimates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Estimates (
        EstimateID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Estimates PRIMARY KEY,
        EstimateName nvarchar(150) NOT NULL,
        CustomerName nvarchar(150) NULL,
        EstimateStatus varchar(16) NOT NULL CONSTRAINT DF_Estimates_Status DEFAULT 'Draft',
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Estimates_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Estimates_Status CHECK (EstimateStatus IN ('Draft', 'Won', 'Lost'))
    );
END;
GO

IF OBJECT_ID(N'dbo.EstimateRevisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EstimateRevisions (
        EstimateRevisionID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_EstimateRevisions PRIMARY KEY,
        EstimateID int NOT NULL,
        RevisionNumber int NOT NULL,
        MarkupMode varchar(16) NOT NULL,
        EstimateMarkupPercent decimal(9,4) NOT NULL CONSTRAINT DF_EstimateRevisions_Markup DEFAULT 0,
        TaxAmount decimal(19,2) NOT NULL CONSTRAINT DF_EstimateRevisions_Tax DEFAULT 0,
        FreightAmount decimal(19,2) NOT NULL CONSTRAINT DF_EstimateRevisions_Freight DEFAULT 0,
        RoundingIncrement decimal(19,2) NOT NULL CONSTRAINT DF_EstimateRevisions_Rounding DEFAULT 0,
        QuotedTotal decimal(19,2) NOT NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_EstimateRevisions_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_EstimateRevisions_Estimates FOREIGN KEY (EstimateID) REFERENCES dbo.Estimates(EstimateID),
        CONSTRAINT UQ_EstimateRevisions_Number UNIQUE (EstimateID, RevisionNumber),
        CONSTRAINT CK_EstimateRevisions_MarkupMode CHECK (MarkupMode IN ('perLine', 'estimate')),
        CONSTRAINT CK_EstimateRevisions_Rounding CHECK (RoundingIncrement IN (0, 1, 10, 100))
    );
END;
GO

IF OBJECT_ID(N'dbo.EstimateLineItems', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EstimateLineItems (
        EstimateLineItemID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_EstimateLineItems PRIMARY KEY,
        EstimateRevisionID int NOT NULL,
        LineNumber int NOT NULL,
        Description nvarchar(300) NOT NULL,
        Quantity decimal(19,4) NOT NULL,
        UnitName nvarchar(30) NULL,
        UnitCost decimal(19,4) NOT NULL,
        LineMarkupPercent decimal(9,4) NOT NULL CONSTRAINT DF_EstimateLineItems_Markup DEFAULT 0,
        CONSTRAINT FK_EstimateLineItems_Revisions FOREIGN KEY (EstimateRevisionID)
            REFERENCES dbo.EstimateRevisions(EstimateRevisionID),
        CONSTRAINT UQ_EstimateLineItems_Line UNIQUE (EstimateRevisionID, LineNumber),
        CONSTRAINT CK_EstimateLineItems_Quantity CHECK (Quantity > 0),
        CONSTRAINT CK_EstimateLineItems_UnitCost CHECK (UnitCost >= 0),
        CONSTRAINT CK_EstimateLineItems_Markup CHECK (LineMarkupPercent >= 0)
    );
END;
GO

IF COL_LENGTH(N'dbo.Projects', N'AcceptedEstimateRevisionID') IS NULL
    ALTER TABLE dbo.Projects ADD AcceptedEstimateRevisionID int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Projects_AcceptedEstimateRevision')
BEGIN
    ALTER TABLE dbo.Projects
        ADD CONSTRAINT FK_Projects_AcceptedEstimateRevision
        FOREIGN KEY (AcceptedEstimateRevisionID) REFERENCES dbo.EstimateRevisions(EstimateRevisionID);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Projects') AND name = N'UX_Projects_AcceptedEstimateRevision')
    CREATE UNIQUE INDEX UX_Projects_AcceptedEstimateRevision
        ON dbo.Projects(AcceptedEstimateRevisionID)
        WHERE AcceptedEstimateRevisionID IS NOT NULL;
GO

IF COL_LENGTH(N'dbo.Projects', N'ProjectStatus') IS NULL
BEGIN
    ALTER TABLE dbo.Projects
        ADD ProjectStatus varchar(24) NOT NULL
        CONSTRAINT DF_Projects_ProjectStatus DEFAULT 'Planning' WITH VALUES;
END;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Estimates TO [applicationLogin];
    GRANT SELECT, INSERT ON OBJECT::dbo.EstimateRevisions TO [applicationLogin];
    GRANT SELECT, INSERT ON OBJECT::dbo.EstimateLineItems TO [applicationLogin];
    GRANT INSERT, UPDATE ON OBJECT::dbo.Projects TO [applicationLogin];
END;
GO
