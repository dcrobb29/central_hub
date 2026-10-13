SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.ProjectAttachments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectAttachments (
        AttachmentID int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        OrganizationID int NOT NULL,
        ProjectID int NOT NULL,
        Category varchar(12) NOT NULL CHECK (Category IN ('document', 'media')),
        FileName nvarchar(255) NOT NULL,
        StorageKey varchar(80) NOT NULL UNIQUE,
        ContentType varchar(150) NOT NULL,
        SizeBytes bigint NOT NULL CHECK (SizeBytes > 0),
        UploadedByUserID int NOT NULL REFERENCES dbo.Users(UserID),
        UploadedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        IsArchived bit NOT NULL DEFAULT 0,
        CONSTRAINT FK_ProjectAttachments_Project FOREIGN KEY (OrganizationID, ProjectID)
            REFERENCES dbo.Projects(OrganizationID, ProjectID)
    );
    CREATE INDEX IX_ProjectAttachments_Project
        ON dbo.ProjectAttachments(OrganizationID, ProjectID, Category, IsArchived, AttachmentID DESC);
END;

IF USER_ID('applicationLogin') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.ProjectAttachments TO applicationLogin;

COMMIT;
