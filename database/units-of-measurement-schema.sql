SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Preserve the manually created table and its presets when adopting this migration.
IF OBJECT_ID(N'dbo.UnitsOfMeasurement', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UnitsOfMeasurement (
        [Unit Name] nchar(20) NOT NULL,
        [Unit Abbreviation] nchar(10) NOT NULL
    ) ON [PRIMARY];
END;
GO

IF DATABASE_PRINCIPAL_ID(N'applicationLogin') IS NOT NULL
BEGIN
    GRANT SELECT ON OBJECT::dbo.UnitsOfMeasurement TO [applicationLogin];
END;
GO
