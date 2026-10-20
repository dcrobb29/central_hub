import { getPool, sql } from "./db";
import { defaultAppearance, parseAppearance, type Appearance } from "./appearance";

export async function getAppearance(userId: number): Promise<Appearance> {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId)
    .query<{ PreferencesJson: string }>("SELECT PreferencesJson FROM dbo.UserAppearancePreferences WHERE UserID = @userId");
  if (!result.recordset.length) return defaultAppearance();
  const preferences = parseAppearance(JSON.parse(result.recordset[0].PreferencesJson));
  if (!preferences) throw new Error("Stored appearance preferences are invalid.");
  return preferences;
}

export async function saveAppearance(userId: number, preferences: Appearance): Promise<void> {
  const pool = await getPool();
  await pool.request().input("userId", sql.Int, userId)
    .input("preferences", sql.NVarChar(2000), JSON.stringify(preferences))
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      UPDATE dbo.UserAppearancePreferences WITH (UPDLOCK, SERIALIZABLE)
        SET PreferencesJson = @preferences, UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @userId;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.UserAppearancePreferences (UserID, PreferencesJson) VALUES (@userId, @preferences);
      COMMIT TRANSACTION;
    `);
}
