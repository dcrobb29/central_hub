SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Rename legacy internal-only notes so existing text is never made customer-facing.
IF COL_LENGTH(N'dbo.Estimates', N'InternalNotes') IS NULL
BEGIN
    IF COL_LENGTH(N'dbo.Estimates', N'Notes') IS NOT NULL
        EXEC sys.sp_rename N'dbo.Estimates.Notes', N'InternalNotes', N'COLUMN';
    ELSE
        ALTER TABLE dbo.Estimates ADD InternalNotes nvarchar(4000) NULL;
END;

IF COL_LENGTH(N'dbo.Estimates', N'CustomerNotes') IS NULL
    ALTER TABLE dbo.Estimates ADD CustomerNotes nvarchar(4000) NULL;

IF COL_LENGTH(N'dbo.Projects', N'InternalNotes') IS NULL
BEGIN
    IF COL_LENGTH(N'dbo.Projects', N'Notes') IS NOT NULL
        EXEC sys.sp_rename N'dbo.Projects.Notes', N'InternalNotes', N'COLUMN';
    ELSE
        ALTER TABLE dbo.Projects ADD InternalNotes nvarchar(4000) NULL;
END;

IF COL_LENGTH(N'dbo.Projects', N'CustomerNotes') IS NULL
    ALTER TABLE dbo.Projects ADD CustomerNotes nvarchar(4000) NULL;

COMMIT TRANSACTION;
GO
