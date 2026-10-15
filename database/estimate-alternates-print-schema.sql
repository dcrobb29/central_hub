SET XACT_ABORT ON;
IF COL_LENGTH(N'dbo.Estimates', N'ShowAlternates') IS NULL
BEGIN
    ALTER TABLE dbo.Estimates ADD ShowAlternates bit NOT NULL
        CONSTRAINT DF_Estimates_ShowAlternates DEFAULT 1 WITH VALUES;
END;
